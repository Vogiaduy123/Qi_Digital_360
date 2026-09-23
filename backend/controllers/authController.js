const db = require("../db");
const crypto = require("crypto");
const { hashPassword, comparePassword, signToken } = require("../services/authService");
const { resetLoginAttempts } = require("../middlewares/loginRateLimiter");

class AuthController {
  // GET /api/auth/setup-status
  static async getSetupStatus(req, res) {
    try {
      const users = await db.getUsers();
      const hasAdmin = Array.isArray(users) && users.some(u => u.role === "admin");
      res.json({ success: true, isSetup: hasAdmin, hasAdmin });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/auth/setup
  static async setupAdmin(req, res) {
    try {
      const users = await db.getUsers();
      const hasAdmin = Array.isArray(users) && users.some(u => u.role === "admin");
      if (hasAdmin) {
        return res.status(403).json({ success: false, error: "Hệ thống đã có tài khoản quản trị." });
      }

      const { username, password, displayName } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ tên đăng nhập và mật khẩu." });
      }

      const passwordHash = hashPassword(password);
      const newUser = await db.createUser({
        username: String(username).trim(),
        passwordHash,
        role: "admin",
        displayName: displayName ? String(displayName).trim() : username
      });

      res.json({
        success: true,
        message: "Khởi tạo tài khoản Quản Trị Viên đầu tiên thành công!",
        user: { username: newUser.username, role: newUser.role }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/auth/login
  static async login(req, res) {
    try {
      const { username, password, rememberMe } = req.body;
      if (!username || !password) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập tên đăng nhập và mật khẩu" });
      }

      const user = await db.getUserByUsername(String(username).trim());
      if (!user || !comparePassword(password, user.password_hash)) {
        return res.status(401).json({ success: false, error: "Tên đăng nhập hoặc mật khẩu không chính xác" });
      }

      await db.updateLastLogin(user.id);

      // Reset brute-force counter cho IP này sau khi đăng nhập thành công
      const clientIp = req.ip ||
        req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
        req.connection?.remoteAddress;
      if (clientIp) resetLoginAttempts(clientIp);

      const token = signToken({
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.display_name
      });

      const isProduction = process.env.NODE_ENV === "production";
      const cookieOptions = {
        httpOnly: true,
        secure: isProduction,
        sameSite: "lax",
        maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 24 * 60 * 60 * 1000
      };

      res.cookie("vt_token", token, cookieOptions);

      res.json({
        success: true,
        token,
        user: {
          id: user.id,
          username: user.username,
          role: user.role,
          displayName: user.display_name
        }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/auth/logout
  static logout(req, res) {
    res.clearCookie("vt_token", { path: "/" });
    res.json({ success: true, message: "Đã đăng xuất" });
  }

  // GET /api/auth/me
  static getMe(req, res) {
    res.json({ success: true, user: req.user });
  }

  // POST /api/auth/me/profile
  static async updateProfile(req, res) {
    const { displayName, newPassword } = req.body;
    const userId = req.user.id;

    try {
      const updates = {};
      if (displayName) updates.displayName = String(displayName).trim();
      if (newPassword) updates.passwordHash = hashPassword(newPassword);

      const updated = await db.updateUser(userId, updates);
      res.json({ success: true, user: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/auth/invitations/verify
  static async verifyInvitation(req, res) {
    try {
      const { token } = req.query;
      if (!token) return res.status(400).json({ success: false, error: "Missing token" });

      const invitations = await db.getInvitations();
      const inv = invitations.find(i => i.token === token);
      if (!inv) return res.status(404).json({ success: false, error: "Mã mời không tồn tại." });
      if (inv.used) return res.status(400).json({ success: false, error: "Mã mời này đã được sử dụng." });
      if (new Date(inv.expiresAt) < new Date()) {
        return res.status(400).json({ success: false, error: "Mã mời này đã hết hạn sử dụng." });
      }

      res.json({ success: true, email: inv.email, role: inv.role });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/auth/invitations/accept
  static async acceptInvitation(req, res) {
    try {
      const { token, password, displayName } = req.body;
      if (!token || !password) {
        return res.status(400).json({ success: false, error: "Vui lòng nhập mật khẩu" });
      }

      const invitations = await db.getInvitations();
      const inv = invitations.find(i => i.token === token);
      if (!inv) return res.status(404).json({ success: false, error: "Mã mời không tồn tại." });
      if (inv.used) return res.status(400).json({ success: false, error: "Mã mời này đã được sử dụng." });
      if (new Date(inv.expiresAt) < new Date()) {
        return res.status(400).json({ success: false, error: "Mã mời đã hết hạn." });
      }

      const cleanUsername = String(inv.email).trim().toLowerCase();
      const existing = await db.getUserByUsername(cleanUsername);
      if (existing) {
        return res.status(400).json({ success: false, error: `Tài khoản với Email "${cleanUsername}" đã tồn tại.` });
      }

      const passwordHash = hashPassword(password);
      const newUser = await db.createUser({
        username: cleanUsername,
        passwordHash,
        role: inv.role,
        displayName: displayName ? String(displayName).trim() : cleanUsername
      });

      inv.used = true;
      inv.usedAt = new Date().toISOString();
      inv.registeredUsername = cleanUsername;
      await db.saveInvitations(invitations);

      res.json({
        success: true,
        message: "Đăng ký tài khoản thành công!",
        user: { username: newUser.username, role: newUser.role }
      });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // --- ADMIN USER MANAGEMENT ---

  // GET /api/admin/users
  static async getAdminUsers(req, res) {
    try {
      const users = await db.getUsers();
      // Lọc bỏ password_hash — không bao giờ trả về client
      const safeUsers = Array.isArray(users)
        ? users.map(({ password_hash, ...rest }) => rest)
        : [];
      res.json({ success: true, users: safeUsers });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/users/invite
  static async inviteUser(req, res) {
    const { email, role } = req.body;
    if (!email) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập địa chỉ email" });
    }

    try {
      const invitations = await db.getInvitations();
      const token = crypto.randomBytes(24).toString("hex");
      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const newInvite = {
        token,
        email: String(email).trim().toLowerCase(),
        role: role || "collaborator",
        createdAt: new Date().toISOString(),
        createdBy: req.user.username,
        expiresAt,
        used: false
      };

      invitations.push(newInvite);
      await db.saveInvitations(invitations);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const inviteLink = `${baseUrl}/admin/invite-register.html?token=${token}`;

      res.json({ success: true, inviteLink, invite: newInvite });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/users (Tạo trực tiếp)
  static async createDirectUser(req, res) {
    const { username, password, role, displayName } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, error: "Vui lòng nhập đầy đủ username và password" });
    }

    try {
      const cleanUsername = String(username).trim();
      const existing = await db.getUserByUsername(cleanUsername);
      if (existing) {
        return res.status(400).json({ success: false, error: "Tên đăng nhập đã tồn tại" });
      }

      const passwordHash = hashPassword(password);
      const newUser = await db.createUser({
        username: cleanUsername,
        passwordHash,
        role: role || "collaborator",
        displayName: displayName ? String(displayName).trim() : cleanUsername
      });

      res.json({ success: true, user: newUser });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/admin/users/:id
  static async updateUserDirect(req, res) {
    const userId = Number(req.params.id);
    const { role, displayName, password } = req.body;

    try {
      const updates = {};
      if (role && ["admin", "collaborator", "viewer", "user"].includes(role)) {
        updates.role = role;
      }
      if (displayName) updates.displayName = String(displayName).trim();
      if (password && password.length >= 6) updates.passwordHash = hashPassword(password);

      const updated = await db.updateUser(userId, updates);
      res.json({ success: true, user: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // PATCH /api/admin/users/:id/role
  static async updateUserRole(req, res) {
    const userId = Number(req.params.id);
    const { role } = req.body;

    if (!["admin", "collaborator", "viewer", "user"].includes(role)) {
      return res.status(400).json({ success: false, error: "Vai trò không hợp lệ" });
    }

    try {
      const updated = await db.updateUser(userId, { role });
      res.json({ success: true, user: updated });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/users/:id/reset-password
  static async resetUserPassword(req, res) {
    const userId = Number(req.params.id);
    const { newPassword } = req.body;

    if (!newPassword || newPassword.length < 6) {
      return res.status(400).json({ success: false, error: "Mật khẩu mới tối thiểu 6 ký tự" });
    }

    try {
      await db.updateUser(userId, { passwordHash: hashPassword(newPassword) });
      res.json({ success: true, message: "Đặt lại mật khẩu thành công" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/users/:id
  static async deleteUser(req, res) {
    const userId = Number(req.params.id);

    try {
      if (req.user.id === userId) {
        return res.status(400).json({ success: false, error: "Không thể tự xóa tài khoản của chính mình" });
      }

      await db.deleteUser(userId);
      res.json({ success: true, message: "Đã xóa tài khoản thành công" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // GET /api/admin/invitations
  static async getAdminInvitations(req, res) {
    try {
      const invitations = await db.getInvitations();
      res.json({ success: true, invitations });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // DELETE /api/admin/invitations/:identifier (token or id)
  static async deleteInvitation(req, res) {
    const identifier = req.params.token || req.params.id;
    try {
      let invitations = await db.getInvitations();
      invitations = invitations.filter(i => String(i.token) !== String(identifier) && String(i.id) !== String(identifier));
      await db.saveInvitations(invitations);
      res.json({ success: true, message: "Đã thu hồi lời mời thành công!" });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }

  // POST /api/admin/invitations/:id/resend
  static async resendInvitation(req, res) {
    const identifier = req.params.id || req.params.token;
    try {
      const invitations = await db.getInvitations();
      const inv = invitations.find(i => String(i.id) === String(identifier) || String(i.token) === String(identifier));
      if (!inv) {
        return res.status(404).json({ success: false, error: "Không tìm thấy thông tin lời mời." });
      }

      inv.expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString();
      inv.used = false;
      await db.saveInvitations(invitations);

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const inviteLink = `${baseUrl}/admin/invite-register.html?token=${inv.token}`;

      res.json({ success: true, message: "Đã gia hạn lời mời thành công!", inviteLink });
    } catch (err) {
      res.status(500).json({ success: false, error: err.message });
    }
  }
}

module.exports = AuthController;
