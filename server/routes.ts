import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { log } from "./index";
import { sendEditedImageNotification } from "./email";

const COMMON_PASSWORD = 'duolin';

// Use memory storage for serverless compatibility (Vercel has read-only filesystem)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { 
    fileSize: 1 * 1024 * 1024, // 1MB limit for both client and admin uploads
    fieldSize: 1 * 1024 * 1024 
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
    }
  }
});

import { v2 as cloudinary } from 'cloudinary';

// Configure Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

async function uploadToCloudinary(buffer: Buffer): Promise<string> {
  return new Promise((resolve, reject) => {
    const uploadStream = cloudinary.uploader.upload_stream(
      { folder: 'bg_remover_portal' },
      (error, result) => {
        if (error) return reject(error);
        if (!result) return reject(new Error('Cloudinary upload failed'));
        resolve(result.secure_url);
      }
    );
    uploadStream.end(buffer);
  });
}

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  app.post('/api/auth/login', async (req, res) => {
    try {
      const { employeeId, password } = req.body;
      
      if (!employeeId || !password) {
        return res.status(400).json({ message: 'Employee ID and password are required' });
      }

      if (password !== COMMON_PASSWORD) {
        return res.status(401).json({ message: 'Invalid password' });
      }

      const employee = await storage.getEmployeeByEmployeeId(String(employeeId));
      if (!employee) {
        return res.status(401).json({ message: 'Employee ID not found. Please contact your administrator.' });
      }

      let user = await storage.getUserByEmployeeId(String(employeeId));
      
      if (!user) {
        user = await storage.createUser({
          employeeId: String(employeeId),
          displayName: employee.displayName,
          role: 'user',
        });
      }

      res.json({ 
        message: 'Login successful',
        user: {
          id: user._id?.toString(),
          employeeId: user.employeeId,
          displayName: user.displayName,
          role: user.role,
        }
      });
    } catch (error: any) {
      log(`Error in login: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to login' });
    }
  });

  app.post('/api/images/upload', upload.single('image'), async (req, res) => {
    try {
      if (!req.file) {
        return res.status(400).json({ message: 'No image file provided' });
      }

      const { userId, employeeId, displayName } = req.body;

      if (!userId || !employeeId || !displayName) {
        return res.status(400).json({ message: 'User information is required' });
      }

      // Upload to Cloudinary instead of storing Base64
      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer);
      
      const uniqueId = nanoid(10);
      const ext = path.extname(req.file.originalname);
      const generatedFilename = `${Date.now()}-${uniqueId}${ext}`;

      const imageRequest = await storage.createImageRequest({
        userId,
        employeeId,
        displayName,
        originalFileName: req.file.originalname,
        originalFilePath: cloudinaryUrl, // Store URL
        originalContentType: req.file.mimetype,
        status: 'pending',
      });

      res.json({
        message: 'Image uploaded successfully',
        request: {
          id: imageRequest._id?.toString(),
          status: imageRequest.status,
          uploadedAt: imageRequest.uploadedAt,
          url: cloudinaryUrl,
        }
      });
    } catch (error: any) {
      log(`Error in image upload: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to upload image' });
    }
  });

  app.get('/api/images/user/:userId', async (req, res) => {
    try {
      const { userId } = req.params;
      const requests = await storage.getImageRequestsByUserId(userId);
      
      res.json({
        requests: requests.map(r => ({
          id: r._id?.toString(),
          originalFileName: r.originalFileName,
          originalFilePath: r.originalFilePath,
          editedFileName: r.editedFileName,
          editedFilePath: r.editedFilePath,
          status: r.status,
          uploadedAt: r.uploadedAt,
          completedAt: r.completedAt,
        }))
      });
    } catch (error: any) {
      log(`Error fetching user requests: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  // New route: Download by request ID from MongoDB
  app.get('/api/images/download-by-id/:requestId/:type', async (req, res) => {
    try {
      const { requestId, type } = req.params;
      
      log(`Download by ID request - requestId: ${requestId}, type: ${type}`, 'info');
      
      if (type !== 'original' && type !== 'edited') {
        return res.status(400).json({ message: 'Invalid image type' });
      }

      const imageRequest = await storage.getImageRequestById(requestId);
      
      if (!imageRequest) {
        return res.status(404).json({ message: 'Image request not found' });
      }

      let fileContent: string | undefined;
      let contentType: string | undefined;
      let fileName: string;

      if (type === 'original') {
        fileContent = imageRequest.originalFileContent;
        contentType = imageRequest.originalContentType;
        fileName = imageRequest.originalFileName;
      } else {
        fileContent = imageRequest.editedFileContent;
        contentType = imageRequest.editedContentType;
        fileName = imageRequest.editedFileName || 'edited-image';
      }

      if (!fileContent) {
        // Redirect to Cloudinary URL if available
        const filePath = type === 'original' ? imageRequest.originalFilePath : imageRequest.editedFilePath;
        if (filePath && filePath.startsWith('http')) {
          log(`Redirecting to Cloudinary URL for request ${requestId}, type: ${type}: ${filePath}`, 'info');
          return res.redirect(filePath);
        }
        
        // Fallback to local file
        if (filePath && !filePath.startsWith('http') && fs.existsSync(filePath)) {
          log(`Downloading local file for request ${requestId}, type: ${type}: ${filePath}`, 'info');
          return res.download(filePath);
        }
        log(`Image file not found for request ${requestId}, type: ${type}. DB path: ${filePath}`, 'error');
        return res.status(404).json({ 
          message: 'This image was uploaded before the storage system was updated. The file content is no longer available. Please re-upload the image.' 
        });
      }

      const buffer = Buffer.from(fileContent, 'base64');
      res.setHeader('Content-Type', contentType || 'application/octet-stream');
      res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);
      res.send(buffer);
    } catch (error: any) {
      log(`Error downloading file by ID: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to download file' });
    }
  });

  // Legacy route: Download by filename from local storage (kept for backward compatibility)
  app.get('/api/images/download/:type/:filename', (req, res) => {
    try {
      const { type } = req.params;
      let { filename } = req.params;
      
      filename = decodeURIComponent(filename);
      
      log(`Legacy download request - type: ${type}, filename: ${filename}`, 'info');
      
      if (type !== 'original' && type !== 'edited') {
        return res.status(400).json({ message: 'Invalid image type' });
      }

      const filePath = path.join(process.cwd(), 'uploads', type, filename);
      
      if (!fs.existsSync(filePath)) {
        log(`File not found locally: ${filePath}`, 'error');
        return res.status(404).json({ 
          message: 'File not found. Please use the new download endpoint with request ID.',
          requestedFile: filename,
          type: type
        });
      }
      
      res.download(filePath);
    } catch (error: any) {
      log(`Error downloading file: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to download file' });
    }
  });

  app.get('/api/admin/requests', async (req, res) => {
    const limit = Math.min(parseInt(req.query.limit as string) || 10, 50);
    const offset = parseInt(req.query.offset as string) || 0;
    const cacheKey = `admin_requests_${limit}_${offset}`;
    
    // Use an object for global cache if it doesn't exist
    if (!(global as any).adminCache) (global as any).adminCache = {};
    const cached = (global as any).adminCache[cacheKey];
    
    // Check if cache is still valid (1 minute instead of 30s)
    if (cached && Date.now() - cached.timestamp < 60000) {
      log(`[cache] Serving admin requests from cache for key: ${cacheKey}`, 'info');
      return res.json(cached.data);
    }

    try {
      // Direct storage call with minimal overhead
      const result = await storage.getAllImageRequests(limit, offset);
      
      const responseData = { 
        requests: result.requests.map((r: any) => ({
          id: r._id?.toString(),
          userId: r.userId,
          employeeId: r.employeeId,
          displayName: r.displayName,
          originalFileName: r.originalFileName,
          originalFilePath: r.originalFilePath,
          editedFileName: r.editedFileName,
          editedFilePath: r.editedFilePath,
          status: r.status,
          uploadedAt: r.uploadedAt,
          completedAt: r.completedAt,
        })),
        total: result.total,
        uniqueUsers: result.uniqueUsers,
        pendingCount: result.pendingCount,
        completedCount: result.completedCount,
        limit,
        offset,
        hasMore: offset + result.requests.length < result.total
      };

      // Set Cache-Control for browser and Vercel edge
      res.header('Cache-Control', 'public, max-age=10, s-maxage=60');
      return res.json(responseData);
    } catch (error: any) {
      log(`Admin requests fetch failed: ${error.message}`, 'error');
      return res.status(500).json({ 
        message: 'Failed to fetch dashboard data',
        error: error.message
      });
    }

    return res.status(503).json({ 
      message: 'Service temporarily unavailable'
    });
  });

  app.post('/api/admin/upload-edited/:requestId', upload.single('editedImage'), async (req, res) => {
    try {
      const { requestId } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: 'No edited image file provided' });
      }

      // Upload to Cloudinary instead of storing Base64
      const cloudinaryUrl = await uploadToCloudinary(req.file.buffer);
      
      const uniqueId = nanoid(10);
      const ext = path.extname(req.file.originalname);
      const generatedFilename = `${Date.now()}-${uniqueId}${ext}`;

      const updatedRequest = await storage.updateImageRequest(requestId, {
        editedFileName: req.file.originalname,
        editedFilePath: cloudinaryUrl, // Store URL
        editedContentType: req.file.mimetype,
        status: 'completed',
        completedAt: new Date(),
      });

      if (!updatedRequest) {
        return res.status(404).json({ message: 'Request not found' });
      }

      res.json({
        message: 'Edited image uploaded successfully',
        request: {
          id: updatedRequest._id?.toString(),
          status: updatedRequest.status,
          completedAt: updatedRequest.completedAt,
          url: cloudinaryUrl,
        }
      });
    } catch (error: any) {
      log(`Error uploading edited image: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to upload edited image' });
    }
  });

  app.use('/uploads', express.static('uploads'));

  return httpServer;
}
