const { Server: SocketIOServer } = require('socket.io');
const jwt = require('jsonwebtoken');
require('dotenv').config();

let io;

const initSocket = (httpServer) => {
  io = new SocketIOServer(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
  });

  const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-1234567890-enterprise-grade';

  io.use((socket, next) => {
    const token =
      socket.handshake.auth?.token ||
      socket.handshake.headers?.authorization?.split(' ')[1];

    if (!token) return next(new Error('Authentication error: No token provided'));

    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (err) {
      return next(new Error('Authentication error: Invalid token'));
    }
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    console.log(`[Socket.IO] User connected: ${user?.email} (${socket.id})`);

    socket.on('join:project', (projectId) => {
      socket.join(`project:${projectId}`);
      console.log(`[Socket.IO] ${user?.email} joined project:${projectId}`);
    });

    socket.on('join:task', (taskId) => {
      socket.join(`task:${taskId}`);
    });

    socket.on('leave:project', (projectId) => {
      socket.leave(`project:${projectId}`);
    });

    socket.on('disconnect', () => {
      console.log(`[Socket.IO] User disconnected: ${user?.email}`);
    });
  });

  return io;
};

const emitToProject = (projectId, event, data) => {
  if (!io) return;
  io.to(`project:${projectId}`).emit(event, data);
};

const emitToTask = (taskId, event, data) => {
  if (!io) return;
  io.to(`task:${taskId}`).emit(event, data);
};

const emitToUser = (userId, event, data) => {
  if (!io) return;
  io.to(`user:${userId}`).emit(event, data);
};

const getIO = () => io;

module.exports = { initSocket, emitToProject, emitToTask, emitToUser, getIO };
