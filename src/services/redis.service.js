const { redisClient, isRedisConnected } = require('../config/db');

class RedisService {
  static DEFAULT_TTL = 3600; // 1 hour

  static async set(key, value, ttlSeconds = RedisService.DEFAULT_TTL) {
    if (!isRedisConnected()) return;
    try {
      await redisClient.set(key, JSON.stringify(value), { EX: ttlSeconds });
    } catch (err) {
      console.error(`Redis set error for key ${key}:`, err);
    }
  }

  static async get(key) {
    if (!isRedisConnected()) return null;
    try {
      const value = await redisClient.get(key);
      if (!value) return null;
      return JSON.parse(value);
    } catch (err) {
      console.error(`Redis get error for key ${key}:`, err);
      return null;
    }
  }

  static async del(key) {
    if (!isRedisConnected()) return;
    try {
      await redisClient.del(key);
    } catch (err) {
      console.error(`Redis del error for key ${key}:`, err);
    }
  }

  static async delPattern(pattern) {
    if (!isRedisConnected()) return;
    try {
      let cursor = 0;
      do {
        const reply = await redisClient.scan(cursor, { MATCH: pattern, COUNT: 100 });
        cursor = reply.cursor;
        if (reply.keys.length > 0) await redisClient.del(reply.keys);
      } while (cursor !== 0);
    } catch (err) {
      console.error(`Redis delPattern error for pattern ${pattern}:`, err);
    }
  }

  static getProjectBoardsKey(projectId) { return `project:${projectId}:boards`; }
  static getBoardColumnsKey(boardId) { return `board:${boardId}:columns`; }
  static getTaskDetailKey(taskId) { return `task:${taskId}:detail`; }
  static getUserProfileKey(userId) { return `user:${userId}:profile`; }
}

module.exports = { RedisService };
