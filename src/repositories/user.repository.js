const { prisma } = require('../config/db');

class UserRepository {
  static async findById(id) {
    return prisma.user.findUnique({
      where: { id },
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  static async findByEmail(email) {
    return prisma.user.findUnique({ where: { email } });
  }

  static async create(data) {
    return prisma.user.create({
      data,
      select: { id: true, email: true, name: true, role: true, createdAt: true },
    });
  }

  static async saveRefreshToken(userId, token, expiresAt) {
    return prisma.refreshToken.create({ data: { userId, token, expiresAt } });
  }

  static async findRefreshToken(token) {
    return prisma.refreshToken.findUnique({
      where: { token },
      include: { user: true },
    });
  }

  static async deleteRefreshToken(token) {
    return prisma.refreshToken.delete({ where: { token } });
  }

  static async deleteAllRefreshTokens(userId) {
    return prisma.refreshToken.deleteMany({ where: { userId } });
  }
}

module.exports = { UserRepository };
