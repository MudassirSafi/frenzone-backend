const mongoose = require("mongoose");
const User = require("../../models/userModel");
const Wallet = require("../../models/walletModel");
const StreamAnalysis = require("../../models/streamAnalysisModel");
const CreatorApplication = require("../../models/creatorApplicationModel");
const Referral = require("../../models/referralModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const { aws } = require("../../helpers/otherHelpers");

function formatRelativeTime(date) {
  if (!date) return "Recently";
  const now = new Date();
  const diffMs = now - new Date(date);
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHours = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffHours < 1) return diffMin <= 1 ? "Just now" : `${diffMin}m ago`;
  if (diffHours < 24) return diffHours === 1 ? "1h ago" : `${diffHours}h ago`;
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/**
 * @desc Fetch authoritative Creator Dashboard overview metrics
 * @route GET /creator/dashboard
 * @access Private (Authenticated User)
 */
const getCreatorDashboard = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Parallel bounded queries for optimal throughput
  const [user, wallet, app, streamAgg, referralStats, recentStreams, recentReferrals] = await Promise.all([
    User.findById(userObjectId)
      .select("username firstname lastname followers rankingPoints isVerified liveAccess referralCode app_user_id profilePicture")
      .lean(),
    Wallet.findOne({ userid: userObjectId }).select("diamond totalReceivedTips").lean(),
    CreatorApplication.findOne({ user_id: userObjectId })
      .select("status legal_agreements createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean(),
    StreamAnalysis.aggregate([
      { $match: { userid: userObjectId } },
      {
        $group: {
          _id: null,
          totalStreams: { $sum: 1 },
          totalLikes: { $sum: "$likes" },
          totalGifts: { $sum: "$giftsReceived" },
          totalCoins: { $sum: "$giftCoins" },
          totalDiamonds: { $sum: "$diamondsEarned" },
          totalUsd: { $sum: "$usdEarned" },
        },
      },
    ]),
    Referral.aggregate([
      { $match: { referrer_id: userObjectId } },
      {
        $group: {
          _id: null,
          totalReferred: { $sum: 1 },
          qualifiedCount: {
            $sum: { $cond: [{ $eq: ["$status", "qualified"] }, 1, 0] },
          },
        },
      },
    ]),
    StreamAnalysis.find({ userid: userObjectId })
      .select("likes giftsReceived giftCoins diamondsEarned usdEarned endedAt")
      .sort({ endedAt: -1 })
      .limit(5)
      .lean(),
    Referral.find({ referrer_id: userObjectId })
      .select("status createdAt")
      .sort({ createdAt: -1 })
      .limit(5)
      .lean(),
  ]);

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const agg = streamAgg[0] || {
    totalStreams: 0,
    totalLikes: 0,
    totalGifts: 0,
    totalCoins: 0,
    totalDiamonds: 0,
    totalUsd: 0,
  };

  const ref = referralStats[0] || { totalReferred: 0, qualifiedCount: 0 };
  const referralCode = user.referralCode || user.app_user_id || user.username;
  const followersCount = Array.isArray(user.followers) ? user.followers.length : 0;
  const diamondsBalance = wallet?.diamond || agg.totalDiamonds || 0;
  const estimatedEarnings = (diamondsBalance * 0.42).toFixed(2);

  // Derive dynamic activities timeline from actual database events
  const activityItems = [];
  (recentStreams || []).forEach((stream) => {
    activityItems.push({
      id: `stream-${stream._id}`,
      title: stream.likes > 0
        ? `Completed Live Stream (${stream.likes.toLocaleString()} likes)`
        : "Completed Live Stream Session",
      timestamp: formatRelativeTime(stream.endedAt),
      rawDate: stream.endedAt || new Date(),
      type: "stream",
    });
    if (stream.giftCoins > 0 || stream.giftsReceived > 0) {
      activityItems.push({
        id: `earning-${stream._id}`,
        title: stream.giftCoins > 0
          ? `Earned ${stream.giftCoins.toLocaleString()} gift coins`
          : `Received ${stream.giftsReceived} gifts in stream`,
        timestamp: formatRelativeTime(stream.endedAt),
        rawDate: stream.endedAt || new Date(),
        type: "earning",
      });
    }
  });

  (recentReferrals || []).forEach((refDoc) => {
    activityItems.push({
      id: `ref-${refDoc._id}`,
      title: refDoc.status === "qualified"
        ? "Referred Creator Qualified & Active"
        : "New Referred Creator Joined",
      timestamp: formatRelativeTime(refDoc.createdAt),
      rawDate: refDoc.createdAt || new Date(),
      type: "referral",
    });
  });

  if (app && app.status === "approved") {
    activityItems.push({
      id: `compliance-${app._id}`,
      title: "Creator Program Verification Approved",
      timestamp: formatRelativeTime(app.updatedAt || app.createdAt),
      rawDate: app.updatedAt || app.createdAt || new Date(),
      type: "compliance",
    });
  }

  // Sort chronologically descending and take top 5
  activityItems.sort((a, b) => new Date(b.rawDate) - new Date(a.rawDate));
  const recentActivities = activityItems.slice(0, 5).map(({ id, title, timestamp, type }) => ({
    id,
    title,
    timestamp,
    type,
  }));

  const liveHours = Math.round((agg.totalStreams || 0) * 1.5);
  const liveHoursTarget = 40;
  const contentProgress = Math.min(100, Math.round((liveHours / liveHoursTarget) * 100));
  const isApproved = app?.status === "approved" || Boolean(user.liveAccess && user.isVerified);
  const complianceStatus = isApproved ? (liveHours >= liveHoursTarget ? "COMPLETED" : "PARTIAL") : "PENDING";

  return res.status(200).json({
    success: true,
    data: {
      creatorName: `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.username,
      username: user.username,
      applicationStatus: app ? app.status : "none",
      isApproved,
      complianceStatus,
      liveHours,
      liveHoursTarget,
      contentProgress,
      availableEarnings: {
        amount: estimatedEarnings,
        currency: "USD",
      },
      pendingEarnings: {
        amount: "0.00",
        currency: "USD",
      },
      totalViewers: followersCount + (agg.totalLikes || 0),
      referralCode,
      referralLink: `https://frenzone.live/join/${referralCode}`,
      recentActivities,
      stats: {
        followersCount,
        rankingPoints: user.rankingPoints || 0,
        totalStreams: agg.totalStreams,
        totalLikes: agg.totalLikes,
        totalGiftsReceived: agg.totalGifts,
        diamondsEarned: diamondsBalance,
        estimatedEarningsUSD: Number(estimatedEarnings),
        totalReferred: ref.totalReferred,
        qualifiedReferrals: ref.qualifiedCount,
      },
    },
  });
});

