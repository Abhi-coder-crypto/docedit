import express, { type Request, Response, NextFunction } from "express";
import { MongoClient, ObjectId } from "mongodb";
import multer from "multer";
import path from "path";
import nodemailer from "nodemailer";

const app = express();

app.use(express.json({ limit: "15mb" }));
app.use(express.urlencoded({ limit: "15mb", extended: false }));

let cachedClient: MongoClient | null = null;

async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error("MONGODB_URI environment variable is not set");
  }

  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
}

async function getDatabase() {
  const client = await connectToDatabase();
  return client.db("bg_remover_portal");
}

interface Employee {
  _id?: ObjectId;
  employeeId: string;
  displayName: string;
  miniRegionName: string;
  regionName: string;
  subZoneName: string;
  zoneName: string;
  createdAt: Date;
}

interface User {
  _id?: ObjectId;
  employeeId: string;
  displayName: string;
  role: "user" | "admin";
  createdAt: Date;
}

interface ImageRequest {
  _id?: ObjectId;
  userId: string;
  employeeId: string;
  displayName: string;
  originalFileName: string;
  originalFilePath: string;
  originalFileContent?: string;
  originalContentType?: string;
  editedFileName?: string;
  editedFilePath?: string;
  editedFileContent?: string;
  editedContentType?: string;
  status: "pending" | "completed";
  uploadedAt: Date;
  completedAt?: Date;
}

const COMMON_PASSWORD = "duolin";

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB limit
  fileFilter: (req, file, cb) => {
    const allowedTypes = ["image/jpeg", "image/jpg", "image/png", "image/webp"];
    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error("Invalid file type. Only JPG, PNG, and WEBP are allowed."));
    }
  },
});

function log(message: string, source = "api") {
  const formattedTime = new Date().toLocaleTimeString("en-US", {
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
    hour12: true,
  });
  console.log(`${formattedTime} [${source}] ${message}`);
}

app.post("/api/auth/login", async (req, res) => {
  try {
    const { employeeId, password } = req.body;

    if (!employeeId || !password) {
      return res
        .status(400)
        .json({ message: "Employee ID and password are required" });
    }

    if (password !== COMMON_PASSWORD) {
      return res.status(401).json({ message: "Invalid password" });
    }

    const db = await getDatabase();
    const employee = await db
      .collection<Employee>("employees")
      .findOne({ employeeId: String(employeeId) });

    if (!employee) {
      return res.status(401).json({
        message: "Employee ID not found. Please contact your administrator.",
      });
    }

    let user = await db
      .collection<User>("users")
      .findOne({ employeeId: String(employeeId) });

    if (!user) {
      const newUser: User = {
        employeeId: String(employeeId),
        displayName: employee.displayName,
        role: "user",
        createdAt: new Date(),
      };
      const result = await db.collection<User>("users").insertOne(newUser);
      user = { ...newUser, _id: result.insertedId };
    }

    res.json({
      message: "Login successful",
      user: {
        id: user._id?.toString(),
        employeeId: user.employeeId,
        displayName: user.displayName,
        role: user.role,
      },
    });
  } catch (error: any) {
    log(`Error in login: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to login" });
  }
});

app.post("/api/images/upload", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ message: "No image file provided" });
    }

    const { userId, employeeId, displayName } = req.body;

    if (!userId || !employeeId || !displayName) {
      return res.status(400).json({ message: "User information is required" });
    }

    const db = await getDatabase();
    const imageBuffer = req.file.buffer.toString("base64");
    const imageMimeType = req.file.mimetype;

    const newRequest: ImageRequest = {
      userId,
      employeeId,
      displayName,
      originalFileName: req.file.originalname,
      originalFilePath: `data:${imageMimeType};base64,${imageBuffer}`,
      status: "pending",
      uploadedAt: new Date(),
    };

    const result = await db
      .collection<ImageRequest>("image_requests")
      .insertOne(newRequest);
    const imageRequest = { ...newRequest, _id: result.insertedId };

    res.json({
      message: "Image uploaded successfully",
      request: {
        id: imageRequest._id?.toString(),
        status: imageRequest.status,
        uploadedAt: imageRequest.uploadedAt,
      },
    });
  } catch (error: any) {
    log(`Error in image upload: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to upload image" });
  }
});

app.get("/api/images/user/:userId", async (req, res) => {
  try {
    const { userId } = req.params;
    const db = await getDatabase();
    const requests = await db
      .collection<ImageRequest>("image_requests")
      .find({ userId })
      .sort({ uploadedAt: -1 })
      .toArray();

    res.json({
      requests: requests.map((r) => ({
        id: r._id?.toString(),
        originalFileName: r.originalFileName,
        originalFilePath: r.originalFilePath,
        editedFileName: r.editedFileName,
        editedFilePath: r.editedFilePath,
        status: r.status,
        uploadedAt: r.uploadedAt,
        completedAt: r.completedAt,
      })),
    });
  } catch (error: any) {
    log(`Error fetching user requests: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

app.get("/api/images/download/:requestId", async (req, res) => {
  try {
    const { requestId } = req.params;
    const { type } = req.query;

    const db = await getDatabase();
    const request = await db
      .collection<ImageRequest>("image_requests")
      .findOne({ _id: new ObjectId(requestId) });

    if (!request) {
      return res.status(404).json({ message: "Request not found" });
    }

    const filePath =
      type === "edited" ? request.editedFilePath : request.originalFilePath;
    const fileName =
      type === "edited" ? request.editedFileName : request.originalFileName;

    if (!filePath) {
      return res.status(404).json({ message: "File not found" });
    }

    if (filePath.startsWith("data:")) {
      const matches = filePath.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName || "image"}"`
        );
        return res.send(buffer);
      }
    }

    res.status(404).json({ message: "File format not supported" });
  } catch (error: any) {
    log(`Error downloading file: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to download file" });
  }
});

// New download endpoint that matches main server structure
app.get("/api/images/download-by-id/:requestId/:type", async (req, res) => {
  try {
    const { requestId, type } = req.params;

    if (type !== "original" && type !== "edited") {
      return res.status(400).json({ message: "Invalid image type" });
    }

    const db = await getDatabase();
    const request = await db
      .collection<ImageRequest>("image_requests")
      .findOne({ _id: new ObjectId(requestId) });

    if (!request) {
      return res.status(404).json({ message: "Image request not found" });
    }

    let fileContent: string | undefined;
    let contentType: string | undefined;
    let fileName: string;

    if (type === "original") {
      fileContent = request.originalFileContent;
      contentType = request.originalContentType;
      fileName = request.originalFileName;
    } else {
      fileContent = request.editedFileContent;
      contentType = request.editedContentType;
      fileName = request.editedFileName || "edited-image";
    }

    // Try fileContent first (main server format)
    if (fileContent) {
      const buffer = Buffer.from(fileContent, "base64");
      res.setHeader("Content-Type", contentType || "application/octet-stream");
      res.setHeader(
        "Content-Disposition",
        `attachment; filename="${fileName}"`
      );
      return res.send(buffer);
    }

    // Fallback to filePath with data URI (Vercel format)
    const filePath =
      type === "edited" ? request.editedFilePath : request.originalFilePath;

    if (filePath && filePath.startsWith("data:")) {
      const matches = filePath.match(/^data:([^;]+);base64,(.+)$/);
      if (matches) {
        const mimeType = matches[1];
        const base64Data = matches[2];
        const buffer = Buffer.from(base64Data, "base64");

        res.setHeader("Content-Type", mimeType);
        res.setHeader(
          "Content-Disposition",
          `attachment; filename="${fileName || "image"}"`
        );
        return res.send(buffer);
      }
    }

    res.status(404).json({ 
      message: "This image was uploaded before the storage system was updated. The file content is no longer available. Please re-upload the image." 
    });
  } catch (error: any) {
    log(`Error downloading file by ID: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to download file" });
  }
});

