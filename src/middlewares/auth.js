const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'super-secure-secret-key-1234567890-enterprise-grade';

// Role hierarchy (higher index = more permissions)
const ROLE_HIERARCHY = ['VIEWER', 'DEVELOPER', 'PROJECT_MANAGER', 'ORG_OWNER', 'SYSTEM_ADMIN'];

const authenticateJWT = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Access token missing or invalid' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    return res.status(403).json({ error: 'Token is expired or invalid' });
  }
};

/**
 * Authorize based on a list of allowed roles.
 * Usage: authorizeRoles('PROJECT_MANAGER', 'SYSTEM_ADMIN')
 */
const authorizeRoles = (...allowedRoles) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges',
        required: allowedRoles,
        current: req.user.role,
      });
    }
    next();
  };
};

/**
 * Authorize based on minimum role level in the hierarchy.
 * Usage: authorizeMinRole('PROJECT_MANAGER') — allows PM, ORG_OWNER, SYSTEM_ADMIN
 */
const authorizeMinRole = (minRole) => {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Unauthorized' });

    const userRoleIndex = ROLE_HIERARCHY.indexOf(req.user.role);
    const minRoleIndex = ROLE_HIERARCHY.indexOf(minRole);

    if (userRoleIndex < minRoleIndex) {
      return res.status(403).json({
        error: 'Forbidden: Insufficient privileges',
        required: `${minRole} or above`,
        current: req.user.role,
      });
    }
    next();
  };
};

module.exports = { authenticateJWT, authorizeRoles, authorizeMinRole };
