const { Queue, Worker } = require('bullmq');
const { URL } = require('url');
require('dotenv').config();

const useRedis = process.env.USE_REDIS === 'true';

let connection;
let emailNotificationQueue;
let fileProcessingQueue;

if (useRedis) {
  try {
    const redisUrl = new URL(process.env.REDIS_URL || 'redis://localhost:6379');
    connection = {
      host: redisUrl.hostname,
      port: parseInt(redisUrl.port) || 6379,
      username: redisUrl.username || undefined,
      password: redisUrl.password || undefined,
    };

    emailNotificationQueue = new Queue('EmailNotifications', { connection });
    fileProcessingQueue = new Queue('FileProcessing', { connection });
  } catch (err) {
    console.error('[BullMQ] Failed to initialize queues:', err.message);
  }
}

const startWorkers = () => {
  if (!useRedis) {
    console.log('[BullMQ] Redis is disabled. Worker startup skipped.');
    return;
  }

  try {
    const notificationWorker = new Worker(
      'EmailNotifications',
      async (job) => {
        console.log(`[Background Job] Processing email job ID: ${job.id}`);
        const { email, subject, body } = job.data;
        await new Promise((resolve) => setTimeout(resolve, 1500));
        console.log(`[Background Job] Email sent to ${email}. Subject: "${subject}"`);
        return { success: true, sentTo: email };
      },
      { connection }
    );

    const fileWorker = new Worker(
      'FileProcessing',
      async (job) => {
        console.log(`[Background Job] Processing file job ID: ${job.id}`);
        const { fileId, fileName } = job.data;
        await new Promise((resolve) => setTimeout(resolve, 2000));
        console.log(`[Background Job] File processed. ID: ${fileId}, Name: ${fileName}`);
        return { success: true, processedFileId: fileId };
      },
      { connection }
    );

    notificationWorker.on('completed', (job) =>
      console.log(`[BullMQ] EmailNotifications job ${job.id} completed.`)
    );
    notificationWorker.on('failed', (job, err) =>
      console.error(`[BullMQ] EmailNotifications job ${job?.id} failed: ${err.message}`)
    );
    fileWorker.on('completed', (job) =>
      console.log(`[BullMQ] FileProcessing job ${job.id} completed.`)
    );
    fileWorker.on('failed', (job, err) =>
      console.error(`[BullMQ] FileProcessing job ${job?.id} failed: ${err.message}`)
    );

    console.log('BullMQ Workers started successfully.');
  } catch (err) {
    console.error('[BullMQ] Failed to start workers:', err.message);
  }
};

class QueueService {
  static async queueEmailNotification(email, subject, body) {
    try {
      if (!useRedis) {
        console.log(`[Queue Mock] Direct processing email for ${email}`);
        setTimeout(async () => {
          console.log(`[Background Job Mock] Processing email job`);
          console.log(`[Background Job Mock] Email sent to ${email}. Subject: "${subject}"`);
        }, 1500);
        return;
      }
      await emailNotificationQueue.add('sendEmail', { email, subject, body });
      console.log(`[Queue] Email queued for ${email}`);
    } catch (error) {
      console.error('[Queue] Failed to queue email:', error);
    }
  }

  static async queueFileProcessing(fileId, fileName, filePath) {
    try {
      if (!useRedis) {
        console.log(`[Queue Mock] Direct processing file for ${fileName}`);
        setTimeout(async () => {
          console.log(`[Background Job Mock] Processing file job`);
          console.log(`[Background Job Mock] File processed. ID: ${fileId}, Name: ${fileName}`);
        }, 2000);
        return;
      }
      await fileProcessingQueue.add('processFile', { fileId, fileName, filePath });
      console.log(`[Queue] File processing queued for ${fileName}`);
    } catch (error) {
      console.error('[Queue] Failed to queue file processing:', error);
    }
  }
}

module.exports = { emailNotificationQueue, fileProcessingQueue, startWorkers, QueueService };

