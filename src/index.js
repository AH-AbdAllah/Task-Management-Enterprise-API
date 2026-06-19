const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// Configs & databases
const { initDatabases } = require('./config/db');
const { initMinio } = require('./config/minio');
const { startWorkers } = require('./services/queue.service');
const { initSocket } = require('./config/socket');

// Routers
const authRouter = require('./routes/auth.routes');
const teamRouter = require('./routes/team.routes');
const projectRouter = require('./routes/project.routes');
const boardRouter = require('./routes/board.routes');
const taskRouter = require('./routes/task.routes');
const commentRouter = require('./routes/comment.routes');
const notificationRouter = require('./routes/notification.routes');

// Error handler
const { errorHandler } = require('./middlewares/error');

const app = express();
const httpServer = http.createServer(app);

const PORT = process.env.PORT || 4000;

// ─── Global Security Middlewares ─────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'", "https://unpkg.com"],
      styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
      fontSrc: ["'self'", "https://fonts.gstatic.com"],
      connectSrc: ["'self'", "ws:", "wss:", "http:", "https:"],
      imgSrc: ["'self'", "data:", "blob:"]
    }
  }
}));
app.use(cors());

const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  message: { error: 'Too many requests. Please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
});
app.use(globalLimiter);

app.use(morgan('dev'));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Serve local upload files statically
const uploadDir = process.env.UPLOAD_DIR || 'uploads';
app.use('/uploads', express.static(path.join(process.cwd(), uploadDir)));

// Serve static frontend dashboard files
app.use(express.static(path.join(process.cwd(), 'public')));

// ─── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'healthy', timestamp: new Date(), uptime: process.uptime() });
});

// ─── API Routes ───────────────────────────────────────────────────────────────
app.use('/api/v1/auth', authRouter);
app.use('/api/v1/teams', teamRouter);
app.use('/api/v1/projects', projectRouter);
app.use('/api/v1/boards', boardRouter);
app.use('/api/v1/tasks', taskRouter);
app.use('/api/v1', commentRouter);
app.use('/api/v1/notifications', notificationRouter);

// ─── 404 Handler ──────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({ error: 'Endpoint Not Found' });
});

// ─── Global Error Handler ─────────────────────────────────────────────────────
app.use(errorHandler);

// ─── Server Bootstrap ─────────────────────────────────────────────────────────
const startServer = async () => {
  try {
    await initDatabases();

    const useMinio = process.env.USE_MINIO === 'true';
    if (useMinio) {
      try { await initMinio(); }
      catch (e) { console.warn('[MinIO] Could not connect. File uploads will fail:', e.message); }
    } else {
      if (!fs.existsSync(uploadDir)) {
        fs.mkdirSync(uploadDir, { recursive: true });
      }
      console.log(`[Storage] MinIO is disabled. Local uploads served at: http://localhost:${PORT}/uploads/`);
    }

    try { startWorkers(); }
    catch (e) { console.warn('[BullMQ] Could not start workers:', e.message); }

    initSocket(httpServer);
    console.log('[Socket.IO] Real-time server initialized.');

    httpServer.listen(PORT, () => {
      console.log('═══════════════════════════════════════════════');
      console.log(`🚀 API Server:    http://localhost:${PORT}`);
      console.log(`📡 WebSocket:     ws://localhost:${PORT}`);
      if (useMinio) {
        console.log(`🗄️  MinIO Console: http://localhost:9001`);
      } else {
        console.log(`📁 Local Storage:  ./${uploadDir}`);
      }
      console.log('═══════════════════════════════════════════════');
    });
  } catch (error) {
    console.error('Failed to start server:', error);
    process.exit(1);
  }
};

if (process.env.NODE_ENV !== 'test') {
  startServer();
}

module.exports = { app, httpServer };
