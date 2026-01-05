import { MongoClient } from 'mongodb';
import * as dotenv from 'dotenv';
dotenv.config();

async function test() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('MONGODB_URI not found');
    process.exit(1);
  }
  console.log('Testing connection to:', uri.replace(/:([^@]+)@/, ':****@'));
  const client = new MongoClient(uri);
  try {
    await client.connect();
    console.log('Connected successfully');
    const db = client.db('bg_remover_portal');
    const collections = await db.listCollections().toArray();
    console.log('Collections:', collections.map(c => c.name));
    const requestsCount = await db.collection('image_requests').countDocuments();
    console.log('Image requests count:', requestsCount);
    const usersCount = await db.collection('users').countDocuments();
    console.log('Users count:', usersCount);
  } catch (err) {
    console.error('Connection failed:', err);
  } finally {
    await client.close();
  }
}
test();
