const CreatorApplication = require("../../models/creatorApplicationModel");
const User = require("../../models/userModel");
const Referral = require("../../models/referralModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");

/**
 * @desc Submit a new Creator Program Application for the authenticated user
 * @route POST /creator/application
 * @access Private (Authenticated User)
 */
const submitApplication = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const {
    legal_name,
    contact_info,
    demographics,
    content_profile,
    legal_agreements,
  } = req.body;

  // Form Validation
  if (
    !legal_name?.firstname ||
    !legal_name?.lastname ||
    !contact_info?.email ||
    !demographics?.country ||
    !demographics?.language ||
    !demographics?.dob ||
    !content_profile?.category ||
    !legal_agreements?.terms_accepted ||
    !legal_agreements?.privacy_accepted
  ) {
    return res.status(400).json({
      success: false,
      error: "Please complete all required fields and accept the Terms and Privacy Policy.",
    });
  }

  // Prevent duplicate active or pending applications for the same user
  const existingApp = await CreatorApplication.findOne({
    user_id: userId,
    status: { $in: ["pending", "more_info_required", "approved"] },
  });

  if (existingApp) {
    return res.status(400).json({
      success: false,
      error: "An active or pending Creator Application already exists for this account.",
      application: existingApp,
    });
  }

  // Parse DOB safely
  const parsedDob = new Date(demographics.dob);
  if (isNaN(parsedDob.getTime())) {
    return res.status(400).json({ success: false, error: "Invalid date of birth format" });
  }

  // Verify applicant age (18+)
  const ageDiffMs = Date.now() - parsedDob.getTime();
  const ageDate = new Date(ageDiffMs);
  const age = Math.abs(ageDate.getUTCFullYear() - 1970);
  if (age < 18) {
    return res.status(400).json({
      success: false,
      error: "You must be at least 18 years old to apply to the Creator Program.",
    });
  }

  // Create Application
  const application = await CreatorApplication.create({
    user_id: userId,
    legal_name: {
      firstname: String(legal_name.firstname).trim(),
      lastname: String(legal_name.lastname).trim(),
    },
    contact_info: {
      email: String(contact_info.email).trim().toLowerCase(),
      phone: String(contact_info.phone || req.user?.phone || "").trim(),
    },
    demographics: {
      country: String(demographics.country).trim(),
      language: String(demographics.language).trim(),
      dob: parsedDob,
    },
    content_profile: {
      category: content_profile.category,
      primary_platform: String(content_profile.primary_platform || "").trim(),
      social_links: {
        instagram: String(content_profile.social_links?.instagram || req.user?.instagramUrl || "").trim(),
        tiktok: String(content_profile.social_links?.tiktok || "").trim(),
        youtube: String(content_profile.social_links?.youtube || "").trim(),
        twitter: String(content_profile.social_links?.twitter || req.user?.twitterUrl || "").trim(),
      },
      estimated_audience_size: Number(content_profile.estimated_audience_size || 0),
    },
    legal_agreements: {
      terms_accepted: Boolean(legal_agreements.terms_accepted),
      privacy_accepted: Boolean(legal_agreements.privacy_accepted),
      accepted_at: new Date(),
    },
    status: "pending",
  });

  // Sync user verification approval status in User model
  await User.findByIdAndUpdate(userId, {
    identifyApprovalStatus: "pending",
  });

  return res.status(201).json({
    success: true,
    message: "Creator Program Application submitted successfully.",
    application,
  });
});

/**
 * @desc Fetch current Creator Application status for authenticated user
 * @route GET /creator/application/status
 * @access Private (Authenticated User)
 */
const getApplicationStatus = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const application = await CreatorApplication.findOne({ user_id: userId })
    .sort({ createdAt: -1 })
    .lean();

  return res.status(200).json({
    success: true,
    hasApplied: Boolean(application),
    status: application ? application.status : "none",
    application: application || null,
  });
});

/**
 * @desc Get all Creator Applications (Admin Panel)
 * @route GET /admin-api/creator-agency/applications
 * @access Private (Admin Only)
 */
const getAdminApplications = catchAsyncError(async (req, res) => {
  const page = Math.max(Number.parseInt(req.query.page || "1", 10), 1);
  const perPage = Math.min(Math.max(Number.parseInt(req.query.perPage || "20", 10), 1), 100);
  const status = String(req.query.status || "").trim();

  const filter = {};
  if (status) {
    filter.status = status;
  }

  const [applications, total] = await Promise.all([
    CreatorApplication.find(filter)
      .populate("user_id", "username firstname lastname email profilePicture creatorScore isVerified")
      .populate("admin_review.reviewed_by", "firstname lastname email")
      .sort({ createdAt: -1 })
      .skip((page - 1) * perPage)
      .limit(perPage)
      .lean(),
    CreatorApplication.countDocuments(filter),
  ]);

  return res.status(200).json({
    success: true,
    applications,
    pagination: {
      page,
      perPage,
      total,
      pages: Math.ceil(total / perPage),
    },
  });
});

/**
 * @desc Review a Creator Application (Approve / Reject / Request More Info)
 * @route POST /admin-api/creator-agency/applications/:id/review
 * @access Private (Admin Only)
 */
const reviewApplication = catchAsyncError(async (req, res) => {
  const { id } = req.params;
  const { status, review_notes, more_info_requested_message } = req.body;

  const validStatuses = ["approved", "rejected", "more_info_required", "suspended"];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({
      success: false,
      error: `Invalid status. Allowed values: ${validStatuses.join(", ")}`,
    });
  }

  const application = await CreatorApplication.findById(id);
  if (!application) {
    return res.status(404).json({ success: false, error: "Creator Application not found" });
  }

  application.status = status;
  application.admin_review = {
    reviewed_by: req.admin?._id || req.admin?.id || null,
    reviewed_at: new Date(),
    review_notes: String(review_notes || "").trim(),
    more_info_requested_message: String(more_info_requested_message || "").trim(),
  };

  await application.save();

  // Map application status to User model fields
  const userUpdate = {};
  if (status === "approved") {
    userUpdate.identifyApprovalStatus = "approved";
    userUpdate.identityVerified = true;
    userUpdate.liveAccess = true;

    // Transition referral record from registered to qualified upon creator approval
    try {
      await Referral.updateOne(
        { referred_user_id: application.user_id, status: { $ne: "qualified" } },
        { status: "qualified", qualification_timestamp: new Date() }
      );
    } catch (refErr) {
      console.warn("Referral qualification lifecycle update warning:", refErr.message);
    }
  } else if (status === "rejected") {
    userUpdate.identifyApprovalStatus = "permanent_rejected";
  } else if (status === "more_info_required") {
    userUpdate.identifyApprovalStatus = "temporary_rejected";
    userUpdate.identifyApprovalMessage = more_info_requested_message || "More information required";
  } else if (status === "suspended") {
    userUpdate.identifyApprovalStatus = "permanent_rejected";
    userUpdate.liveAccess = false;
  }

  if (Object.keys(userUpdate).length > 0) {
    await User.findByIdAndUpdate(application.user_id, userUpdate);
  }

  return res.status(200).json({
    success: true,
    message: `Application ${status} successfully.`,
    application,
  });
});

module.exports = {
  submitApplication,
  getApplicationStatus,
  getAdminApplications,
  reviewApplication,
};
