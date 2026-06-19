const { prisma } = require('../config/db');
const { RedisService } = require('../services/redis.service');
const { ActivityService } = require('../services/activity.service');

const getProjectAccess = async (projectId, userId, role) => {
  const project = await prisma.project.findUnique({
    where: { id: projectId },
    include: { team: { include: { members: { select: { userId: true } } } } },
  });
  if (!project) return null;
  const isMember = project.team.members.some((m) => m.userId === userId);
  return { project, hasAccess: isMember || role === 'SYSTEM_ADMIN' };
};

class BoardController {
  static async createBoard(req, res, next) {
    try {
      const { name, projectId } = req.body;
      const currentUser = req.user;

      const result = await getProjectAccess(projectId, currentUser.id, currentUser.role);
      if (!result) return res.status(404).json({ error: 'Project not found' });
      if (!result.hasAccess) return res.status(403).json({ error: 'Access denied' });

      const board = await prisma.board.create({ data: { name, projectId } });
      await RedisService.del(RedisService.getProjectBoardsKey(projectId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId, projectName: result.project.name,
        boardId: board.id, boardName: board.name,
        action: 'BOARD_CREATED', details: {}, ipAddress: req.ip,
      });

      return res.status(201).json({ message: 'Board created successfully', board });
    } catch (error) {
      next(error);
    }
  }

  static async getProjectBoards(req, res, next) {
    try {
      const { projectId } = req.params;
      const currentUser = req.user;

      const result = await getProjectAccess(projectId, currentUser.id, currentUser.role);
      if (!result) return res.status(404).json({ error: 'Project not found' });
      if (!result.hasAccess) return res.status(403).json({ error: 'Access denied' });

      const cacheKey = RedisService.getProjectBoardsKey(projectId);
      const cached = await RedisService.get(cacheKey);
      if (cached) {
        console.log(`[Cache Hit] project boards: ${projectId}`);
        return res.json(cached);
      }

      const boards = await prisma.board.findMany({
        where: { projectId },
        include: { _count: { select: { columns: true } } },
      });

      await RedisService.set(cacheKey, boards, 3600);
      return res.json(boards);
    } catch (error) {
      next(error);
    }
  }

  static async createColumn(req, res, next) {
    try {
      const { name, boardId, position } = req.body;
      const currentUser = req.user;

      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { project: { include: { team: { include: { members: { select: { userId: true } } } } } } },
      });

      if (!board) return res.status(404).json({ error: 'Board not found' });

      const isMember = board.project.team.members.some((m) => m.userId === currentUser.id);
      if (!isMember && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      let colPosition = position;
      if (colPosition === undefined) {
        const count = await prisma.boardColumn.count({ where: { boardId } });
        colPosition = count;
      }

      const column = await prisma.boardColumn.create({ data: { name, boardId, position: colPosition } });
      await RedisService.del(RedisService.getBoardColumnsKey(boardId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: board.project.id, projectName: board.project.name,
        boardId: board.id, boardName: board.name,
        action: 'COLUMN_CREATED', details: { columnName: column.name, position: column.position },
        ipAddress: req.ip,
      });

      return res.status(201).json({ message: 'Column created successfully', column });
    } catch (error) {
      next(error);
    }
  }

  static async getBoardColumns(req, res, next) {
    try {
      const { boardId } = req.params;
      const currentUser = req.user;

      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { project: { include: { team: { include: { members: { select: { userId: true } } } } } } },
      });

      if (!board) return res.status(404).json({ error: 'Board not found' });

      const isMember = board.project.team.members.some((m) => m.userId === currentUser.id);
      if (!isMember && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const cacheKey = RedisService.getBoardColumnsKey(boardId);
      const cached = await RedisService.get(cacheKey);
      if (cached) {
        console.log(`[Cache Hit] board columns: ${boardId}`);
        return res.json(cached);
      }

      const columns = await prisma.boardColumn.findMany({
        where: { boardId },
        orderBy: { position: 'asc' },
        include: {
          tasks: {
            orderBy: { createdAt: 'desc' },
            include: {
              assignee: { select: { id: true, name: true, email: true } },
              attachments: { select: { id: true, fileName: true, fileSize: true, createdAt: true } },
            },
          },
        },
      });

      await RedisService.set(cacheKey, columns, 3600);
      return res.json(columns);
    } catch (error) {
      next(error);
    }
  }

  static async reorderColumns(req, res, next) {
    try {
      const { boardId } = req.params;
      const { columnOrders } = req.body;
      const currentUser = req.user;

      const board = await prisma.board.findUnique({
        where: { id: boardId },
        include: { project: { include: { team: { include: { members: { select: { userId: true } } } } } } },
      });

      if (!board) return res.status(404).json({ error: 'Board not found' });

      const isMember = board.project.team.members.some((m) => m.userId === currentUser.id);
      if (!isMember && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      await prisma.$transaction(
        columnOrders.map((item) =>
          prisma.boardColumn.update({
            where: { id: item.columnId, boardId },
            data: { position: item.position },
          })
        )
      );

      await RedisService.del(RedisService.getBoardColumnsKey(boardId));

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: board.project.id, projectName: board.project.name,
        boardId: board.id, boardName: board.name,
        action: 'COLUMNS_REORDERED', details: { columnOrders }, ipAddress: req.ip,
      });

      return res.json({ message: 'Columns reordered successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { BoardController };
