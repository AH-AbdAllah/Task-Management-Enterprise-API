const { Router } = require('express');
const { NotificationController } = require('../controllers/notification.controller');
const { authenticateJWT } = require('../middlewares/auth');

const router = Router();
router.use(authenticateJWT);

router.get('/', NotificationController.getMyNotifications);
router.patch('/:notificationId/read', NotificationController.markAsRead);
router.patch('/read-all', NotificationController.markAllAsRead);

module.exports = router;
