import { type User, type Employee, type ImageRequest, getDatabase } from "@shared/schema";
import { ObjectId } from "mongodb";

export interface IStorage {
  // Employee operations
  getEmployeeByEmployeeId(employeeId: string): Promise<Employee | null>;
  createEmployee(employee: Omit<Employee, '_id' | 'createdAt'>): Promise<Employee>;
  getAllEmployees(): Promise<Employee[]>;
  deleteAllEmployees(): Promise<void>;
  
  // User operations
  getUserByEmployeeId(employeeId: string): Promise<User | null>;
  createUser(user: Omit<User, '_id' | 'createdAt'>): Promise<User>;
  
  // Image request operations
  createImageRequest(request: Omit<ImageRequest, '_id' | 'uploadedAt'>): Promise<ImageRequest>;
  getImageRequestById(id: string): Promise<ImageRequest | null>;
  getImageRequestsByUserId(userId: string): Promise<ImageRequest[]>;
  getAllImageRequests(): Promise<ImageRequest[]>;
  updateImageRequest(id: string, update: Partial<ImageRequest>): Promise<ImageRequest | null>;
}

export class MongoStorage implements IStorage {
  // Employee operations
  async getEmployeeByEmployeeId(employeeId: string): Promise<Employee | null> {
    const db = await getDatabase();
    const employee = await db.collection<Employee>('employees').findOne({ employeeId: String(employeeId) });
    return employee;
  }

  async createEmployee(employee: Omit<Employee, '_id' | 'createdAt'>): Promise<Employee> {
    const db = await getDatabase();
    const newEmployee: Employee = {
      ...employee,
      createdAt: new Date(),
    };
    const result = await db.collection<Employee>('employees').insertOne(newEmployee as any);
    return { ...newEmployee, _id: result.insertedId };
  }

  async getAllEmployees(): Promise<Employee[]> {
    const db = await getDatabase();
    const employees = await db.collection<Employee>('employees').find({}).toArray();
    return employees;
  }

  async deleteAllEmployees(): Promise<void> {
    const db = await getDatabase();
    await db.collection('employees').deleteMany({});
  }

  // User operations
  async getUserByEmployeeId(employeeId: string): Promise<User | null> {
    const db = await getDatabase();
    const user = await db.collection<User>('users').findOne({ employeeId: String(employeeId) });
    return user;
  }

  async createUser(user: Omit<User, '_id' | 'createdAt'>): Promise<User> {
    const db = await getDatabase();
    const newUser: User = {
      ...user,
      createdAt: new Date(),
    };
    const result = await db.collection<User>('users').insertOne(newUser as any);
    return { ...newUser, _id: result.insertedId };
  }

  // Image request operations
  async createImageRequest(request: Omit<ImageRequest, '_id' | 'uploadedAt'>): Promise<ImageRequest> {
    const db = await getDatabase();
    const newRequest: ImageRequest = {
      ...request,
      uploadedAt: new Date(),
    };
    const result = await db.collection<ImageRequest>('image_requests').insertOne(newRequest as any);
    return { ...newRequest, _id: result.insertedId };
  }

  async getImageRequestById(id: string): Promise<ImageRequest | null> {
    const db = await getDatabase();
    const request = await db.collection<ImageRequest>('image_requests').findOne({ _id: new ObjectId(id) });
    return request;
  }

  async getImageRequestsByUserId(userId: string): Promise<ImageRequest[]> {
    const db = await getDatabase();
    const requests = await db.collection<ImageRequest>('image_requests')
      .find({ userId })
      .sort({ uploadedAt: -1 })
      .toArray();
    return requests;
  }

  async getAllImageRequests(): Promise<ImageRequest[]> {
    try {
      const db = await getDatabase();
      const col = db.collection<ImageRequest>('image_requests');
      
      const requests = await col
        .find({})
        .sort({ uploadedAt: -1 })
        .toArray();
      
      console.log(`[MongoStorage] getAllImageRequests returning ${requests.length} requests from collection 'image_requests'`);
      return requests;
    } catch (error) {
      console.error('[MongoStorage] Error in getAllImageRequests:', error);
      throw error;
    }
  }

  async updateImageRequest(id: string, update: Partial<ImageRequest>): Promise<ImageRequest | null> {
    const db = await getDatabase();
    const result = await db.collection<ImageRequest>('image_requests').findOneAndUpdate(
      { _id: new ObjectId(id) },
      { $set: update },
      { returnDocument: 'after' }
    );
    return result || null;
  }
}

export const storage = new MongoStorage();
