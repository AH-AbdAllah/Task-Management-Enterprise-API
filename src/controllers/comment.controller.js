const { prisma } = require('../config/db');
const { CommentRepository } = require('../repositories/comment.repository');
const { NotificationRepository } = require('../repositories/notification.repository');
const { ActivityService } = require('../services/activity.service');
const { emitToTask, emitToUser } = require('../config/socket');

class CommentController {
  static async addComment(req, res, next) {
    try {
      const { taskId } = req.params;
      const { content } = req.body;
      const currentUser = req.user;

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          column: {
            select: {
              board: { select: { projectId: true, name: true, project: { select: { name: true } } } },
            },
          },
        },
      });

      if (!task) return res.status(404).json({ error: 'Task not found' });

      const comment = await CommentRepository.create({ taskId, userId: currentUser.id, content });

      const projectId = task.column.board.projectId;

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId, projectName: task.column.board.project.name,
        taskId: task.id, taskTitle: task.title,
        action: 'COMMENT_ADDED',
        details: { content: content.substring(0, 100) }, ipAddress: req.ip,
      });

      emitToTask(taskId, 'comment:added', {
        taskId, comment, addedBy: { id: currentUser.id, name: currentUser.name },
      });

      if (task.assigneeId && task.assigneeId !== currentUser.id) {
        await NotificationRepository.create({
          userId: task.assigneeId,
          type: 'COMMENT_ADDED',
          title: 'New comment on your task',
          body: `${currentUser.name} commented on "${task.title}": "${content.substring(0, 80)}${content.length > 80 ? '...' : ''}"`,
          metadata: { taskId, projectId, commentId: comment.id },
        });
        emitToUser(task.assigneeId, 'notification:new', {
          type: 'COMMENT_ADDED', taskId,
          message: `${currentUser.name} commented on "${task.title}"`,
        });
      }

      return res.status(201).json({ message: 'Comment added successfully', comment });
    } catch (error) {
      next(error);
    }
  }

  static async getComments(req, res, next) {
    try {
      const { taskId } = req.params;
      const task = await prisma.task.findUnique({ where: { id: taskId } });
      if (!task) return res.status(404).json({ error: 'Task not found' });

      const comments = await CommentRepository.findByTaskId(taskId);
      return res.json(comments);
    } catch (error) {
      next(error);
    }
  }

  static async deleteComment(req, res, next) {
    try {
      const { commentId } = req.params;
      const currentUser = req.user;

      const comment = await CommentRepository.findById(commentId);
      if (!comment) return res.status(404).json({ error: 'Comment not found' });

      if (comment.userId !== currentUser.id && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'You can only delete your own comments' });
      }

      await CommentRepository.delete(commentId);
      emitToTask(comment.taskId, 'comment:deleted', { commentId, taskId: comment.taskId });

      return res.json({ message: 'Comment deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { CommentController };
