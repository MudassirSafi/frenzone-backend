const admin = require("../config/firebaseAdmin");
const jwt = require("jsonwebtoken");
const User = require("../models/userModel.js");
const Admin = require("../models/adminModel.js");

/**
 * Authentication Middleware:
 * Verifies Firebase RS256 ID Token with fallback support for legacy JWT.
 * Ensures req.userId always exposes the MongoDB ObjectId.
 */
const requireAuth = async (req, res, next) => {
  const { authorization } = req.headers;
  if (!authorization || !authorization.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Authorization Token Required" });
  }

  const token = authorization.split(" ")[1];

  try {
    let decodedToken = null;

    // 1. Attempt verification as Firebase ID Token
    try {
      if (admin.apps?.length) {
        decodedToken = await admin.auth().verifyIdToken(token);
      }
    } catch (fbError) {
      // 2. Dual-mode fallback: check legacy JWT (e.g. for existing mobile/scripts)
      if (process.env.JWT_String) {
        try {
          const legacy = jwt.verify(token, process.env.JWT_String);
          if (legacy?.id) {
            let legacyUser = await User.findById(legacy.id);
            if (!legacyUser) {
              legacyUser = await Admin.findById(legacy.id);
            }
            if (legacyUser) {
              if (legacyUser.banned) {
                return res.status(403).json({ error: "User Token Has Been Banned" });
              }
              req.userId = legacyUser._id;
              req.authUserId = legacyUser._id;
              req.user = legacyUser;
              req.authUser = legacyUser;
              return next();
            }
          }
        } catch {
          // Token is neither valid Firebase nor valid legacy JWT
        }
      }

      if (fbError.code === "auth/id-token-expired") {
        return res.status(401).json({ error: "Authentication token has expired. Please refresh session." });
      }
      return res.status(401).json({ error: "Invalid Authorization Token" });
    }

    if (!decodedToken) {
      return res.status(401).json({ error: "Invalid Authorization Token" });
    }

    const { uid, email } = decodedToken;

    // 3. Find MongoDB User by Firebase UID
    let user = await User.findOne({ firebaseUid: uid });

    // 4. Seamless Migration: Link existing account by matching email
    if (!user && email) {
      user = await User.findOne({
        email: { $regex: new RegExp(`^${email.trim()}$`, "i") },
      });
      if (user) {
        user.firebaseUid = uid;
        await user.save();
      }
    }

    // 5. Check Admin collection if not in User
    if (!user) {
      user = await Admin.findOne({ _id: uid });
    }

    if (!user) {
      return res.status(401).json({
        error: "User profile not found. Please complete profile registration.",
      });
    }

    if (user.banned) {
      return res.status(403).json({ error: "User Token Has Been Banned" });
    }

    // 6. Set standard Express auth context
    req.userId = user._id;
    req.authUserId = user._id;
    req.user = user;
    req.authUser = user;
    req.firebaseUser = decodedToken;

    return next();
  } catch (error) {
    console.error("requireAuth Error:", error);
    return res.status(400).json({ error: error.message || "Authentication error" });
  }
};

module.exports = requireAuth;