app.get("/api/admin/requests", async (req, res) => {
  try {
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;
    
    log(`Admin fetching requests - limit: ${limit}, offset: ${offset}`);
    
    const db = await getDatabase();
    const col = db.collection<ImageRequest>("image_requests");
    
    const total = await col.countDocuments({});
    
    // Calculate unique users across all requests
    const uniqueUsersResult = await col.aggregate([
      { $group: { _id: "$userId" } },
      { $count: "count" }
    ]).toArray();
    const uniqueUsers = uniqueUsersResult[0]?.count || 0;

    const requests = await col
      .find({})
      .sort({ uploadedAt: -1 })
      .skip(offset)
      .limit(limit)
      .toArray();

    log(`Found ${requests.length} requests out of ${total} total (uniqueUsers: ${uniqueUsers})`);

    res.json({
      requests: requests.map((r) => ({
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
      total,
      uniqueUsers,
      limit,
      offset,
      hasMore: offset + requests.length < total
    });
  } catch (error: any) {
    log(`Error fetching all requests: ${error.message}`, "error");
    res.status(500).json({ message: "Failed to fetch requests" });
  }
});

app.post(
  "/api/admin/upload-edited/:requestId",
  upload.single("editedImage"),
  async (req, res) => {
    try {
      const { requestId } = req.params;

      if (!req.file) {
        return res
          .status(400)
          .json({ message: "No edited image file provided" });
      }

      const db = await getDatabase();
      const imageBuffer = req.file.buffer.toString("base64");
      const imageMimeType = req.file.mimetype;

      const updatedDoc = await db
        .collection<ImageRequest>("image_requests")
        .findOneAndUpdate(
          { _id: new ObjectId(requestId) },
          {
            $set: {
              editedFileName: req.file.originalname,
              editedFilePath: `data:${imageMimeType};base64,${imageBuffer}`,
              status: "completed",
              completedAt: new Date(),
            },
          },
          { returnDocument: "after", includeResultMetadata: false }
        );
      
      if (!updatedDoc) {
        return res.status(404).json({ message: "Request not found" });
      }

      res.json({
        message: "Edited image uploaded successfully",
        request: {
          id: updatedDoc._id?.toString(),
          status: updatedDoc.status,
          completedAt: updatedDoc.completedAt,
        },
      });
    } catch (error: any) {
      log(`Error uploading edited image: ${error.message}`, "error");
      res.status(500).json({ message: "Failed to upload edited image" });
    }
  }
);

app.get("/api/health", (req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use((err: any, _req: Request, res: Response, _next: NextFunction) => {
  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  res.status(status).json({ message });
});

export default app;
