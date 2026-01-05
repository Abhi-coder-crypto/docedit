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
let connectionPromise: Promise<MongoClient> | null = null;

export async function connectToDatabase() {
  if (cachedClient) {
    try {
      // Check if connection is still alive
      await cachedClient.db('admin').command({ ping: 1 });
      return cachedClient;
    } catch (e) {
      log('Cached MongoDB connection is dead, reconnecting...', 'mongodb');
      cachedClient = null;
      connectionPromise = null;
    }
  }

  if (connectionPromise) {
    return connectionPromise;
  }

  const uri = process.env.MONGODB_URI;
  if (!uri) {
    throw new Error('MONGODB_URI environment variable is not set');
  }

  log('Connecting to MongoDB...', 'mongodb');
  
  connectionPromise = (async () => {
    try {
      const client = new MongoClient(uri, {
        connectTimeoutMS: 10000,
        socketTimeoutMS: 60000,
        serverSelectionTimeoutMS: 10000,
        maxPoolSize: 20,
        minPoolSize: 5,
        maxIdleTimeMS: 60000,
        waitQueueTimeoutMS: 10000,
        retryWrites: true,
        retryReads: true
      });
      
      await client.connect();
      log('Successfully connected to MongoDB', 'mongodb');
      cachedClient = client;
      return client;
    } catch (error) {
      log(`Failed to connect to MongoDB: ${error instanceof Error ? error.message : 'Unknown error'}`, 'mongodb');
      connectionPromise = null;
      throw error;
    }
  })();

  return connectionPromise;
}

const log = (message: string, source: string) => {
  console.log(`${new Date().toLocaleTimeString()} [${source}] ${message}`);
};

export async function getDatabase() {
  const client = await connectToDatabase();
  const db = client.db('bg_remover_portal');
  // Log for debugging to ensure we are using the correct database name
  console.log(`[Database] Using database: ${db.databaseName}`);
  return db;
}
