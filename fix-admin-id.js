import { MongoClient, ObjectId } from 'mongodb';

async function fix() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('bg_remover_portal');
    const imageRequests = await db.collection('image_requests').find({}).toArray();
    
    console.log(`Processing ${imageRequests.length} requests...`);
    
    for (const req of imageRequests) {
      if (req.userId === 'admin-1767590033178' || req.userId === 'admin-1767590033192') {
        continue;
      }
      
      // Update any non-admin request to use the new admin ID for testing/visibility if needed
      // Actually, the screenshot shows 0 requests, but my test-mongo.js showed 86.
      // The issue is likely that the admin logged in has a NEW userId that doesn't match the existing ones.
      // But admin dashboard SHOULD show ALL requests because getAllImageRequests() is used.
    }
  } catch (err) {
    console.error('Fix failed:', err);
  } finally {
    await client.close();
  }
}
fix();
