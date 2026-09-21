const { verifyToken } = require("../services/authService");

function authMiddleware(req, res, next) {
  let token = null;

  // 1. Check Authorization header first
  if (req.headers.authorization && req.headers.authorization.startsWith("Bearer ")) {
    token = req.headers.authorization.split(" ")[1];
  } 
  // 2. Check cookies as fallback
  else if (req.cookies && req.cookies.vt_token) {
    token = req.cookies.vt_token;
  }

  if (!token) {
    return res.status(401).json({ success: false, error: "Unauthorized: No token provided" });
  }

  const decoded = verifyToken(token);
  if (!decoded) {
    return res.status(401).json({ success: false, error: "Unauthorized: Invalid or expired token" });
  }

  req.user = decoded;
  next();
}

module.exports = authMiddleware;