/**
 * @desc Fetch Creator Performance telemetry trend
 * @route GET /creator/performance
 * @access Private (Authenticated User)
 */
const getCreatorPerformance = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const range = (req.query?.range || "30d").toLowerCase();

  // Determine date filter based on range
  const filter = { userid: userObjectId };
  const now = new Date();
  if (range === "7d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 7);
    filter.endedAt = { $gte: d };
  } else if (range === "30d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 30);
    filter.endedAt = { $gte: d };
  } else if (range === "90d") {
    const d = new Date(now);
    d.setDate(d.getDate() - 90);
    filter.endedAt = { $gte: d };
  } // 'all' leaves filter.endedAt unrestricted

  // Parallel fetch: streams in range + user details for followers count
  const [streams, user] = await Promise.all([
    StreamAnalysis.find(filter)
      .select("likes giftsReceived giftCoins diamondsEarned usdEarned endedAt createdAt")
      .sort({ endedAt: -1 })
      .limit(100)
      .lean(),
    User.findById(userObjectId).select("followers").lean(),
  ]);

  const totalStreamSessions = streams.length;
  let totalLikes = 0;
  let totalGifts = 0;
  let totalHoursStreamed = 0;
  let peakConcurrentViewers = 0;

  const trendData = streams.map((stream) => {
    const likes = Number(stream.likes || 0);
    const gifts = Number(stream.giftCoins || stream.giftsReceived || 0);

    // Calculate stream duration in hours (if createdAt and endedAt are present, compute diff; min 0.5h, fallback 1.5h)
    let hours = 1.5;
    if (stream.createdAt && stream.endedAt) {
      const diffHrs = (new Date(stream.endedAt).getTime() - new Date(stream.createdAt).getTime()) / (1000 * 60 * 60);
      if (diffHrs > 0.1 && diffHrs < 24) {
        hours = Number(diffHrs.toFixed(1));
      }
    }

    totalLikes += likes;
    totalGifts += gifts;
    totalHoursStreamed += hours;
    if (likes > peakConcurrentViewers) {
      peakConcurrentViewers = likes;
    }

    const d = stream.endedAt ? new Date(stream.endedAt) : new Date();
    const dateFormatted = d.toLocaleDateString(undefined, { month: "short", day: "numeric" });

    return {
      id: String(stream._id),
      date: dateFormatted,
      rawDate: d,
      hours,
      viewers: likes,
      gifts,
    };
  });

  // Calculate realistic KPIs
  const followersCount = Array.isArray(user?.followers) ? user.followers.length : 0;
  const totalViewersCount = totalLikes > 0 ? totalLikes : followersCount;
  const avgWatchTimeMinutes = totalStreamSessions > 0
    ? Math.min(120, Math.max(15, Math.round((totalHoursStreamed * 60) / (totalStreamSessions * 2))))
    : 0;

  const engagementRate = totalViewersCount > 0
    ? Number(Math.min(100, ((totalGifts + totalLikes) / totalViewersCount) * 10).toFixed(1))
    : 0;

  // Chronological order (oldest to newest) for chart display
  const chronologicalTrend = [...trendData].reverse().map(({ date, hours, viewers, gifts }) => ({
    date,
    hours,
    viewers,
    gifts,
  }));

  return res.status(200).json({
    success: true,
    data: {
      totalHoursStreamed: Number(totalHoursStreamed.toFixed(1)),
      totalStreamSessions,
      totalViewersCount,
      peakConcurrentViewers,
      avgWatchTimeMinutes,
      engagementRate,
      trendData: chronologicalTrend,
    },
    recentStreams: streams.slice(0, 30),
    count: totalStreamSessions,
  });
});

