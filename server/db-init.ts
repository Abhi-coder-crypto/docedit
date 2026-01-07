import { getDatabase } from "@shared/schema";

export async function initializeDatabase() {
  const db = await getDatabase();
  
  console.log("Initializing MongoDB collections and indexes...");

  const employeesCollection = db.collection('employees');
  await employeesCollection.createIndex({ employeeId: 1 }, { unique: true });
  console.log("Created unique index on employees.employeeId");

  const usersCollection = db.collection('users');
  await usersCollection.createIndex({ employeeId: 1 }, { unique: true, sparse: true });
  console.log("Created unique index on users.employeeId");

  const imageRequestsCollection = db.collection('image_requests');
  await imageRequestsCollection.createIndex({ userId: 1 });
  await imageRequestsCollection.createIndex({ status: 1 });
  await imageRequestsCollection.createIndex({ uploadedAt: -1 });
  console.log("Created separate indexes on image_requests (userId, status, uploadedAt) for faster filtering");

  const count = await imageRequestsCollection.countDocuments();
  console.log(`Current image_requests count in collection 'image_requests': ${count}`);
  if (count > 0) {
    const sample = await imageRequestsCollection.findOne();
    console.log(`Sample request _id: ${sample?._id}, status: ${sample?.status}, userId: ${sample?.userId}`);
    
    // Check for any potential whitespace issues in collection name
    const allCollections = await db.listCollections().toArray();
    console.log("Available collections in DB 'bg_remover_portal':", allCollections.map(c => c.name));
    
    // Check for "admin" specific data if it exists
    const adminData = await imageRequestsCollection.find({ role: 'admin' }).toArray();
    console.log(`Found ${adminData.length} documents with role: admin`);
  } else {
    console.log("No documents found in 'image_requests' collection during initialization.");
  }

  console.log("Database initialization complete!");
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
