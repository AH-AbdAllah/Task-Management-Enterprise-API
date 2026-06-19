const { prisma } = require('../config/db');

class NotificationRepository {
  static async findByUserId(userId, limit = 30, skip = 0) {
    return prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      take: limit,
      skip,
    });
  }

  static async countUnread(userId) {
    return prisma.notification.count({ where: { userId, read: false } });
  }

  static async create(data) {
    return prisma.notification.create({ data });
  }

  static async markAsRead(id, userId) {
    return prisma.notification.updateMany({
      where: { id, userId },
      data: { read: true },
    });
  }

  static async markAllAsRead(userId) {
    return prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
  }
}

module.exports = { NotificationRepository };
