const { NotificationRepository } = require('../repositories/notification.repository');

class NotificationController {
  static async getMyNotifications(req, res, next) {
    try {
      const currentUser = req.user;
      const limit = parseInt(req.query.limit) || 30;
      const skip = parseInt(req.query.skip) || 0;

      const [notifications, unreadCount] = await Promise.all([
        NotificationRepository.findByUserId(currentUser.id, limit, skip),
        NotificationRepository.countUnread(currentUser.id),
      ]);

      return res.json({ notifications, unreadCount });
    } catch (error) {
      next(error);
    }
  }

  static async markAsRead(req, res, next) {
    try {
      const { notificationId } = req.params;
      const currentUser = req.user;
      await NotificationRepository.markAsRead(notificationId, currentUser.id);
      return res.json({ message: 'Notification marked as read' });
    } catch (error) {
      next(error);
    }
  }

  static async markAllAsRead(req, res, next) {
    try {
      const currentUser = req.user;
      await NotificationRepository.markAllAsRead(currentUser.id);
      return res.json({ message: 'All notifications marked as read' });
    } catch (error) {
      next(error);
    }
  }
}

module.exports = { NotificationController };
