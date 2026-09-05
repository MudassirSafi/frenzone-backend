const User = require("../../models/userModel");
const CreatorApplication = require("../../models/creatorApplicationModel");
const AgencyMember = require("../../models/agencyMemberModel");

/**
 * Middleware ensuring authenticated user has valid Creator access.
 * Strictly blocks pure Agency accounts from accessing Creator portal endpoints.
 */
const requireCreatorAuth = async (req, res, next) => {
  try {
    const userId = req.userId || req.user?._id;
    if (!userId) {
      return res.status(401).json({ success: false, error: "Authentication required" });
    }

    const [user, creatorApp, agencyMembership] = await Promise.all([
      User.findById(userId).select("liveAccess isVerified identifyApprovalStatus").lean(),
      CreatorApplication.findOne({ user_id: userId })
        .select("status")
        .sort({ createdAt: -1 })
        .lean(),
      AgencyMember.findOne({ user_id: userId, status: "active" }).select("_id").lean(),
    ]);

    if (!user) {
      return res.status(404).json({ success: false, error: "User account not found" });
    }

    const isApprovedCreator =
      creatorApp?.status === "approved" ||
      creatorApp?.status === "pending" ||
      Boolean(user.liveAccess && user.isVerified);

    // If strictly an Agency account with no Creator access
    if (agencyMembership && !isApprovedCreator) {
      return res.status(403).json({
        success: false,
        error: "Access denied. Your account is registered as an Agency. Agency accounts cannot access Creator portal resources.",
        accountRole: "AGENCY",
      });
    }

    req.creatorStatus = creatorApp ? creatorApp.status : "none";
    return next();
  } catch (err) {
    console.error("Error in requireCreatorAuth:", err);
    return res.status(500).json({ success: false, error: "Authorization verification error" });
  }
};

module.exports = { requireCreatorAuth };
