const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { UserRepository } = require('../repositories/user.repository');
const { ActivityService } = require('../services/activity.service');
require('dotenv').config();

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-1234567890-enterprise-grade';
const JWT_ACCESS_EXPIRES_IN = process.env.JWT_ACCESS_EXPIRES_IN || '15m';
const JWT_REFRESH_EXPIRES_IN = process.env.JWT_REFRESH_EXPIRES_IN || '7d';

const generateAccessToken = (payload) =>
  jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_ACCESS_EXPIRES_IN });

const generateRefreshToken = () => crypto.randomBytes(64).toString('hex');

const getRefreshTokenExpiry = () => {
  const days = parseInt(JWT_REFRESH_EXPIRES_IN.replace('d', '')) || 7;
  const expiry = new Date();
  expiry.setDate(expiry.getDate() + days);
  return expiry;
};

class AuthController {
  static async signup(req, res, next) {
    try {
      const { email, password, name, role } = req.body;

      const existingUser = await UserRepository.findByEmail(email);
      if (existingUser) {
        return res.status(409).json({ error: 'An account with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await UserRepository.create({ email, passwordHash, name, role: role || 'DEVELOPER' });

      await ActivityService.log({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'USER_REGISTERED', details: { email: user.email }, ipAddress: req.ip,
      });

      return res.status(201).json({ message: 'Account created successfully', user });
    } catch (error) {
      next(error);
    }
  }

  static async login(req, res, next) {
    try {
      const { email, password } = req.body;

      const user = await UserRepository.findByEmail(email);
      if (!user) return res.status(401).json({ error: 'Invalid email or password' });

      const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
      if (!isPasswordValid) return res.status(401).json({ error: 'Invalid email or password' });

      const tokenPayload = { id: user.id, email: user.email, name: user.name, role: user.role };
      const accessToken = generateAccessToken(tokenPayload);
      const refreshToken = generateRefreshToken();
      const expiresAt = getRefreshTokenExpiry();

      await UserRepository.saveRefreshToken(user.id, refreshToken, expiresAt);

      await ActivityService.log({
        userId: user.id, userName: user.name, userEmail: user.email,
        action: 'USER_LOGIN', details: {}, ipAddress: req.ip,
      });

      return res.json({
        accessToken,
        refreshToken,
        expiresIn: JWT_ACCESS_EXPIRES_IN,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
      });
    } catch (error) {
      next(error);
    }
  }

  static async refresh(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

      const storedToken = await UserRepository.findRefreshToken(refreshToken);
      if (!storedToken) return res.status(403).json({ error: 'Invalid or expired refresh token' });

      if (new Date() > storedToken.expiresAt) {
        await UserRepository.deleteRefreshToken(refreshToken);
        return res.status(403).json({ error: 'Refresh token has expired. Please log in again.' });
      }

      const user = storedToken.user;
      await UserRepository.deleteRefreshToken(refreshToken);

      const newRefreshToken = generateRefreshToken();
      await UserRepository.saveRefreshToken(user.id, newRefreshToken, getRefreshTokenExpiry());

      const newAccessToken = generateAccessToken({
        id: user.id, email: user.email, name: user.name, role: user.role,
      });

      return res.json({
        accessToken: newAccessToken,
        refreshToken: newRefreshToken,
        expiresIn: JWT_ACCESS_EXPIRES_IN,
      });
    } catch (error) {
      next(error);
    }
  }

  static async logout(req, res, next) {
    try {
      const { refreshToken } = req.body;
      if (!refreshToken) return res.status(400).json({ error: 'Refresh token is required' });

      await UserRepository.deleteRefreshToken(refreshToken).catch(() => {});
      return res.json({ message: 'Logged out successfully' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { AuthController };
