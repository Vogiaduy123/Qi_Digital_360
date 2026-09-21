const NotificationModel = require("../models/notificationModel");

class NotificationController {
  static async getNotifications(req, res) {
    try {
      const notifications = await NotificationModel.getAll();
      res.json({ success: true, notifications });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = NotificationController;
