import express, { type Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import multer from "multer";
import path from "path";
import fs from "fs";
import { nanoid } from "nanoid";
import { log } from "./index";
import { sendEditedImageNotification } from "./email";
import { notifyNewImageUpload, notifyImageEdited } from "./websocket";

const COMMON_PASSWORD = 'duolin';

// Use memory storage for serverless compatibility (Vercel has read-only filesystem)
const upload = multer({ 
  storage: multer.memoryStorage(),
  limits: { fileSize: 1024 * 1024 }, // Set to 1MB as requested
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

      notifyNewImageUpload({
        id: imageRequest._id?.toString() || '',
        userId: imageRequest.userId,
        employeeId: imageRequest.employeeId,
        displayName: imageRequest.displayName,
        originalFileName: imageRequest.originalFileName,
        originalFilePath: imageRequest.originalFilePath,
        status: imageRequest.status,
        uploadedAt: imageRequest.uploadedAt,
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
          return res.redirect(filePath);
        }
        
        // Fallback to local file
        if (filePath && fs.existsSync(filePath)) {
          return res.download(filePath);
        }
        log(`File content not in database for request ${requestId}, type: ${type}`, 'error');
        return res.status(404).json({ 
          message: 'Image file not found.' 
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
    try {
      const limit = parseInt(req.query.limit as string) || 10;
      const offset = parseInt(req.query.offset as string) || 0;
      
      log(`Admin fetching requests - limit: ${limit}, offset: ${offset}`, 'info');
      
      const result = await storage.getAllImageRequests(limit, offset).catch(err => {
        log(`Storage error in getAllImageRequests: ${err.message}`, 'error');
        return null;
      });

      if (!result) {
        return res.status(503).json({ message: 'Database busy, please try again in a moment' });
      }
      
      const { requests, total, uniqueUsers } = result;
      log(`Found ${requests.length} requests out of ${total} total (uniqueUsers: ${uniqueUsers})`, 'info');
      
      const formattedRequests = requests.map(r => ({
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
      }));

      log(`Returning ${formattedRequests.length} formatted requests to client`, 'info');
      res.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
      res.header('Pragma', 'no-cache');
      res.header('Expires', '0');
      res.header('Access-Control-Allow-Origin', '*');

      return res.status(200).json({ 
        requests: formattedRequests,
        total,
        uniqueUsers,
        limit,
        offset,
        hasMore: offset + requests.length < total
      });
    } catch (error: any) {
      log(`Error fetching all requests: ${error.message}`, 'error');
      if (!res.headersSent) {
        res.status(500).json({ message: 'Failed to fetch requests', error: error.message });
      }
    }
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

      notifyImageEdited({
        id: updatedRequest._id?.toString() || '',
        userId: updatedRequest.userId,
        employeeId: updatedRequest.employeeId,
        displayName: updatedRequest.displayName,
        originalFileName: updatedRequest.originalFileName,
        originalFilePath: updatedRequest.originalFilePath,
        editedFileName: updatedRequest.editedFileName || '',
        editedFilePath: updatedRequest.editedFilePath || '',
        status: updatedRequest.status,
        uploadedAt: updatedRequest.uploadedAt,
        completedAt: updatedRequest.completedAt || new Date(),
      });

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
