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

const uploadStorage = multer.diskStorage({
  destination: function (req, file, cb) {
    const uploadType = req.path.includes('/upload-edited') ? 'edited' : 'original';
    cb(null, `uploads/${uploadType}`);
  },
  filename: function (req, file, cb) {
    const uniqueId = nanoid(10);
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${uniqueId}${ext}`);
  }
});

const upload = multer({ 
  storage: uploadStorage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Invalid file type. Only JPG, PNG, and WEBP are allowed.'));
    }
  }
});

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

      const imageRequest = await storage.createImageRequest({
        userId,
        employeeId,
        displayName,
        originalFileName: req.file.originalname,
        originalFilePath: req.file.path,
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

  app.get('/api/images/download/:type/:filename', (req, res) => {
    try {
      const { type } = req.params;
      let { filename } = req.params;
      
      // Decode URL-encoded filename
      filename = decodeURIComponent(filename);
      
      log(`Download request - type: ${type}, filename: ${filename}`, 'info');
      
      if (type !== 'original' && type !== 'edited') {
        return res.status(400).json({ message: 'Invalid image type' });
      }

      const filePath = path.join(process.cwd(), 'uploads', type, filename);
      
      log(`Looking for file at: ${filePath}`, 'info');
      
      if (!fs.existsSync(filePath)) {
        log(`File not found: ${filePath}`, 'error');
        return res.status(404).json({ 
          message: 'File not found. It may have been deleted or moved.',
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
      const requests = await storage.getAllImageRequests();
      
      res.json({
        requests: requests.map(r => ({
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
        }))
      });
    } catch (error: any) {
      log(`Error fetching all requests: ${error.message}`, 'error');
      res.status(500).json({ message: 'Failed to fetch requests' });
    }
  });

  app.post('/api/admin/upload-edited/:requestId', upload.single('editedImage'), async (req, res) => {
    try {
      const { requestId } = req.params;

      if (!req.file) {
        return res.status(400).json({ message: 'No edited image file provided' });
      }

      const updatedRequest = await storage.updateImageRequest(requestId, {
        editedFileName: req.file.originalname,
        editedFilePath: req.file.path,
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