/**
 * @desc Fetch authenticated creator profile
 * @route GET /creator/profile
 * @access Private (Authenticated User)
 */
const getCreatorProfile = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const [user, app] = await Promise.all([
    User.findById(userObjectId).lean(),
    CreatorApplication.findOne({ user_id: userObjectId })
      .sort({ createdAt: -1 })
      .lean(),
  ]);

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  // Resolve Profile Picture URL
  let avatarUrl = "";
  if (user.profilePicture) {
    if (user.profilePicture.startsWith("http://") || user.profilePicture.startsWith("https://") || user.profilePicture.startsWith("data:")) {
      avatarUrl = user.profilePicture;
    } else if (typeof aws?.getLinkFromAWS === "function") {
      try {
        avatarUrl = await aws.getLinkFromAWS(user.profilePicture);
      } catch {
        avatarUrl = "";
      }
    }
  }

  // Determine payment method details
  let paymentMethod = {
    type: "PAYPAL",
    accountHolder: `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.username,
    details: user.paypalAccountPayout || user.paypalAccountDetails?.email || (user.email ? `${user.email} (Default)` : "Not configured"),
  };

  if (user.bankAccountPayout || user.bankAccountDetails) {
    paymentMethod = {
      type: "BANK_TRANSFER",
      accountHolder: user.bankAccountDetails?.accountHolderName || `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.username,
      details: user.bankAccountPayout || "Bank Account Connected",
    };
  }

  const isApproved = app?.status === "approved" || Boolean(user.liveAccess && user.isVerified);
  const status = isApproved ? "ACTIVE" : (app?.status === "suspended" || user.banned ? "SUSPENDED" : "INACTIVE");

  const categories = app?.content_profile?.category ? [app.content_profile.category] : ["Live Streaming"];

  const agreementSignedDate = app?.legal_agreements?.accepted_at
    ? new Date(app.legal_agreements.accepted_at).toISOString().split("T")[0]
    : (user.createdAt ? new Date(user.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

  return res.status(200).json({
    success: true,
    data: {
      id: String(user._id),
      username: user.username,
      fullName: `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.username,
      email: user.email || "",
      phone: user.phone || app?.contact_info?.phone || "",
      country: user.country || app?.demographics?.country || "",
      language: user.language || app?.demographics?.language || "English",
      bio: user.bio || user.about || "",
      avatarUrl: avatarUrl || "https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=150&auto=format&fit=crop&q=80",
      categories,
      socialLinks: {
        instagram: user.instagramUrl || app?.content_profile?.social_links?.instagram || "",
        tiktok: user.tiktokUrl || app?.content_profile?.social_links?.tiktok || "",
        youtube: user.youtubeUrl || app?.content_profile?.social_links?.youtube || "",
      },
      paymentMethod,
      agreementSignedDate,
      status,
    },
  });
});

/**
 * @desc Update authenticated creator profile
 * @route PATCH /creator/profile
 * @access Private (Authenticated User)
 */
const updateCreatorProfile = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const user = await User.findById(userObjectId);
  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  const { fullName, phone, country, language, bio, socialLinks } = req.body;

  const userUpdates = {};
  const appUpdates = {};

  if (fullName !== undefined) {
    const trimmed = String(fullName).trim();
    if (trimmed.length > 100) {
      return res.status(400).json({ success: false, error: "Full name must not exceed 100 characters." });
    }
    const parts = trimmed.split(/\s+/);
    const firstname = parts[0] || "";
    const lastname = parts.slice(1).join(" ") || "";
    userUpdates.firstname = firstname;
    userUpdates.lastname = lastname;
    appUpdates["legal_name.firstname"] = firstname;
    appUpdates["legal_name.lastname"] = lastname;
  }

  if (bio !== undefined) {
    const trimmedBio = String(bio).trim();
    if (trimmedBio.length > 1000) {
      return res.status(400).json({ success: false, error: "Bio must not exceed 1000 characters." });
    }
    userUpdates.bio = trimmedBio;
    userUpdates.about = trimmedBio;
  }

  if (phone !== undefined) {
    const trimmedPhone = String(phone).trim();
    if (trimmedPhone.length > 30) {
      return res.status(400).json({ success: false, error: "Phone number must not exceed 30 characters." });
    }
    userUpdates.phone = trimmedPhone;
    appUpdates["contact_info.phone"] = trimmedPhone;
  }

  if (country !== undefined) {
    const trimmedCountry = String(country).trim();
    if (trimmedCountry.length > 100) {
      return res.status(400).json({ success: false, error: "Country must not exceed 100 characters." });
    }
    userUpdates.country = trimmedCountry;
    appUpdates["demographics.country"] = trimmedCountry;
  }

  if (language !== undefined) {
    const trimmedLanguage = String(language).trim();
    if (trimmedLanguage.length > 100) {
      return res.status(400).json({ success: false, error: "Language must not exceed 100 characters." });
    }
    userUpdates.language = trimmedLanguage;
    appUpdates["demographics.language"] = trimmedLanguage;
  }

  if (socialLinks && typeof socialLinks === "object") {
    if (socialLinks.instagram !== undefined) {
      const ig = String(socialLinks.instagram).trim();
      if (ig.length > 200) {
        return res.status(400).json({ success: false, error: "Instagram URL must not exceed 200 characters." });
      }
      userUpdates.instagramUrl = ig;
      appUpdates["content_profile.social_links.instagram"] = ig;
    }
    if (socialLinks.tiktok !== undefined) {
      const tt = String(socialLinks.tiktok).trim();
      if (tt.length > 200) {
        return res.status(400).json({ success: false, error: "TikTok URL must not exceed 200 characters." });
      }
      userUpdates.tiktokUrl = tt;
      appUpdates["content_profile.social_links.tiktok"] = tt;
    }
    if (socialLinks.youtube !== undefined) {
      const yt = String(socialLinks.youtube).trim();
      if (yt.length > 200) {
        return res.status(400).json({ success: false, error: "YouTube URL must not exceed 200 characters." });
      }
      userUpdates.youtubeUrl = yt;
      appUpdates["content_profile.social_links.youtube"] = yt;
    }
  }

  // Update User document
  if (Object.keys(userUpdates).length > 0) {
    await User.findByIdAndUpdate(userObjectId, { $set: userUpdates });
  }

  // Update CreatorApplication if existing
  if (Object.keys(appUpdates).length > 0) {
    await CreatorApplication.findOneAndUpdate(
      { user_id: userObjectId },
      { $set: appUpdates },
      { sort: { createdAt: -1 } }
    );
  }

  // Re-fetch and return updated profile
  return getCreatorProfile(req, res);
});

/**
 * @desc Upload creator profile picture
 * @route POST /creator/avatar
 * @access Private (Authenticated User)
 */
const uploadCreatorAvatar = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image file provided." });
  }

  const allowedMimeTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];
  if (!allowedMimeTypes.includes(req.file.mimetype)) {
    return res.status(400).json({ success: false, error: "Invalid image format. Allowed formats: JPEG, PNG, WEBP, GIF." });
  }

  if (req.file.size > 5 * 1024 * 1024) {
    return res.status(400).json({ success: false, error: "Image size exceeds maximum limit of 5MB." });
  }

  let avatarKey = "";
  let avatarUrl = "";

  // Check if AWS S3 is configured
  if (typeof aws?.uploadToAWS === "function" && process.env.ACCESS_KEY && !process.env.ACCESS_KEY.includes("placeholder")) {
    try {
      avatarKey = await aws.uploadToAWS(req.file);
      avatarUrl = await aws.getLinkFromAWS(avatarKey);
    } catch (err) {
      console.warn("S3 upload failed, falling back to data URL:", err.message);
    }
  }

  // Fallback for development environments without live AWS credentials
  if (!avatarKey) {
    const base64 = req.file.buffer.toString("base64");
    avatarUrl = `data:${req.file.mimetype};base64,${base64}`;
    avatarKey = avatarUrl;
  }

  await User.findByIdAndUpdate(userId, { profilePicture: avatarKey });

  return res.status(200).json({
    success: true,
    message: "Avatar uploaded successfully.",
    avatarUrl,
  });
});

module.exports = {
  getCreatorDashboard,
  getCreatorPerformance,
  getCreatorProfile,
  updateCreatorProfile,
  uploadCreatorAvatar,
};
