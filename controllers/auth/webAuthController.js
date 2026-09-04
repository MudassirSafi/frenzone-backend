const User = require("../../models/userModel");
const Wallet = require("../../models/walletModel");
const CreatorApplication = require("../../models/creatorApplicationModel");
const AgencyMember = require("../../models/agencyMemberModel");
const { aws, getNewUsername } = require("../../helpers/otherHelpers");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");

const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_String);
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
 * @desc Direct web signup for Frenzone Creator/Agency web portal users
 * @route POST /auth/web-signup
 * @access Public
 */
const webSignupUser = catchAsyncError(async (req, res) => {
  const { firstname, lastname, email, password, username: requestedUsername } = req.body;

  if (!email || !password || !firstname) {
    return res.status(400).json({
      success: false,
      error: "First name, email, and password are required.",
    });
  }

  const normalizedEmail = String(email).trim().toLowerCase();
  const existingUser = await User.findOne({ email: normalizedEmail });
  if (existingUser) {
    return res.status(400).json({
      success: false,
      error: "An account with this email address already exists.",
    });
  }

  // Generate unique username
  let username = requestedUsername ? String(requestedUsername).trim().toLowerCase().replace(/[^a-z0-9_]/g, "") : "";
  if (!username) {
    username = await getNewUsername(`${firstname} ${lastname || ""}`);
  } else {
    const existingUsername = await User.findOne({ username });
    if (existingUsername) {
      username = await getNewUsername(username);
    }
  }

  const salt = await bcrypt.genSalt(10);
  const hashedPassword = await bcrypt.hash(password, salt);
  const tag = username.replace(/\s+/g, "");

  const user = await User.create({
    firstname: String(firstname).trim(),
    lastname: String(lastname || "").trim(),
    email: normalizedEmail,
    username,
    password: hashedPassword,
    tag,
    loginFrom: "Web",
    app_user_id: username,
    onboarding: { active: true },
  });

  // Create associated wallet record
  const wallet = await Wallet.create({ userid: user._id });
  await User.findByIdAndUpdate(user._id, { walletid: wallet._id });

  const token = createToken(user._id);
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
