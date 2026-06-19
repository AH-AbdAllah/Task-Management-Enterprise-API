const ActivityLogModel = require('../models/activityLog.model');
const { emitToProject } = require('../config/socket');
const mongoose = require('mongoose');
const { prisma } = require('../config/db');

class ActivityService {
  static async log(params) {
    try {
      const isMongoConnected = mongoose.connection.readyState === 1;
      let saved;

      if (isMongoConnected) {
        const activity = new ActivityLogModel({
          userId: params.userId,
          userName: params.userName,
          userEmail: params.userEmail,
          projectId: params.projectId,
          projectName: params.projectName,
          boardId: params.boardId,
          boardName: params.boardName,
          taskId: params.taskId,
          taskTitle: params.taskTitle,
          action: params.action,
          details: params.details || {},
          ipAddress: params.ipAddress,
          timestamp: new Date(),
        });
        saved = await activity.save();
      } else {
        // Fallback: Save to PostgreSQL (Neon Console)
        saved = await prisma.activityLog.create({
          data: {
            userId: params.userId,
            userName: params.userName,
            userEmail: params.userEmail,
            projectId: params.projectId || null,
            projectName: params.projectName || null,
            boardId: params.boardId || null,
            boardName: params.boardName || null,
            taskId: params.taskId || null,
            taskTitle: params.taskTitle || null,
            action: params.action,
            details: params.details || {},
            ipAddress: params.ipAddress || null,
            timestamp: new Date()
          }
        });
      }

      if (params.projectId) {
        emitToProject(params.projectId, 'activity', {
          id: saved ? (saved._id || saved.id) : `temp-${Date.now()}`,
          action: params.action,
          userName: params.userName,
          taskId: params.taskId,
          taskTitle: params.taskTitle,
          details: params.details,
          timestamp: saved ? saved.timestamp : new Date(),
        });
      }

      console.log(`[Audit Trail] "${params.action}" by ${params.userEmail} ${isMongoConnected ? '(Saved to MongoDB)' : '(Saved to PostgreSQL on Neon)'}`);
    } catch (error) {
      console.error('[Audit Trail] Failed to log activity:', error);
    }
  }

  static async getProjectTimeline(projectId, limit = 50, skip = 0) {
    if (mongoose.connection.readyState === 1) {
      return ActivityLogModel.find({ projectId }).sort({ timestamp: -1 }).skip(skip).limit(limit);
    }
    // Fallback: Read from PostgreSQL
    return prisma.activityLog.findMany({
      where: { projectId },
      orderBy: { timestamp: 'desc' },
      take: limit,
      skip: skip
    });
  }

  static async getUserTimeline(userId, limit = 50) {
    if (mongoose.connection.readyState === 1) {
      return ActivityLogModel.find({ userId }).sort({ timestamp: -1 }).limit(limit);
    }
    // Fallback: Read from PostgreSQL
    return prisma.activityLog.findMany({
      where: { userId },
      orderBy: { timestamp: 'desc' },
      take: limit
    });
  }
}

module.exports = { ActivityService };

