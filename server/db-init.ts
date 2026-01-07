import { getDatabase } from "@shared/schema";

export async function initializeDatabase() {
  const db = await getDatabase();
  
  const employeesCollection = db.collection('employees');
  await employeesCollection.createIndex({ employeeId: 1 }, { unique: true });

  const usersCollection = db.collection('users');
  await usersCollection.createIndex({ employeeId: 1 }, { unique: true, sparse: true });

  const imageRequestsCollection = db.collection('image_requests');
  await imageRequestsCollection.createIndex({ userId: 1 });
  await imageRequestsCollection.createIndex({ status: 1 });
  await imageRequestsCollection.createIndex({ uploadedAt: -1 });
  
  // Ensure background counts are optimized
  console.log('[Database] Ensuring optimized indexes for stats...');
  await imageRequestsCollection.createIndex({ status: 1, uploadedAt: -1 });

  const count = await imageRequestsCollection.countDocuments();
  if (count > 0) {
    const allCollections = await db.listCollections().toArray();
  }
}

export async function checkCollectionConsistency() {
  const db = await getDatabase();
  const collections = await db.listCollections().toArray();
  const names = collections.map(c => c.name);
  
  // Check for common typos or case sensitivity issues
  const variants = ['Image_Requests', 'ImageRequests', 'imageRequests', 'imagerequests'];
  for (const v of variants) {
    if (names.includes(v)) {
      console.warn(`[WARNING] Found unexpected collection variant: ${v}. Current code uses 'image_requests'.`);
    }
  }
}
