const notificationService = require("../services/notificationService");

class NotificationModel {
  static async getAll() {
    return await notificationService.getNotifications();
  }

  static async create(type, title, message, createdBy) {
    return await notificationService.createNotification(type, title, message, createdBy);
  }
}

module.exports = NotificationModel;
