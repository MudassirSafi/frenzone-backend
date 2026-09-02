const jwt = require("jsonwebtoken");
const Admin = require("../models/adminModel");

const rolePermissions = {
  super_admin: ["*"],
  administrator: ["dashboard.read", "users.read", "reports.read", "reports.manage", "live.read", "live.manage", "finance.read"],
  moderator: ["dashboard.read", "users.read", "reports.read", "reports.manage", "live.read", "live.manage"],
  support: ["dashboard.read", "users.read", "reports.read"],
  finance: ["dashboard.read", "finance.read"],
  content_manager: ["dashboard.read", "users.read", "reports.read", "live.read", "notifications.read", "notifications.send"],
};

const requireAdmin = async (req, res, next) => {
  const authorization = req.headers.authorization || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : "";
  if (!token) return res.status(401).json({ error: "Admin authorization token required" });

  try {
    const secret = process.env.ADMIN_JWT_SECRET || process.env.JWT_String;
    if (!secret) throw new Error("Admin JWT secret is not configured");
    const payload = jwt.verify(token, secret, { algorithms: ["HS256"] });
    if (payload.type !== "admin") throw new Error("Invalid admin token");

    const admin = await Admin.findById(payload.sub).select("-password").lean();
    if (!admin || admin.disabled) return res.status(401).json({ error: "Admin account is unavailable" });

    req.admin = {
      ...admin,
      role: admin.role || "administrator",
      permissions: admin.permissions?.length ? admin.permissions : (rolePermissions[admin.role] || rolePermissions.administrator),
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: "Invalid or expired admin token" });
  }
};

const requireAdminPermission = (permission) => (req, res, next) => {
  const permissions = req.admin?.permissions || [];
  if (!permissions.includes("*") && !permissions.includes(permission)) {
    return res.status(403).json({ error: "Admin permission denied" });
  }
  next();
};

module.exports = { requireAdmin, requireAdminPermission, rolePermissions };
