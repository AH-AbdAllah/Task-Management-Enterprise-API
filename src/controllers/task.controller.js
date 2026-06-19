const { prisma } = require('../config/db');
const { RedisService } = require('../services/redis.service');
const { ActivityService } = require('../services/activity.service');
const { QueueService } = require('../services/queue.service');
const { StorageService } = require('../services/storage.service');
const { emitToProject } = require('../config/socket');

class TaskController {
  static async verifyAccess(userId, columnId, globalRole) {
    if (globalRole === 'SYSTEM_ADMIN') return true;

    const column = await prisma.boardColumn.findUnique({
      where: { id: columnId },
      include: {
        board: {
          include: {
            project: {
              include: { team: { include: { members: { select: { userId: true } } } } },
            },
          },
        },
      },
    });

    if (!column) return null;
    const isMember = column.board.project.team.members.some((m) => m.userId === userId);
    return {
      hasAccess: isMember,
      projectId: column.board.project.id,
      projectName: column.board.project.name,
      boardId: column.board.id,
      boardName: column.board.name,
      columnName: column.name,
    };
  }

  static async createTask(req, res, next) {
    try {
      const { title, description, columnId, priority, dueDate, assigneeId } = req.body;
      const currentUser = req.user;

      const accessInfo = await TaskController.verifyAccess(currentUser.id, columnId, currentUser.role);
      if (accessInfo === null) return res.status(404).json({ error: 'Column not found' });
      if (accessInfo === false || (typeof accessInfo === 'object' && !accessInfo.hasAccess)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const task = await prisma.task.create({
        data: {
          title, description, columnId,
          priority: priority || 'MEDIUM',
          dueDate: dueDate ? new Date(dueDate) : null,
          assigneeId: assigneeId || null,
          creatorId: currentUser.id,
        },
        include: { assignee: { select: { id: true, name: true, email: true } } },
      });

      const { boardId, projectId, projectName, boardName } = typeof accessInfo === 'object' ? accessInfo : {};

      if (boardId) await RedisService.del(RedisService.getBoardColumnsKey(boardId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId, projectName, boardId, boardName,
        taskId: task.id, taskTitle: task.title,
        action: 'TASK_CREATED',
        details: { priority: task.priority, assignee: task.assignee?.email },
        ipAddress: req.ip,
      });

      if (task.assignee) {
        await QueueService.queueEmailNotification(
          task.assignee.email,
          `New Task Assigned: ${task.title}`,
          `Hello ${task.assignee.name},\n\nYou have been assigned to: "${task.title}".\nPriority: ${task.priority}`
        );
      }

      return res.status(201).json({ message: 'Task created successfully', task });
    } catch (error) {
      next(error);
    }
  }

  static async updateTask(req, res, next) {
    try {
      const { taskId } = req.params;
      const { title, description, columnId, priority, dueDate, assigneeId } = req.body;
      const currentUser = req.user;

      const existingTask = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          column: {
            select: {
              boardId: true,
              board: { select: { projectId: true, name: true, project: { select: { name: true } } } },
            },
          },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      if (!existingTask) return res.status(404).json({ error: 'Task not found' });

      const targetColumnId = columnId || existingTask.columnId;
      const accessInfo = await TaskController.verifyAccess(currentUser.id, targetColumnId, currentUser.role);
      if (accessInfo === null || (typeof accessInfo === 'object' && !accessInfo.hasAccess)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const updateData = {};
      if (title !== undefined) updateData.title = title;
      if (description !== undefined) updateData.description = description;
      if (columnId !== undefined) updateData.columnId = columnId;
      if (priority !== undefined) updateData.priority = priority;
      if (dueDate !== undefined) updateData.dueDate = dueDate ? new Date(dueDate) : null;
      if (assigneeId !== undefined) updateData.assigneeId = assigneeId;

      const updatedTask = await prisma.task.update({
        where: { id: taskId },
        data: updateData,
        include: { assignee: { select: { id: true, name: true, email: true } } },
      });

      const oldBoardId = existingTask.column.boardId;
      const newBoardId = typeof accessInfo === 'object' ? accessInfo.boardId : oldBoardId;
      await RedisService.del(RedisService.getBoardColumnsKey(oldBoardId));
      if (oldBoardId !== newBoardId) await RedisService.del(RedisService.getBoardColumnsKey(newBoardId));
      await RedisService.del(RedisService.getTaskDetailKey(taskId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: existingTask.column.board.projectId,
        projectName: existingTask.column.board.project.name,
        boardId: oldBoardId, boardName: existingTask.column.board.name,
        taskId: updatedTask.id, taskTitle: updatedTask.title,
        action: 'TASK_UPDATED',
        details: { updatedFields: Object.keys(updateData), newAssignee: updatedTask.assignee?.email },
        ipAddress: req.ip,
      });

      const assigneeChanged = existingTask.assigneeId !== updatedTask.assigneeId;
      if (assigneeChanged && updatedTask.assignee) {
        await QueueService.queueEmailNotification(
          updatedTask.assignee.email,
          `Task Reassigned: ${updatedTask.title}`,
          `Hello ${updatedTask.assignee.name},\n\nYou have been assigned to: "${updatedTask.title}".`
        );
      }

      return res.json({ message: 'Task updated successfully', task: updatedTask });
    } catch (error) {
      next(error);
    }
  }

  static async moveTask(req, res, next) {
    try {
      const { taskId } = req.params;
      const { columnId } = req.body;
      const currentUser = req.user;

      const existingTask = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          column: {
            select: {
              name: true, boardId: true,
              board: { select: { projectId: true, name: true, project: { select: { name: true } } } },
            },
          },
        },
      });

      if (!existingTask) return res.status(404).json({ error: 'Task not found' });

      const accessInfo = await TaskController.verifyAccess(currentUser.id, columnId, currentUser.role);
      if (accessInfo === null || (typeof accessInfo === 'object' && !accessInfo.hasAccess)) {
        return res.status(403).json({ error: 'Access denied or target column not found' });
      }

      const oldColumnName = existingTask.column.name;
      const newColumnName = typeof accessInfo === 'object' ? accessInfo.columnName : '';

      const updatedTask = await prisma.task.update({ where: { id: taskId }, data: { columnId } });

      const oldBoardId = existingTask.column.boardId;
      const newBoardId = typeof accessInfo === 'object' ? accessInfo.boardId : oldBoardId;
      await RedisService.del(RedisService.getBoardColumnsKey(oldBoardId));
      if (oldBoardId !== newBoardId) await RedisService.del(RedisService.getBoardColumnsKey(newBoardId));
      await RedisService.del(RedisService.getTaskDetailKey(taskId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: existingTask.column.board.projectId,
        projectName: existingTask.column.board.project.name,
        boardId: oldBoardId, boardName: existingTask.column.board.name,
        taskId: updatedTask.id, taskTitle: updatedTask.title,
        action: 'TASK_MOVED',
        details: { fromColumn: oldColumnName, toColumn: newColumnName },
        ipAddress: req.ip,
      });

      return res.json({ message: 'Task moved successfully', task: updatedTask });
    } catch (error) {
      next(error);
    }
  }

  static async uploadAttachment(req, res, next) {
    try {
      const { taskId } = req.params;
      const currentUser = req.user;
      const file = req.file;

      if (!file) return res.status(400).json({ error: 'No file uploaded' });

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          column: {
            select: {
              boardId: true,
              board: { select: { projectId: true, name: true, project: { select: { name: true } } } },
            },
          },
        },
      });

      if (!task) return res.status(404).json({ error: 'Task not found' });

      const accessInfo = await TaskController.verifyAccess(currentUser.id, task.columnId, currentUser.role);
      if (accessInfo === null || (typeof accessInfo === 'object' && !accessInfo.hasAccess)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      const { objectKey, bucket } = await StorageService.uploadFile(
        file.originalname, file.buffer, file.mimetype
      );

      const attachment = await prisma.attachment.create({
        data: {
          taskId, fileName: file.originalname,
          filePath: objectKey, fileSize: file.size,
          mimeType: file.mimetype, bucketName: bucket,
          uploadedById: currentUser.id,
        },
      });

      const boardId = task.column.boardId;
      await RedisService.del(RedisService.getBoardColumnsKey(boardId));
      await RedisService.del(RedisService.getTaskDetailKey(taskId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: task.column.board.projectId,
        projectName: task.column.board.project.name,
        boardId, boardName: task.column.board.name,
        taskId: task.id, taskTitle: task.title,
        action: 'FILE_UPLOADED',
        details: { attachmentId: attachment.id, fileName: attachment.fileName, objectKey, bucket },
        ipAddress: req.ip,
      });

      await QueueService.queueFileProcessing(attachment.id, attachment.fileName, objectKey);

      return res.status(201).json({ message: 'Attachment uploaded successfully', attachment });
    } catch (error) {
      next(error);
    }
  }

  static async deleteTask(req, res, next) {
    try {
      const { taskId } = req.params;
      const currentUser = req.user;

      const task = await prisma.task.findUnique({
        where: { id: taskId },
        include: {
          column: {
            select: {
              boardId: true,
              board: { select: { projectId: true, name: true, project: { select: { name: true } } } },
            },
          },
        },
      });

      if (!task) return res.status(404).json({ error: 'Task not found' });

      const accessInfo = await TaskController.verifyAccess(currentUser.id, task.columnId, currentUser.role);
      if (accessInfo === null || (typeof accessInfo === 'object' && !accessInfo.hasAccess)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      await prisma.task.delete({ where: { id: taskId } });

      const boardId = task.column.boardId;
      await RedisService.del(RedisService.getBoardColumnsKey(boardId));
      await RedisService.del(RedisService.getTaskDetailKey(taskId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: task.column.board.projectId,
        projectName: task.column.board.project.name,
        boardId, boardName: task.column.board.name,
        taskId: task.id, taskTitle: task.title,
        action: 'TASK_DELETED', details: {}, ipAddress: req.ip,
      });

      return res.json({ message: 'Task deleted successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { TaskController };
