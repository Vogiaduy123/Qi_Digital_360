const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const env = require("../config/env");
const JWT_SECRET = env.JWT_SECRET || process.env.JWT_SECRET || "vt_secret_key_qi_360_security_key_random";

function hashPassword(password) {
  return bcrypt.hashSync(password, 10);
}

function comparePassword(password, hash) {
  try {
    return bcrypt.compareSync(password, hash);
  } catch (err) {
    return false;
  }
}

function signToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: "24h" });
}

function verifyToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch (err) {
    return null;
  }
}

module.exports = {
  hashPassword,
  comparePassword,
  signToken,
  verifyToken
};
