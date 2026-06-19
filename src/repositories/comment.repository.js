const { prisma } = require('../config/db');

class CommentRepository {
  static async findByTaskId(taskId) {
    return prisma.comment.findMany({
      where: { taskId },
      orderBy: { createdAt: 'asc' },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  static async findById(id) {
    return prisma.comment.findUnique({
      where: { id },
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  static async create(data) {
    return prisma.comment.create({
      data,
      include: { user: { select: { id: true, name: true, email: true } } },
    });
  }

  static async delete(id) {
    return prisma.comment.delete({ where: { id } });
  }
}

module.exports = { CommentRepository };
