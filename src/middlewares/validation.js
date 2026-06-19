const { z } = require('zod');

const validate = (schema) => {
  return async (req, res, next) => {
    try {
      await schema.parseAsync({ body: req.body, query: req.query, params: req.params });
      next();
    } catch (error) {
      next(error);
    }
  };
};

// --- Auth Schemas ---
const signupSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(6, 'Password must be at least 6 characters long'),
    name: z.string().min(2, 'Name must be at least 2 characters long'),
    role: z.enum(['SYSTEM_ADMIN', 'ORG_OWNER', 'PROJECT_MANAGER', 'DEVELOPER', 'VIEWER']).optional(),
  }),
});

const loginSchema = z.object({
  body: z.object({
    email: z.string().email('Invalid email address'),
    password: z.string().min(1, 'Password is required'),
  }),
});

const refreshTokenSchema = z.object({
  body: z.object({
    refreshToken: z.string().min(1, 'Refresh token is required'),
  }),
});

// --- Team Schemas ---
const createTeamSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Team name must be at least 2 characters long'),
  }),
});

const addTeamMemberSchema = z.object({
  body: z.object({
    userId: z.string().uuid('Invalid user ID format').optional(),
    email: z.string().email('Invalid email format').optional(),
    role: z.enum(['OWNER', 'MANAGER', 'MEMBER']).default('MEMBER'),
  }).refine(data => data.userId || data.email, {
    message: "Either userId or email must be provided",
    path: ["email"]
  }),
});

// --- Project Schemas ---
const createProjectSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Project name must be at least 2 characters long'),
    description: z.string().optional(),
    teamId: z.string().uuid('Invalid team ID format'),
  }),
});

// --- Board Schemas ---
const createBoardSchema = z.object({
  body: z.object({
    name: z.string().min(2, 'Board name must be at least 2 characters long'),
    projectId: z.string().uuid('Invalid project ID format'),
  }),
});

// --- Column Schemas ---
const createColumnSchema = z.object({
  body: z.object({
    name: z.string().min(1, 'Column name is required'),
    boardId: z.string().uuid('Invalid board ID format'),
    position: z.number().int().nonnegative().optional(),
  }),
});

// --- Task Schemas ---
const createTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1, 'Task title is required'),
    description: z.string().optional(),
    columnId: z.string().uuid('Invalid column ID format'),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).default('MEDIUM'),
    dueDate: z.string().optional(),
    assigneeId: z.string().uuid().optional().nullable(),
  }),
});

const updateTaskSchema = z.object({
  body: z.object({
    title: z.string().min(1).optional(),
    description: z.string().optional(),
    columnId: z.string().uuid().optional(),
    priority: z.enum(['LOW', 'MEDIUM', 'HIGH', 'URGENT']).optional(),
    dueDate: z.string().optional().nullable(),
    assigneeId: z.string().uuid().optional().nullable(),
  }),
});

const moveTaskSchema = z.object({
  body: z.object({
    columnId: z.string().uuid('Invalid column ID format'),
  }),
});

// --- Comment Schemas ---
const createCommentSchema = z.object({
  body: z.object({
    content: z.string().min(1, 'Comment content is required').max(5000),
  }),
});

module.exports = {
  validate,
  signupSchema, loginSchema, refreshTokenSchema,
  createTeamSchema, addTeamMemberSchema,
  createProjectSchema,
  createBoardSchema, createColumnSchema,
  createTaskSchema, updateTaskSchema, moveTaskSchema,
  createCommentSchema,
};
