const mongoose = require("mongoose");
const Agency = require("../../models/agencyModel");
const AgencyMember = require("../../models/agencyMemberModel");
const CreatorAgencyRelationship = require("../../models/creatorAgencyRelationshipModel");
const User = require("../../models/userModel");
const StreamAnalysis = require("../../models/streamAnalysisModel");
const Payout = require("../../models/payoutModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const { aws } = require("../../helpers/otherHelpers");

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
 * @desc Fetch authoritative Agency Dashboard overview metrics
 * @route GET /agency/dashboard
 * @access Private (Agency Member)
 */
const getAgencyDashboard = catchAsyncError(async (req, res) => {
  const agencyId = req.agency._id;
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

  // Query relationships
  const relationships = await CreatorAgencyRelationship.find({ agency_id: agencyId })
    .populate("creator_id", "username firstname lastname profilePicture")
    .lean();

  const totalCreators = relationships.length;
  const activeRelationships = relationships.filter((r) => r.status === "active");
  const activeCreators = activeRelationships.length;
  const activeCreatorIds = activeRelationships.map((r) => r.creator_id?._id).filter(Boolean);

  let liveHours = 0;
  let grossRevenue = 0;

  if (activeCreatorIds.length > 0) {
    const streamAgg = await StreamAnalysis.aggregate([
      {
        $match: {
          userid: { $in: activeCreatorIds },
          endedAt: { $gte: startOfMonth, $lte: endOfMonth },
        },
      },
      {
        $group: {
          _id: null,
          totalUsd: { $sum: "$usdEarned" },
          totalDiamonds: { $sum: "$diamondsEarned" },
          streamCount: { $sum: 1 },
        },
      },
    ]);

    const monthStreams = await StreamAnalysis.find({
      userid: { $in: activeCreatorIds },
      endedAt: { $gte: startOfMonth, $lte: endOfMonth },
    }).select("endedAt createdAt").lean();

    for (const s of monthStreams) {
      let durationHours = 0.5;
      if (s.endedAt && s.createdAt) {
        const diffMs = new Date(s.endedAt).getTime() - new Date(s.createdAt).getTime();
        durationHours = Math.max(0.1, diffMs / (1000 * 60 * 60));
      }
      liveHours += durationHours;
    }

    grossRevenue = streamAgg[0]?.totalUsd || (streamAgg[0]?.totalDiamonds ? streamAgg[0].totalDiamonds / 100 : 0);
  }

  liveHours = Number(liveHours.toFixed(1));
  const liveHoursTarget = Math.max(40, activeCreators * 40.0);
  const estimatedCommission = grossRevenue * 0.20;
  const contentCompletion = Math.min(100, Math.round((liveHours / Math.max(1, liveHoursTarget)) * 100));

  // Pending Payout for Agency
  const pendingPayoutAgg = await Payout.aggregate([
    { $match: { userId: req.agency.owner_user_id, status: { $in: ["pending", "processing"] } } },
    { $group: { _id: null, total: { $sum: "$amount" } } },
  ]);
  const pendingPayoutAmount = pendingPayoutAgg[0]?.total || estimatedCommission;

  // Alerts
  const recentAlerts = [];
  const pendingInvites = relationships.filter((r) => r.status === "pending_creator_consent");
  if (pendingInvites.length > 0) {
    recentAlerts.push({
      id: `alert-inv-${pendingInvites.length}`,
      title: "Pending Invitations",
      message: `${pendingInvites.length} creator invitation(s) awaiting creator consent.`,
      timestamp: "Today",
      type: "info",
    });
  }
  if (activeCreators > 0) {
    recentAlerts.push({
      id: `alert-roster-${activeCreators}`,
      title: "Roster Active",
      message: `${activeCreators} verified creator(s) currently streaming in your agency network.`,
      timestamp: "Recent",
      type: "success",
    });
  } else {
    recentAlerts.push({
      id: "alert-welcome",
      title: "Agency Workspace Ready",
      message: "Invite creators to your roster to start earning 20% agency stream commissions.",
      timestamp: "Just now",
      type: "info",
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      activeCreators,
      totalCreators,
      liveHours,
      liveHoursTarget,
      estimatedCommissionMonth: {
        amount: estimatedCommission.toFixed(2),
        currency: "USD",
      },
      pendingPayout: {
        amount: pendingPayoutAmount.toFixed(2),
        currency: "USD",
      },
      contentCompletion,
      recentAlerts,
    },
  });
});

/**
 * @desc Agency invites a Creator by username or email to join roster
 * @route POST /agency/invite-creator
 * @access Private (Agency Owner / Manager)
 */
const inviteCreator = catchAsyncError(async (req, res) => {
  const { username, email } = req.body;
  if (!username && !email) {
    return res.status(400).json({ success: false, error: "Creator username or email is required" });
  }

  const cleanUsername = username ? String(username).trim().toLowerCase() : "";
  const cleanEmail = email ? String(email).trim().toLowerCase() : "";

  const targetUser = await User.findOne({
    $or: [
      ...(cleanUsername ? [{ username: cleanUsername }] : []),
      ...(cleanEmail ? [{ email: cleanEmail }] : []),
    ],
  }).select("_id username email firstname lastname profilePicture identifyApprovalStatus");

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
 * @desc Fetch Agency Roster Creators with live broadcast hours and revenue metrics
 * @route GET /agency/roster
 * @access Private (Agency Member)
 */
const getAgencyRoster = catchAsyncError(async (req, res) => {
  const agencyId = req.agency._id;
  const now = new Date();
  const startOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth(), 1, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999));

  const relationships = await CreatorAgencyRelationship.find({
    agency_id: agencyId,
    status: { $in: ["active", "pending_creator_consent", "pending_admin_approval"] },
  })
    .populate("creator_id", "username firstname lastname email profilePicture creatorScore isVerified category")
    .sort({ createdAt: -1 })
    .lean();

  const roster = await Promise.all(
    relationships.map(async (rel) => {
      const creator = rel.creator_id;
      if (!creator) return null;

      let avatarUrl = "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&w=120&h=120&q=80";
      if (creator.profilePicture && typeof aws?.getLinkFromAWS === "function") {
        try {
          avatarUrl = await aws.getLinkFromAWS(creator.profilePicture);
        } catch {
          // fallback
        }
      }

      // Aggregate stream hours & earnings for this creator in current month
      const [streams, streamEarningsAgg] = await Promise.all([
        StreamAnalysis.find({
          userid: creator._id,
          endedAt: { $gte: startOfMonth, $lte: endOfMonth },
        }).select("endedAt createdAt").lean(),
        StreamAnalysis.aggregate([
          {
            $match: {
              userid: creator._id,
              endedAt: { $gte: startOfMonth, $lte: endOfMonth },
            },
          },
          {
            $group: {
              _id: null,
              totalUsd: { $sum: "$usdEarned" },
              totalDiamonds: { $sum: "$diamondsEarned" },
            },
          },
        ]),
      ]);

      let monthlyLiveHours = 0;
      for (const s of streams) {
        let duration = 0.5;
        if (s.endedAt && s.createdAt) {
          const diffMs = new Date(s.endedAt).getTime() - new Date(s.createdAt).getTime();
          duration = Math.max(0.1, diffMs / (1000 * 60 * 60));
        }
        monthlyLiveHours += duration;
      }
      monthlyLiveHours = Number(monthlyLiveHours.toFixed(1));

      const complianceRate = Math.min(100, Math.round((monthlyLiveHours / 40.0) * 100));
      const monthlyGross = streamEarningsAgg[0]?.totalUsd || (streamEarningsAgg[0]?.totalDiamonds ? streamEarningsAgg[0].totalDiamonds / 100 : 0);
      const agencyCommission = monthlyGross * 0.20;

      let status = "INACTIVE";
      if (rel.status === "active") status = "ACTIVE";
      else if (rel.status === "pending_creator_consent" || rel.status === "pending_admin_approval") status = "PENDING_ONBOARDING";

      return {
        id: rel._id.toString(),
        creatorId: creator._id.toString(),
        name: `${creator.firstname || ""} ${creator.lastname || ""}`.trim() || creator.username,
        username: creator.username,
        avatarUrl,
        category: creator.category || "General",
        monthlyLiveHours,
        complianceRate,
        monthlyRevenue: {
          amount: monthlyGross.toFixed(2),
          currency: "USD",
        },
        agencyCommission: {
          amount: agencyCommission.toFixed(2),
          currency: "USD",
        },
        status,
        joinedDate: rel.createdAt ? new Date(rel.createdAt).toISOString().split("T")[0] : "Recently",
      };
    })
  );

  const cleanRoster = roster.filter(Boolean);

  return res.status(200).json({
    success: true,
    roster: cleanRoster,
    count: cleanRoster.length,
  });
});

/**
 * @desc Fetch all invitations sent by this Agency
 * @route GET /agency/invitations
 * @access Private (Agency Member)
 */
const getAgencyInvitations = catchAsyncError(async (req, res) => {
  const agencyId = req.agency._id;

  const invitations = await CreatorAgencyRelationship.find({
    agency_id: agencyId,
    status: { $in: ["pending_creator_consent", "rejected", "pending_admin_approval"] },
  })
    .populate("creator_id", "username email profilePicture")
    .sort({ createdAt: -1 })
    .lean();

  const now = Date.now();
  const data = invitations.map((inv) => {
    const creator = inv.creator_id || {};
    const sentDateObj = inv.createdAt ? new Date(inv.createdAt) : new Date();
    const expiresDateObj = new Date(sentDateObj.getTime() + 7 * 86400000);

    let status = "PENDING_CONSENT";
    if (inv.status === "rejected") {
      status = "REJECTED";
    } else if (inv.status === "pending_admin_approval") {
      status = "ACCEPTED";
    } else if (now > expiresDateObj.getTime()) {
      status = "EXPIRED";
    }

    return {
      id: inv._id.toString(),
      creatorUsername: creator.username || "unknown",
      creatorEmail: creator.email || `${creator.username || "creator"}@frenzone.live`,
      sentDate: sentDateObj.toISOString().split("T")[0],
      expiresDate: expiresDateObj.toISOString().split("T")[0],
      status,
    };
  });

  return res.status(200).json({
    success: true,
    data,
    count: data.length,
  });
});

/**
 * @desc Cancel or revoke a pending Creator invitation
 * @route DELETE /agency/invitations/:id
 * @access Private (Agency Owner / Manager)
 */
const cancelAgencyInvitation = catchAsyncError(async (req, res) => {
  const agencyId = req.agency._id;
  const inviteId = req.params.id;

  const relationship = await CreatorAgencyRelationship.findOne({
    _id: inviteId,
    agency_id: agencyId,
    status: "pending_creator_consent",
  });

  if (!relationship) {
    return res.status(404).json({
      success: false,
      error: "Pending invitation not found or already processed.",
    });
  }

  await CreatorAgencyRelationship.findByIdAndDelete(relationship._id);

  return res.status(200).json({
    success: true,
    message: "Invitation cancelled successfully.",
  });
});

/**
 * @desc Fetch Agency aggregate performance analytics, 5-month trends, and category breakdown
 * @route GET /agency/performance
 * @access Private (Agency Member)
 */
const getAgencyPerformance = catchAsyncError(async (req, res) => {
  const agencyId = req.agency._id;

  // Find all active creators in this agency
  const activeRelationships = await CreatorAgencyRelationship.find({
    agency_id: agencyId,
    status: "active",
  })
    .populate("creator_id", "username category")
    .lean();

  const totalCreatorCount = activeRelationships.length;
  const activeCreatorIds = activeRelationships.map((r) => r.creator_id?._id).filter(Boolean);

  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();

  // 5-Month Monthly Trends
  const monthlyTrends = [];
  let totalLiveHoursAggregate = 0;
  let grossCreatorRevenue = 0;

  for (let i = 4; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const startOfM = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 0, 0, 0));
    const endOfM = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999));
    const monthLabel = monthNames[d.getMonth()];

    let mGross = 0;
    let mHours = 0;
    let activeCreatorsInMonth = 0;

    if (activeCreatorIds.length > 0) {
      const [agg, streams] = await Promise.all([
        StreamAnalysis.aggregate([
          {
            $match: {
              userid: { $in: activeCreatorIds },
              endedAt: { $gte: startOfM, $lte: endOfM },
            },
          },
          {
            $group: {
              _id: null,
              totalUsd: { $sum: "$usdEarned" },
              totalDiamonds: { $sum: "$diamondsEarned" },
              activeUsers: { $addToSet: "$userid" },
            },
          },
        ]),
        StreamAnalysis.find({
          userid: { $in: activeCreatorIds },
          endedAt: { $gte: startOfM, $lte: endOfM },
        }).select("endedAt createdAt").lean(),
      ]);

      mGross = agg[0]?.totalUsd || (agg[0]?.totalDiamonds ? agg[0].totalDiamonds / 100 : 0);
      activeCreatorsInMonth = agg[0]?.activeUsers?.length || 0;

      for (const s of streams) {
        let duration = 0.5;
        if (s.endedAt && s.createdAt) {
          const diffMs = new Date(s.endedAt).getTime() - new Date(s.createdAt).getTime();
          duration = Math.max(0.1, diffMs / (1000 * 60 * 60));
        }
        mHours += duration;
      }
    }

    totalLiveHoursAggregate += mHours;
    grossCreatorRevenue += mGross;

    monthlyTrends.push({
      month: monthLabel,
      liveHours: Number(mHours.toFixed(1)),
      grossRevenue: Math.round(mGross),
      commission: Math.round(mGross * 0.20),
    });
  }

  totalLiveHoursAggregate = Number(totalLiveHoursAggregate.toFixed(1));
  const avgHoursPerCreator = totalCreatorCount > 0 ? Number((totalLiveHoursAggregate / totalCreatorCount).toFixed(1)) : 0;
  const netAgencyCommission = grossCreatorRevenue * 0.20;

  // Category Breakdown
  const categoryMap = {};
  for (const rel of activeRelationships) {
    const cat = rel.creator_id?.category || "General";
    if (!categoryMap[cat]) {
      categoryMap[cat] = { category: cat, creatorsCount: 0, hoursStreamed: 0, revenue: 0 };
    }
    categoryMap[cat].creatorsCount += 1;
  }

  // If active creators exist, compute category hours
  if (activeCreatorIds.length > 0) {
    for (const rel of activeRelationships) {
      const cId = rel.creator_id?._id;
      const cat = rel.creator_id?.category || "General";
      const cStreams = await StreamAnalysis.find({ userid: cId }).select("endedAt createdAt usdEarned diamondsEarned").lean();
      for (const cs of cStreams) {
        let duration = 0.5;
        if (cs.endedAt && cs.createdAt) {
          const diffMs = new Date(cs.endedAt).getTime() - new Date(cs.createdAt).getTime();
          duration = Math.max(0.1, diffMs / (1000 * 60 * 60));
        }
        categoryMap[cat].hoursStreamed += duration;
        categoryMap[cat].revenue += (cs.usdEarned || (cs.diamondsEarned ? cs.diamondsEarned / 100 : 0));
      }
    }
  }

  const categoryBreakdown = Object.values(categoryMap).map((c) => ({
    category: c.category,
    creatorsCount: c.creatorsCount,
    hoursStreamed: Number(c.hoursStreamed.toFixed(1)),
    revenue: {
      amount: c.revenue.toFixed(2),
      currency: "USD",
    },
  }));

  if (categoryBreakdown.length === 0) {
    categoryBreakdown.push({
      category: "General",
      creatorsCount: 0,
      hoursStreamed: 0,
      revenue: { amount: "0.00", currency: "USD" },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      totalLiveHoursAggregate,
      avgHoursPerCreator,
      totalCreatorCount,
      grossCreatorRevenue: {
        amount: grossCreatorRevenue.toFixed(2),
        currency: "USD",
      },
      netAgencyCommission: {
        amount: netAgencyCommission.toFixed(2),
        currency: "USD",
      },
      monthlyTrends,
      categoryBreakdown,
    },
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
  getAgencyDashboard,
  inviteCreator,
  getAgencyRoster,
  getAgencyInvitations,
  cancelAgencyInvitation,
  getAgencyPerformance,
  respondAgencyInvite,
  getAdminAgencies,
  reviewAgency,
};
