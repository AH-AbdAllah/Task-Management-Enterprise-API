const { ZodError } = require('zod');

const errorHandler = (err, req, res, next) => {
  console.error('[Error Handler]', err);

  // Handle Zod Validation Errors
  if (err instanceof ZodError) {
    return res.status(400).json({
      error: 'Validation Error',
      details: err.errors.map((e) => ({
        path: e.path.join('.'),
        message: e.message,
      })),
    });
  }

  // Handle Prisma Database Errors
  if (err.code) {
    switch (err.code) {
      case 'P2002':
        return res.status(409).json({
          error: 'Database Conflict',
          message: `Unique constraint failed on field(s): ${err.meta?.target || ''}`,
        });
      case 'P2025':
        return res.status(404).json({
          error: 'Not Found',
          message: err.meta?.cause || 'Requested record was not found',
        });
      default:
        break;
    }
  }

  const statusCode = err.statusCode || 500;
  const message = err.message || 'Internal Server Error';

  return res.status(statusCode).json({
    error: err.name || 'InternalServerError',
    message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
  });
};

module.exports = { errorHandler };
