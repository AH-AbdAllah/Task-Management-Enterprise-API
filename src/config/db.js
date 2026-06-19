const { PrismaClient } = require('@prisma/client');
const mongoose = require('mongoose');
const { createClient } = require('redis');
require('dotenv').config();

// PostgreSQL (Prisma)
const prisma = new PrismaClient();

// Redis Client
const useRedis = process.env.USE_REDIS === 'true';
let redisClient;
if (useRedis) {
  const redisUrl = process.env.REDIS_URL || 'redis://localhost:6379';
  redisClient = createClient({ url: redisUrl });
  redisClient.on('error', (err) => console.error('Redis Client Error', err));
  redisClient.on('connect', () => console.log('Redis connected successfully.'));
}

const isRedisConnected = () => useRedis && redisClient && redisClient.isOpen;

// MongoDB Connection
const mongoUri = process.env.MONGO_URI || 'mongodb://localhost:27017/task_manager_logs';
const useMongo = process.env.USE_MONGO === 'true';

const connectMongo = async () => {
  if (!useMongo) {
    console.log('MongoDB is disabled by USE_MONGO environment variable.');
    return;
  }
  // Disable command buffering so Mongoose queries fail fast instead of hanging when Mongo is down
  mongoose.set('bufferCommands', false);
  try {
    await mongoose.connect(mongoUri, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB connected successfully.');
  } catch (error) {
    console.warn('[MongoDB] Connection error. Logging to MongoDB will be skipped:', error.message);
  }
};

const initDatabases = async () => {
  await prisma.$connect();
  console.log('PostgreSQL (Prisma) connected successfully.');
  
  await connectMongo();

  if (useRedis) {
    try {
      await redisClient.connect();
    } catch (err) {
      console.warn('[Redis] Connection error. Caching and BullMQ will be disabled:', err.message);
    }
  } else {
    console.log('Redis is disabled by USE_REDIS environment variable.');
  }
};

const closeDatabases = async () => {
  await prisma.$disconnect();
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  if (useRedis && redisClient && redisClient.isOpen) {
    await redisClient.quit();
  }
};

module.exports = { prisma, redisClient, isRedisConnected, connectMongo, initDatabases, closeDatabases };

