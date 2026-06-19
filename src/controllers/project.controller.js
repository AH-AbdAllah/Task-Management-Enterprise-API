const { prisma } = require('../config/db');
const { ActivityService } = require('../services/activity.service');

class ProjectController {
  static async createProject(req, res, next) {
    try {
      const { name, description, teamId } = req.body;
      const currentUser = req.user;

      const member = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: currentUser.id } },
      });

      if (!member || (member.role !== 'OWNER' && member.role !== 'MANAGER' && currentUser.role !== 'SYSTEM_ADMIN')) {
        return res.status(403).json({ error: 'Only team owners/managers can create projects' });
      }

      const project = await prisma.project.create({ data: { name, description, teamId } });

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        projectId: project.id, projectName: project.name,
        action: 'PROJECT_CREATED', details: { teamId }, ipAddress: req.ip,
      });

      return res.status(201).json({ message: 'Project created successfully', project });
    } catch (error) {
      next(error);
    }
  }

  static async getMyProjects(req, res, next) {
    try {
      const currentUser = req.user;

      const projects = await prisma.project.findMany({
        where: { team: { members: { some: { userId: currentUser.id } } } },
        include: { team: { select: { name: true } } },
      });

      return res.json(projects);
    } catch (error) {
      next(error);
    }
  }

  static async getProjectDetails(req, res, next) {
    try {
      const { projectId } = req.params;
      const currentUser = req.user;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { team: { include: { members: { select: { userId: true } } } } },
      });

      if (!project) return res.status(404).json({ error: 'Project not found' });

      const isMember = project.team.members.some((m) => m.userId === currentUser.id);
      if (!isMember && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      return res.json({
        id: project.id, name: project.name,
        description: project.description, teamId: project.teamId, createdAt: project.createdAt,
      });
    } catch (error) {
      next(error);
    }
  }

  static async getProjectTimeline(req, res, next) {
    try {
      const { projectId } = req.params;
      const currentUser = req.user;
      const limit = parseInt(req.query.limit) || 50;
      const skip = parseInt(req.query.skip) || 0;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { team: { include: { members: { select: { userId: true } } } } },
      });

      if (!project) return res.status(404).json({ error: 'Project not found' });

      const isMember = project.team.members.some((m) => m.userId === currentUser.id);
      if (!isMember && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const timeline = await ActivityService.getProjectTimeline(projectId, limit, skip);
      return res.json(timeline);
    } catch (error) {
      next(error);
    }
  }

  static async getProjectAnalytics(req, res, next) {
    try {
      const { projectId } = req.params;
      const currentUser = req.user;

      const project = await prisma.project.findUnique({
        where: { id: projectId },
        include: { team: { include: { members: { select: { userId: true } } } } },
      });

      if (!project) return res.status(404).json({ error: 'Project not found' });

      const isMember = project.team.members.some((m) => m.userId === currentUser.id);
      if (!isMember && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'Access denied' });
      }

      const tasks = await prisma.task.findMany({
        where: { column: { board: { projectId } } },
        include: {
          column: { select: { name: true } },
          assignee: { select: { id: true, name: true, email: true } },
        },
      });

      const totalTasks = tasks.length;
      const now = new Date();

      const columnBreakdown = {};
      const priorityBreakdown = {};
      const assigneeBreakdown = {};

      let completedTasks = 0;
      let overdueTasks = 0;
      let totalCompletionTimeMs = 0;
      let completionTimeSamples = 0;

      const velocityWeeks = { 'week-1': 0, 'week-2': 0, 'week-3': 0, 'week-4': 0 };

      tasks.forEach((task) => {
        const columnName = task.column.name;
        const isCompleted = columnName.toLowerCase() === 'done' || columnName.toLowerCase() === 'completed';

        columnBreakdown[columnName] = (columnBreakdown[columnName] || 0) + 1;
        priorityBreakdown[task.priority] = (priorityBreakdown[task.priority] || 0) + 1;

        if (isCompleted) {
          completedTasks++;
          totalCompletionTimeMs += task.updatedAt.getTime() - task.createdAt.getTime();
          completionTimeSamples++;

          for (let i = 0; i < 4; i++) {
            const weekEnd = new Date(now);
            weekEnd.setDate(now.getDate() - i * 7);
            const weekStart = new Date(now);
            weekStart.setDate(now.getDate() - (i + 1) * 7);
            if (task.updatedAt >= weekStart && task.updatedAt < weekEnd) {
              velocityWeeks[`week-${i + 1}`]++;
            }
          }
        }

        if (!isCompleted && task.dueDate && task.dueDate < now) overdueTasks++;

        const assigneeId = task.assigneeId || 'unassigned';
        const assigneeName = task.assignee ? task.assignee.name : 'Unassigned';
        if (!assigneeBreakdown[assigneeId]) {
          assigneeBreakdown[assigneeId] = { total: 0, pending: 0, completed: 0, name: assigneeName };
        }
        assigneeBreakdown[assigneeId].total++;
        isCompleted ? assigneeBreakdown[assigneeId].completed++ : assigneeBreakdown[assigneeId].pending++;
      });

      return res.json({
        projectId, projectName: project.name, totalTasks, completedTasks,
        completionRate: `${totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0}%`,
        overdueRate: `${totalTasks > 0 ? Math.round((overdueTasks / totalTasks) * 100) : 0}%`,
        avgCompletionTimeHours: completionTimeSamples > 0
          ? Math.round(totalCompletionTimeMs / completionTimeSamples / 1000 / 3600 * 10) / 10
          : null,
        velocity: velocityWeeks, columnBreakdown, priorityBreakdown, assigneeBreakdown,
      });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { ProjectController };
