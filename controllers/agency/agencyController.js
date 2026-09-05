const Agency = require("../../models/agencyModel");
const AgencyMember = require("../../models/agencyMemberModel");
const CreatorAgencyRelationship = require("../../models/creatorAgencyRelationshipModel");
const User = require("../../models/userModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");

/**
 * @desc Submit a new Agency Application
 * @route POST /agency/apply
 * @access Private (Authenticated User)
 */
const applyAgency = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const {
    agency_name,
    country,
    business_address,
    registration_number,
    tax_id,
    website,
    main_contact,
  } = req.body;

  if (
    !agency_name ||
    !country ||
    !business_address ||
    !registration_number ||
    !main_contact?.name ||
    !main_contact?.email
  ) {
    return res.status(400).json({
      success: false,
      error: "Please complete all required agency business details and contact information.",
    });
  }

  // Check unique registration number
  const existingReg = await Agency.findOne({
    registration_number: String(registration_number).trim(),
  });
  if (existingReg) {
    return res.status(400).json({
      success: false,
      error: "An Agency with this Business Registration Number is already registered.",
    });
  }

  // Create Agency
  const agency = await Agency.create({
    agency_name: String(agency_name).trim(),
    country: String(country).trim(),
    business_address: String(business_address).trim(),
    registration_number: String(registration_number).trim(),
    tax_id: String(tax_id || "").trim(),
    website: String(website || "").trim(),
    main_contact: {
      name: String(main_contact.name).trim(),
      email: String(main_contact.email).trim().toLowerCase(),
      phone: String(main_contact.phone || "").trim(),
    },
    owner_user_id: userId,
    status: "pending",
  });

  // Create Owner AgencyMember record
  await AgencyMember.create({
    agency_id: agency._id,
    user_id: userId,
    role: "owner",
    status: "active",
  });

  return res.status(201).json({
    success: true,
    message: "Agency Application submitted successfully. Pending admin review.",
    agency,
  });
});

/**
 * @desc Get current user's Agency Profile details
 * @route GET /agency/profile
 * @access Private (Agency Member)
 */
const getAgencyProfile = catchAsyncError(async (req, res) => {
  return res.status(200).json({
    success: true,
    agency: req.agency,
    memberRole: req.agencyMember.role,
  });
});

/**
 * @desc Agency invites a Creator by username to join roster
 * @route POST /agency/invite-creator
 * @access Private (Agency Owner / Manager)
 */
const inviteCreator = catchAsyncError(async (req, res) => {
  const { username } = req.body;
  if (!username) {
    return res.status(400).json({ success: false, error: "Creator username is required" });
  }

  const targetUser = await User.findOne({
    username: String(username).trim().toLowerCase(),
  }).select("_id username firstname lastname profilePicture identifyApprovalStatus");

  if (!targetUser) {
    return res.status(404).json({ success: false, error: "Frenzone User account not found" });
  }

  // Check if target creator is already linked or invited
  const existingRel = await CreatorAgencyRelationship.findOne({
    creator_id: targetUser._id,
    status: { $in: ["pending_creator_consent", "pending_admin_approval", "active"] },
  });

  if (existingRel) {
    return res.status(400).json({
      success: false,
      error: "This Creator already has an active or pending Agency affiliation.",
    });
  }

  // Create relationship in pending_creator_consent state
  const relationship = await CreatorAgencyRelationship.create({
    creator_id: targetUser._id,
    agency_id: req.agency._id,
    invited_by: req.userId,
    status: "pending_creator_consent",
  });

  return res.status(201).json({
    success: true,
    message: `Invitation sent to ${targetUser.username}. Awaiting creator consent.`,
    relationship,
    creator: targetUser,
  });
});

/**
 * @desc Fetch Agency Roster Creators (Strictly scoped to authenticated Agency)
 * @route GET /agency/roster
 * @access Private (Agency Member)
 */
const getAgencyRoster = catchAsyncError(async (req, res) => {
  const roster = await CreatorAgencyRelationship.find({
    agency_id: req.agency._id,
    status: { $in: ["active", "pending_creator_consent", "pending_admin_approval"] },
  })
    .populate("creator_id", "username firstname lastname email profilePicture creatorScore isVerified")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    roster,
    count: roster.length,
  });
});

/**
 * @desc Creator responds to pending Agency invite (Accept / Reject)
 * @route POST /creator/agency-invite/respond
 * @access Private (Authenticated Creator User)
 */
const respondAgencyInvite = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const { relationship_id, action } = req.body;

  if (!["accept", "reject"].includes(action)) {
    return res.status(400).json({ success: false, error: "Action must be 'accept' or 'reject'" });
  }

  const relationship = await CreatorAgencyRelationship.findOne({
    _id: relationship_id,
    creator_id: userId,
    status: "pending_creator_consent",
  });

  if (!relationship) {
    return res.status(404).json({
      success: false,
      error: "Pending Agency invitation not found for your account.",
    });
  }

  if (action === "accept") {
    relationship.status = "pending_admin_approval";
    await relationship.save();
    return res.status(200).json({
      success: true,
      message: "Agency invitation accepted. Submitted for final Admin approval.",
      relationship,
    });
  } else {
    relationship.status = "rejected";
    relationship.terminated_at = new Date();
    await relationship.save();
    return res.status(200).json({
      success: true,
      message: "Agency invitation declined.",
      relationship,
    });
  }
});

/**
 * @desc Get all Agency Applications (Admin Panel)
 * @route GET /admin-api/creator-agency/agencies
 * @access Private (Admin Only)
 */
const getAdminAgencies = catchAsyncError(async (req, res) => {
  const agencies = await Agency.find({})
    .populate("owner_user_id", "username firstname lastname email")
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({ success: true, agencies });
});

/**
 * @desc Admin reviews Agency Application or Creator Link
 * @route POST /admin-api/creator-agency/agencies/:id/review
 * @access Private (Admin Only)
 */
const reviewAgency = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const { status, review_notes } = req.body;

  const agency = await Agency.findById(id);
  if (!agency) {
    return res.status(404).json({ success: false, error: "Agency not found" });
  }

  agency.status = status;
  agency.admin_review = {
    reviewed_by: req.admin?._id || null,
    reviewed_at: new Date(),
    review_notes: String(review_notes || "").trim(),
  };

  await agency.save();

  return res.status(200).json({
    success: true,
    message: `Agency status updated to ${status}.`,
    agency,
  });
});

module.exports = {
  applyAgency,
  getAgencyProfile,
  inviteCreator,
  getAgencyRoster,
  respondAgencyInvite,
  getAdminAgencies,
  reviewAgency,
};
