const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { AuthController } = require('../controllers/auth.controller');
const { validate, signupSchema, loginSchema } = require('../middlewares/validation');

const router = Router();

const authLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 5,
  message: { error: 'Too many attempts. Please wait 1 minute and try again.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/signup', authLimiter, validate(signupSchema), AuthController.signup);
router.post('/login', authLimiter, validate(loginSchema), AuthController.login);
router.post('/refresh', AuthController.refresh);
router.post('/logout', AuthController.logout);

module.exports = router;
