import { MongoClient } from 'mongodb';

async function check() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found');
    process.exit(1);
  }
  const client = new MongoClient(uri);
  try {
    await client.connect();
    const db = client.db('bg_remover_portal');
    const requests = await db.collection('image_requests').find({}).toArray();
    console.log(`TOTAL_REQUESTS_IN_DB: ${requests.length}`);
    if (requests.length > 0) {
      console.log('Sample Request:', JSON.stringify(requests[0], null, 2));
    }
  } catch (err) {
    console.error('Check failed:', err);
  } finally {
    await client.close();
  }
}
check();
