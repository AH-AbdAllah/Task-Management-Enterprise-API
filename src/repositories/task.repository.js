const { prisma } = require('../config/db');

class TaskRepository {
  static async findById(id) {
    return prisma.task.findUnique({
      where: { id },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        creator: { select: { id: true, name: true, email: true } },
        column: {
          select: {
            id: true, name: true, boardId: true,
            board: {
              select: {
                id: true, name: true, projectId: true,
                project: { select: { id: true, name: true } },
              },
            },
          },
        },
        attachments: { select: { id: true, fileName: true, fileSize: true, createdAt: true } },
        _count: { select: { comments: true } },
      },
    });
  }

  static async create(data) {
    return prisma.task.create({
      data,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
  }

  static async update(id, data) {
    return prisma.task.update({
      where: { id },
      data,
      include: { assignee: { select: { id: true, name: true, email: true } } },
    });
  }

  static async delete(id) {
    return prisma.task.delete({ where: { id } });
  }

  static async findByColumn(columnId) {
    return prisma.task.findMany({
      where: { columnId },
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: { select: { id: true, name: true, email: true } },
        _count: { select: { comments: true, attachments: true } },
      },
    });
  }

  static async findByProject(projectId) {
    return prisma.task.findMany({
      where: { column: { board: { projectId } } },
      include: {
        column: { select: { name: true } },
        assignee: { select: { id: true, name: true, email: true } },
      },
    });
  }

  static async addAttachment(data) {
    return prisma.attachment.create({ data });
  }
}

module.exports = { TaskRepository };
