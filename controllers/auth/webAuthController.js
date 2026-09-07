const admin = require("../../config/firebaseAdmin");
const User = require("../../models/userModel");
const Wallet = require("../../models/walletModel");
const CreatorApplication = require("../../models/creatorApplicationModel");
const AgencyMember = require("../../models/agencyMemberModel");
const Agency = require("../../models/agencyModel");
const Referral = require("../../models/referralModel");
const { aws, getNewUsername } = require("../../helpers/otherHelpers");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_String || "frenzone_fallback_secret");
};

/**
 * @desc Fetch current authenticated user session details
 * @route GET /auth/me
 * @access Private (Authenticated User)
 */
const getAuthMe = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const user = await User.findById(userId).select("-password").lean();
  if (!user) {
    return res.status(404).json({ success: false, error: "User account not found" });
  }

  // Resolve Profile Picture signed URL if present
  let profilePicUrl = "";
  if (user.profilePicture && typeof aws?.getLinkFromAWS === "function") {
    try {
      profilePicUrl = await aws.getLinkFromAWS(user.profilePicture);
    } catch {
      profilePicUrl = "";
    }
  }
  user.profilePictureUrl = profilePicUrl;

  // Check Creator Program application status
  const creatorApp = await CreatorApplication.findOne({ user_id: userId })
    .select("status createdAt")
    .sort({ createdAt: -1 })
    .lean();

  // Check Agency Membership
  const agencyMembership = await AgencyMember.findOne({ user_id: userId, status: "active" })
    .populate("agency_id", "agency_name status")
    .lean();

  return res.status(200).json({
    success: true,
    user: {
      ...user,
      creatorStatus: creatorApp ? creatorApp.status : "none",
      creatorApplicationId: creatorApp ? creatorApp._id : null,
      agencyMembership: agencyMembership || null,
      isCreator: creatorApp?.status === "approved" || Boolean(user.liveAccess && user.isVerified),
      isAgencyMember: Boolean(agencyMembership),
      role: agencyMembership ? `AGENCY_${agencyMembership.role?.toUpperCase()}` : (creatorApp?.status === "approved" ? "CREATOR" : "USER"),
    },
  });
});

/**
 * @desc Stateless logout acknowledgement for client session cleanup
 * @route POST /auth/logout
 * @access Public / Authenticated
 */
const logoutUser = (req, res) => {
  return res.status(200).json({
    success: true,
    message: "Logged out successfully",
  });
};

/**
 * @desc Direct web signup for Frenzone Creator/Agency web portal users.
 * Supports Firebase ID tokens and legacy registration.
 * @route POST /auth/web-signup
 * @access Public
 */
const webSignupUser = catchAsyncError(async (req, res) => {
  const {
    firstname,
    lastname,
    email: rawEmail,
    password,
    username: requestedUsername,
    referralCode,
    accountType,
    agencyName,
    country,
    idToken: bodyIdToken,
  } = req.body;

  let firebaseUid = null;
  let verifiedEmail = rawEmail ? String(rawEmail).trim().toLowerCase() : null;

  // Check if authorization header or body has Firebase ID token
  const authHeader = req.headers.authorization;
  const rawToken = bodyIdToken || (authHeader?.startsWith("Bearer ") ? authHeader.split(" ")[1] : null);

  if (rawToken && admin.apps?.length) {
    try {
      const decoded = await admin.auth().verifyIdToken(rawToken);
      if (decoded?.uid) {
        firebaseUid = decoded.uid;
        if (decoded.email) {
          verifiedEmail = String(decoded.email).trim().toLowerCase();
        }
      }
    } catch {
      // If token verification fails, allow fallback if email & password are provided
      if (!password && !rawEmail) {
        return res.status(401).json({
          success: false,
          error: "Invalid or expired Firebase authentication token.",
        });
      }
    }
  }

  if (!verifiedEmail || !firstname) {
    return res.status(400).json({
      success: false,
      error: "First name and email are required.",
    });
  }

  const normalizedEmail = verifiedEmail;
  let user = await User.findOne({
    $or: [
      ...(firebaseUid ? [{ firebaseUid }] : []),
      { email: normalizedEmail },
    ],
  });

  if (user) {
    // Link firebaseUid to existing user if not yet linked
    if (firebaseUid && !user.firebaseUid) {
      user.firebaseUid = firebaseUid;
      await user.save();
    }
    const token = rawToken || createToken(user._id);
    const userObject = user.toObject();
    delete userObject.password;
    return res.status(200).json({
      success: true,
      message: "Account synchronized successfully.",
      user: userObject,
      token,
    });
  }

  // Generate unique username
  let username = requestedUsername
    ? String(requestedUsername).trim().toLowerCase().replace(/[^a-z0-9_]/g, "")
    : "";
  if (!username) {
    username = await getNewUsername(`${firstname} ${lastname || ""}`);
  } else {
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      username = await getNewUsername(username);
    }
  }

  let hashedPassword = "";
  if (password) {
    const salt = await bcrypt.genSalt(10);
    hashedPassword = await bcrypt.hash(password, salt);
  }

  const tag = username.replace(/\s+/g, "");

  user = await User.create({
    ...(firebaseUid ? { firebaseUid } : {}),
    firstname: String(firstname).trim(),
    lastname: String(lastname || "").trim(),
    email: normalizedEmail,
    username,
    password: hashedPassword,
    tag,
    loginFrom: firebaseUid ? "Firebase" : "Web",
    app_user_id: username,
    onboarding: { active: true },
  });

  // Create associated wallet record
  const wallet = await Wallet.create({ userid: user._id });
  await User.findByIdAndUpdate(user._id, { walletid: wallet._id });

  // If registering as an Agency account, automatically create Agency & AgencyMember owner record
  let agency = null;
  if (accountType?.toLowerCase() === "agency" || agencyName) {
    const rawAgencyName = String(agencyName || `${firstname}'s Agency`).trim();
    const regNum = `FZ-AG-${Date.now().toString().slice(-6).toUpperCase()}`;

    agency = await Agency.create({
      agency_name: rawAgencyName,
      country: country ? String(country).trim() : "United States",
      business_address: "Frenzone Agency Network",
      registration_number: regNum,
      main_contact: {
        name: `${firstname} ${lastname || ""}`.trim() || username,
        email: normalizedEmail,
      },
      owner_user_id: user._id,
      status: "approved",
    });

    await AgencyMember.create({
      agency_id: agency._id,
      user_id: user._id,
      role: "owner",
      status: "active",
    });
  }

  // Link referral record if registered through a referral link
  if (referralCode && typeof referralCode === "string") {
    const trimmedCode = referralCode.trim();
    const referrer = await User.findOne({
      $or: [
        { referralCode: trimmedCode },
        { app_user_id: trimmedCode },
        { username: trimmedCode.toLowerCase() },
      ],
    }).select("_id");

    if (referrer && referrer._id.toString() !== user._id.toString()) {
      try {
        await Referral.create({
          referrer_id: referrer._id,
          referred_user_id: user._id,
          referral_code: trimmedCode,
          status: "registered",
        });
      } catch (err) {
        console.error("Failed to link referral during signup:", err.message);
      }
    }
  }

  const token = rawToken || createToken(user._id);
  const userObject = user.toObject();
  delete userObject.password;

  return res.status(201).json({
    success: true,
    message: "Account registered successfully.",
    user: userObject,
    token,
  });
});

module.exports = {
  getAuthMe,
  logoutUser,
  webSignupUser,
};
