const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Admin = require("../models/adminModel");
const { rolePermissions } = require("../middleware/requireAdmin");

const publicAdmin = (admin) => ({
  id: admin._id,
  email: admin.email,
  role: admin.role || "administrator",
  permissions: admin.permissions?.length ? admin.permissions : (rolePermissions[admin.role] || rolePermissions.administrator),
});

const signAdminToken = (admin) => {
  const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_String;
  if (!secret) throw new Error("Admin JWT secret is not configured");
  return jwt.sign({ sub: admin._id.toString(), type: "admin", role: admin.role || "administrator" }, secret, {
    algorithm: "HS256",
    expiresIn: "8h",
  });
};

const login = async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "");
    if (!email || !password) return res.status(400).json({ error: "Email and password are required" });

    const admin = await Admin.findOne({ email });
    if (!admin || admin.disabled || !(await bcrypt.compare(password, admin.password))) {
      return res.status(401).json({ error: "Invalid admin credentials" });
    }

    admin.lastLoginAt = new Date();
    await admin.save();
    return res.json({ success: true, token: signAdminToken(admin), admin: publicAdmin(admin) });
  } catch (error) {
    return res.status(500).json({ error: error.message });
  }
};

const me = (req, res) => res.json({ success: true, admin: publicAdmin(req.admin) });

module.exports = { login, me };
