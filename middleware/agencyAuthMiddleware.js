const AgencyMember = require("../models/agencyMemberModel");
const Agency = require("../models/agencyModel");

/**
 * Middleware verifying authenticated user belongs to an active, approved Agency
 */
const requireAgencyAuth = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const member = await AgencyMember.findOne({
      user_id: userId,
      status: "active",
    }).populate("agency_id");

    if (!member || !member.agency_id) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Active Agency membership required.",
      });
    }

    const agency = member.agency_id;
    if (agency.status !== "approved") {
      return res.status(403).json({
        success: false,
        error: `Agency access restricted. Organization status is currently '${agency.status}'.`,
        agencyStatus: agency.status,
      });
    }

    req.agency = agency;
    req.agencyMember = member;
    return next();
  } catch (error) {
    console.error("Error in requireAgencyAuth middleware:", error);
    return res.status(500).json({ success: false, error: "Authorization error" });
  }
};

/**
 * Middleware factory restricting endpoint to specific Agency RBAC roles (e.g. owner, manager, finance)
 */
const requireAgencyRole = (allowedRoles = []) => {
  return (req, res, next) => {
    if (!req.agencyMember) {
      return res.status(403).json({ success: false, error: "Agency authorization required" });
    }

    if (allowedRoles.length > 0 && !allowedRoles.includes(req.agencyMember.role)) {
      return res.status(403).json({
        success: false,
        error: `Insufficient agency permissions. Required role: ${allowedRoles.join(" or ")}`,
      });
    }

    return next();
  };
};

module.exports = {
  requireAgencyAuth,
  requireAgencyRole,
};
