const minioConfig = require('../config/minio');
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs');

const useMinio = process.env.USE_MINIO === 'true';
const uploadDir = process.env.UPLOAD_DIR || 'uploads';

class StorageService {
  static async uploadFile(originalName, buffer, mimeType, bucket = useMinio ? minioConfig.MINIO_BUCKET : 'local') {
    const ext = path.extname(originalName);
    const fileName = `${uuidv4()}${ext}`;
    const objectKey = useMinio ? `attachments/${fileName}` : fileName;

    if (useMinio) {
      await minioConfig.minioClient.putObject(bucket, objectKey, buffer, buffer.length, {
        'Content-Type': mimeType,
      });
    } else {
      // Ensure local upload dir exists
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      const localPath = path.join(uploadDir, fileName);
      await fs.promises.writeFile(localPath, buffer);
      console.log(`[Storage File System] File written locally to ${localPath}`);
    }

    return { objectKey, bucket };
  }

  static async deleteFile(objectKey, bucket = useMinio ? minioConfig.MINIO_BUCKET : 'local') {
    if (useMinio) {
      await minioConfig.minioClient.removeObject(bucket, objectKey);
    } else {
      const localPath = path.join(uploadDir, objectKey);
      if (fs.existsSync(localPath)) {
        await fs.promises.unlink(localPath);
        console.log(`[Storage File System] File deleted locally from ${localPath}`);
      }
    }
  }

  static async getSignedUrl(objectKey, expirySeconds = 3600, bucket = useMinio ? minioConfig.MINIO_BUCKET : 'local') {
    if (useMinio) {
      return minioConfig.minioClient.presignedGetObject(bucket, objectKey, expirySeconds);
    } else {
      return StorageService.getPublicUrl(objectKey, bucket);
    }
  }

  static getPublicUrl(objectKey, bucket = useMinio ? minioConfig.MINIO_BUCKET : 'local') {
    if (useMinio) {
      const endpoint = process.env.MINIO_ENDPOINT || 'localhost';
      const port = process.env.MINIO_PORT || '9000';
      const protocol = process.env.MINIO_USE_SSL === 'true' ? 'https' : 'http';
      return `${protocol}://${endpoint}:${port}/${bucket}/${objectKey}`;
    } else {
      const port = process.env.PORT || '4000';
      return `http://localhost:${port}/uploads/${objectKey}`;
    }
  }
}

module.exports = { StorageService };

