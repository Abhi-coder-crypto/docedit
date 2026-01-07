import { getDatabase } from "@shared/schema";

export async function initializeDatabase() {
  const db = await getDatabase();
  
  const employeesCollection = db.collection('employees');
  await employeesCollection.createIndex({ employeeId: 1 }, { unique: true });

  const usersCollection = db.collection('users');
  await usersCollection.createIndex({ employeeId: 1 }, { unique: true, sparse: true });

  const imageRequestsCollection = db.collection('image_requests');
  await imageRequestsCollection.createIndex({ uploadedAt: -1 });
  await imageRequestsCollection.createIndex({ userId: 1 });
  await imageRequestsCollection.createIndex({ status: 1 });
  
  // Ensure we don't have a massive amount of data in one document
  // (Index for fast access)
  console.log('[mongodb] Indexes verified');

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
