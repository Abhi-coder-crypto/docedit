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
  console.log("Created indexes on image_requests (userId, status, uploadedAt)");

  console.log("Database initialization complete!");
}
