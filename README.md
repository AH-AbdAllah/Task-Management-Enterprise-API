# Task Management Enterprise API 🚀

An enterprise-grade task and project management system built with **Node.js**, **Express**, **Prisma ORM**, and **PostgreSQL (Neon)**. Features a complete REST API with JWT authentication, role-based access control, real-time WebSocket updates, interactive Kanban boards, and a built-in premium dark-themed web dashboard.

**Live Demo (Render):** [https://task-management-api-xxiu.onrender.com](https://task-management-api-xxiu.onrender.com)

Designed with a **resilient architecture** — runs fully locally without Docker by using seamless in-memory and local disk fallbacks for Redis, MinIO, and MongoDB.

---

## 🌟 Features

| Feature | Description |
|---|---|
| **JWT Authentication** | Signup, login, token refresh, and logout with secure access & refresh token rotation |
| **Role-Based Access (RBAC)** | Global roles: `SYSTEM_ADMIN`, `PROJECT_MANAGER`, `DEVELOPER`, `VIEWER` |
| **Teams & Members** | Create teams, invite members by email, assign team-level roles (`OWNER`, `MANAGER`, `MEMBER`) |
| **Projects** | Create projects within teams with descriptions and analytics |
| **Kanban Boards** | Create boards, add/reorder columns, and manage tasks visually |
| **Tasks** | Create, update, move between columns, set priority (`LOW`/`MEDIUM`/`HIGH`/`URGENT`), due dates, and assignees |
| **File Attachments** | Upload files to tasks (stored via MinIO or local disk fallback) |
| **Comments** | Add and delete comments on tasks |
| **Notifications** | In-app notifications for task assignments, updates, and team events |
| **Activity Logs** | Unified audit trail stored in PostgreSQL — tracks all user actions |
| **Real-Time Updates** | Socket.IO WebSocket integration for live board and activity updates |
| **Web Dashboard** | Built-in premium dark-themed UI with Kanban boards, analytics, and activity timeline |

---

## 🛠️ Tech Stack

| Layer | Technology |
|---|---|
| Runtime | Node.js |
| Framework | Express.js |
| Database | PostgreSQL (Neon Console) |
| ORM | Prisma |
| Auth | JWT (Access + Refresh Tokens) |
| Validation | Zod |
| Real-Time | Socket.IO |
| File Storage | MinIO / Local Disk Fallback |
| Queue | BullMQ / In-Memory Fallback |
| Logging | MongoDB / PostgreSQL Fallback |
| Security | Helmet, CORS, Rate Limiting |
| Testing | Jest + Supertest |
| Frontend | HTML, CSS, JavaScript (Vanilla) |

---

## 🏗️ Resilient Architecture (Service Fallbacks)

The system supports **service toggles** in the `.env` file. When external services are disabled, the application uses built-in fallbacks:

| Service | Toggle | When Disabled (`false`) |
|---|---|---|
| **MongoDB** | `USE_MONGO` | Activity logs saved directly to PostgreSQL `ActivityLog` table |
| **Redis** | `USE_REDIS` | Background jobs simulated with in-memory async queue |
| **MinIO** | `USE_MINIO` | File attachments stored in local `uploads/` directory |

---

## 📡 API Endpoints

### Authentication
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/auth/signup` | Register a new user (with role selection) |
| `POST` | `/api/v1/auth/login` | Login and receive JWT tokens |
| `POST` | `/api/v1/auth/refresh` | Refresh access token |
| `POST` | `/api/v1/auth/logout` | Revoke refresh token |

### Teams
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/teams` | Create a new team |
| `GET` | `/api/v1/teams/my` | Get teams for the current user |
| `POST` | `/api/v1/teams/:teamId/members` | Add a member to a team |
| `GET` | `/api/v1/teams/:teamId/members` | List team members |

### Projects
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/projects` | Create a new project |
| `GET` | `/api/v1/projects` | List user's projects |
| `GET` | `/api/v1/projects/:projectId` | Get project details |
| `GET` | `/api/v1/projects/:projectId/timeline` | Get project activity timeline |
| `GET` | `/api/v1/projects/:projectId/analytics` | Get project analytics |

### Boards & Columns
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/boards` | Create a board |
| `GET` | `/api/v1/boards/project/:projectId` | List boards for a project |
| `POST` | `/api/v1/boards/columns` | Create a column |
| `GET` | `/api/v1/boards/:boardId/columns` | Get columns with tasks |
| `PUT` | `/api/v1/boards/:boardId/columns/reorder` | Reorder columns |

### Tasks
| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/v1/tasks` | Create a new task |
| `PUT` | `/api/v1/tasks/:taskId` | Update a task |
| `PATCH` | `/api/v1/tasks/:taskId/move` | Move task to another column |
| `DELETE` | `/api/v1/tasks/:taskId` | Delete a task |
| `POST` | `/api/v1/tasks/:taskId/attachments` | Upload a file attachment |

### Comments
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/tasks/:taskId/comments` | Get task comments |
| `POST` | `/api/v1/tasks/:taskId/comments` | Add a comment |
| `DELETE` | `/api/v1/comments/:commentId` | Delete a comment |

### Notifications
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/api/v1/notifications` | Get user notifications |
| `PATCH` | `/api/v1/notifications/:notificationId/read` | Mark as read |
| `PATCH` | `/api/v1/notifications/read-all` | Mark all as read |

### Health
| Method | Endpoint | Description |
|---|---|---|
| `GET` | `/health` | Server health check |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js** v18+
- **PostgreSQL** database (recommended: [Neon Console](https://neon.tech))

### 1. Clone the Repository
```bash
git clone https://github.com/YOUR_USERNAME/Task-Management-Enterprise-API.git
cd Task-Management-Enterprise-API
```

### 2. Install Dependencies
```bash
npm install
```

### 3. Configure Environment Variables
Copy the example file and fill in your values:
```bash
cp .env.example .env
```
Key variables to set:
```env
DATABASE_URL="postgresql://user:password@host/dbname?sslmode=require"
JWT_SECRET="your-strong-secret-key"
USE_MONGO=false
USE_REDIS=false
USE_MINIO=false
```

### 4. Run Database Migrations
```bash
npx prisma migrate dev --name init
```

### 5. Start the Server
```bash
# Development (with hot reload)
npm run dev

# Production
npm start
```

The web dashboard will be available at: **http://localhost:4000**

---

## 🧪 Running Tests

```bash
npm test
```

Tests include authentication flows (signup, login, token refresh, logout) and full task lifecycle (team → project → board → column → task CRUD).

**Test Results:** ✅ 2 suites, 17 tests — all passing.

---

## 🌐 Deploying to Render

1. Push your code to **GitHub**.
2. Create a new **Web Service** on [Render](https://render.com).
3. Connect your GitHub repository.
4. Configure the service:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add **Environment Variables** on Render:
   | Variable | Value |
   |---|---|
   | `DATABASE_URL` | Your Neon PostgreSQL connection string |
   | `JWT_SECRET` | A strong random secret key |
   | `NODE_ENV` | `production` |
   | `USE_MONGO` | `false` |
   | `USE_REDIS` | `false` |
   | `USE_MINIO` | `false` |

---

## 📁 Project Structure

```
├── prisma/                  # Database schema & migrations
│   ├── schema.prisma        # Prisma models & enums
│   └── migrations/          # Migration history
├── public/                  # Web dashboard (HTML/CSS/JS)
│   ├── index.html           # Main dashboard page
│   ├── app.css              # Dark-themed styles
│   └── app.js               # Frontend API logic & UI
├── src/
│   ├── config/              # Database, storage, socket, multer configs
│   ├── controllers/         # Route handlers & business logic
│   ├── middlewares/          # Auth, validation, error handling
│   ├── models/              # MongoDB models (used when USE_MONGO=true)
│   ├── repositories/        # Prisma query abstraction layer
│   ├── services/            # Activity logs, queues, file storage
│   └── index.js             # Express app entry point
├── tests/                   # Jest test suites
├── .env.example             # Environment variables template
├── .gitignore               # Git ignore rules
├── package.json             # Dependencies & scripts
└── README.md                # This file
```

---

## 📜 License

This project is for educational and portfolio purposes.
