const db = require("../db");

class UserModel {
  static async getAll() {
    return await db.getUsers();
  }

  static async getByUsername(username) {
    return await db.getUserByUsername(username);
  }

  static async create(userData) {
    return await db.createUser(userData);
  }

  static async update(id, updates) {
    return await db.updateUser(id, updates);
  }

  static async delete(id) {
    return await db.deleteUser(id);
  }

  static async updateLastLogin(id) {
    return await db.updateLastLogin(id);
  }

  static async getInvitations() {
    return await db.getInvitations();
  }

  static async saveInvitations(invitations) {
    return await db.saveInvitations(invitations);
  }

  static async hasAdmin() {
    const users = await db.getUsers();
    return Array.isArray(users) && users.some(u => u.role === "admin");
  }
}

module.exports = UserModel;
