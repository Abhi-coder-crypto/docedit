import { MongoClient, ObjectId } from 'mongodb';

export interface Employee {
  _id?: ObjectId;
  employeeId: string;
  displayName: string;
  miniRegionName: string;
  regionName: string;
  subZoneName: string;
  zoneName: string;
  createdAt: Date;
}

export interface User {
  _id?: ObjectId;
  employeeId: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt: Date;
}

export interface ImageRequest {
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
  status: 'pending' | 'completed';
  uploadedAt: Date;
  completedAt?: Date;
}

// MongoDB connection
let cachedClient: MongoClient | null = null;

export async function connectToDatabase() {
  if (cachedClient) {
    return cachedClient;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  const client = new MongoClient(uri);
  await client.connect();
  cachedClient = client;
  return client;
}

export async function getDatabase() {
  const client = await connectToDatabase();
  return client.db('bg_remover_portal');
}
