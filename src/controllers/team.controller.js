const { prisma } = require('../config/db');
const { ActivityService } = require('../services/activity.service');

class TeamController {
  static async createTeam(req, res, next) {
    try {
      const { name } = req.body;
      const currentUser = req.user;

      const team = await prisma.$transaction(async (tx) => {
        const newTeam = await tx.team.create({ data: { name } });
        await tx.teamMember.create({
          data: { teamId: newTeam.id, userId: currentUser.id, role: 'OWNER' },
        });
        return newTeam;
      });

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        action: 'TEAM_CREATED', details: { teamId: team.id, teamName: team.name }, ipAddress: req.ip,
      });

      return res.status(201).json({ message: 'Team created successfully', team });
    } catch (error) {
      next(error);
    }
  }

  static async addMember(req, res, next) {
    try {
      const { teamId } = req.params;
      const { userId, email, role } = req.body;
      const currentUser = req.user;

      const requesterMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: currentUser.id } },
      });

      if (!requesterMember || (requesterMember.role !== 'OWNER' && requesterMember.role !== 'MANAGER')) {
        return res.status(403).json({ error: 'Only owners or managers can add members' });
      }

      let targetUser;
      if (email) {
        targetUser = await prisma.user.findUnique({ where: { email } });
      } else if (userId) {
        targetUser = await prisma.user.findUnique({ where: { id: userId } });
      }

      if (!targetUser) return res.status(404).json({ error: 'User to add not found' });

      // Check if already a member
      const existingMember = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: targetUser.id } }
      });
      if (existingMember) return res.status(400).json({ error: 'User is already a member of this team' });

      const member = await prisma.teamMember.create({
        data: { teamId, userId: targetUser.id, role: role || 'MEMBER' },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      await ActivityService.log({
        userId: currentUser.id, userName: currentUser.name, userEmail: currentUser.email,
        action: 'TEAM_MEMBER_ADDED', details: { teamId, addedUserId: targetUser.id, role: member.role },
        ipAddress: req.ip,
      });

      return res.status(201).json({ message: 'Member added successfully', member });
    } catch (error) {
      next(error);
    }
  }

  static async getMyTeams(req, res, next) {
    try {
      const currentUser = req.user;

      const teamMemberships = await prisma.teamMember.findMany({
        where: { userId: currentUser.id },
        include: {
          team: { include: { _count: { select: { members: true } } } },
        },
      });

      const teams = teamMemberships.map((m) => ({ ...m.team, myRole: m.role }));
      return res.json(teams);
    } catch (error) {
      next(error);
    }
  }

  static async getTeamMembers(req, res, next) {
    try {
      const { teamId } = req.params;
      const currentUser = req.user;

      const membership = await prisma.teamMember.findUnique({
        where: { teamId_userId: { teamId, userId: currentUser.id } },
      });

      if (!membership && currentUser.role !== 'SYSTEM_ADMIN') {
        return res.status(403).json({ error: 'You are not a member of this team' });
      }

      const members = await prisma.teamMember.findMany({
        where: { teamId },
        include: { user: { select: { id: true, name: true, email: true } } },
      });

      return res.json(members);
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { TeamController };
