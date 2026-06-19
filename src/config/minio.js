const Minio = require('minio');
require('dotenv').config();

const minioClient = new Minio.Client({
  endPoint: process.env.MINIO_ENDPOINT || 'localhost',
  port: parseInt(process.env.MINIO_PORT || '9000'),
  useSSL: process.env.MINIO_USE_SSL === 'true',
  accessKey: process.env.MINIO_ACCESS_KEY || 'minioadmin',
  secretKey: process.env.MINIO_SECRET_KEY || 'minioadmin123',
});

const MINIO_BUCKET = process.env.MINIO_BUCKET || 'task-attachments';

const initMinio = async () => {
  try {
    const exists = await minioClient.bucketExists(MINIO_BUCKET);
    if (!exists) {
      await minioClient.makeBucket(MINIO_BUCKET, 'us-east-1');
      console.log(`MinIO: Bucket "${MINIO_BUCKET}" created.`);

      const policy = JSON.stringify({
        Version: '2012-10-17',
        Statement: [
          {
            Effect: 'Allow',
            Principal: { AWS: ['*'] },
            Action: ['s3:GetObject'],
            Resource: [`arn:aws:s3:::${MINIO_BUCKET}/*`],
          },
        ],
      });
      await minioClient.setBucketPolicy(MINIO_BUCKET, policy);
    }
    console.log(`MinIO connected. Bucket: "${MINIO_BUCKET}"`);
  } catch (err) {
    console.error('MinIO initialization error:', err);
    throw err;
  }
};

module.exports = { minioClient, MINIO_BUCKET, initMinio };
