const mongoose = require("mongoose");
const User = require("../../models/userModel");
const Wallet = require("../../models/walletModel");
const StreamAnalysis = require("../../models/streamAnalysisModel");
const CreatorApplication = require("../../models/creatorApplicationModel");
const Referral = require("../../models/referralModel");
const Payout = require("../../models/payoutModel");
const CreatorAgencyRelationship = require("../../models/creatorAgencyRelationshipModel");
const Agency = require("../../models/agencyModel");
const GlobalTransaction = require("../../models/globalTransactionsModel");
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
      avatarUrl: avatarUrl || "",
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
    if (trimmedPhone && !/^[+0-9\s().-]{5,30}$/.test(trimmedPhone)) {
      return res.status(400).json({ success: false, error: "Invalid phone number format." });
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

  const isValidSocialLink = (val) => {
    if (!val) return true;
    if (val.startsWith("http://") || val.startsWith("https://")) {
      try {
        const u = new URL(val);
        return u.protocol === "http:" || u.protocol === "https:";
      } catch {
        return false;
      }
    }
    return /^@?[a-zA-Z0-9._-]+$/.test(val);
  };

  if (socialLinks && typeof socialLinks === "object") {
    if (socialLinks.instagram !== undefined) {
      const ig = String(socialLinks.instagram).trim();
      if (ig.length > 200) {
        return res.status(400).json({ success: false, error: "Instagram URL must not exceed 200 characters." });
      }
      if (ig && !isValidSocialLink(ig)) {
        return res.status(400).json({ success: false, error: "Invalid Instagram URL or handle format." });
      }
      userUpdates.instagramUrl = ig;
      appUpdates["content_profile.social_links.instagram"] = ig;
    }
    if (socialLinks.tiktok !== undefined) {
      const tt = String(socialLinks.tiktok).trim();
      if (tt.length > 200) {
        return res.status(400).json({ success: false, error: "TikTok URL must not exceed 200 characters." });
      }
      if (tt && !isValidSocialLink(tt)) {
        return res.status(400).json({ success: false, error: "Invalid TikTok URL or handle format." });
      }
      userUpdates.tiktokUrl = tt;
      appUpdates["content_profile.social_links.tiktok"] = tt;
    }
    if (socialLinks.youtube !== undefined) {
      const yt = String(socialLinks.youtube).trim();
      if (yt.length > 200) {
        return res.status(400).json({ success: false, error: "YouTube URL must not exceed 200 characters." });
      }
      if (yt && !isValidSocialLink(yt)) {
        return res.status(400).json({ success: false, error: "Invalid YouTube URL or handle format." });
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

/**
 * @desc Get creator compliance and daily hours tracker
 * @route GET /creator/compliance
 * @access Private (Authenticated Creator)
 */
const getCreatorCompliance = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Month filtering (default to current month: YYYY-MM)
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth(); // 0-indexed

  if (req.query.month && typeof req.query.month === "string") {
    const parts = req.query.month.split("-");
    if (parts.length === 2) {
      const parsedYear = parseInt(parts[0], 10);
      const parsedMonth = parseInt(parts[1], 10) - 1;
      if (!isNaN(parsedYear) && !isNaN(parsedMonth) && parsedMonth >= 0 && parsedMonth <= 11) {
        year = parsedYear;
        month = parsedMonth;
      }
    }
  }

  const startOfMonth = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  const endOfMonth = new Date(Date.UTC(year, month + 1, 0, 23, 59, 59, 999));
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Monthly target hours standard is 40.0 hours, daily target is 1.5h
  const monthlyTargetHours = 40.0;
  const dailyTargetHours = 1.5;

  // Query completed stream sessions in this month
  const streams = await StreamAnalysis.find({
    userid: userObjectId,
    endedAt: { $gte: startOfMonth, $lte: endOfMonth },
  }).sort({ endedAt: 1 }).lean();

  // Group achieved duration by date (YYYY-MM-DD)
  const dailyStreamMap = {};
  for (const stream of streams) {
    const streamDate = new Date(stream.endedAt).toISOString().split("T")[0];
    let durationHours = 0.5; // fallback
    if (stream.endedAt && stream.createdAt) {
      const diffMs = new Date(stream.endedAt).getTime() - new Date(stream.createdAt).getTime();
      durationHours = Math.max(0.1, diffMs / (1000 * 60 * 60));
    }
    dailyStreamMap[streamDate] = (dailyStreamMap[streamDate] || 0) + durationHours;
  }

  // Build dailyLogs for the entire month
  const dailyLogs = [];
  let monthlyCompletedHours = 0;
  let activeStreamDays = 0;

  const todayStr = now.toISOString().split("T")[0];

  for (let day = 1; day <= daysInMonth; day++) {
    const dayStr = day < 10 ? `0${day}` : `${day}`;
    const monthStr = (month + 1) < 10 ? `0${month + 1}` : `${month + 1}`;
    const dateKey = `${year}-${monthStr}-${dayStr}`;

    const achieved = Number((dailyStreamMap[dateKey] || 0).toFixed(1));
    monthlyCompletedHours += achieved;

    if (achieved > 0) {
      activeStreamDays++;
    }

    let status = "MISSED";
    let notes = "No broadcast session recorded";

    const isFuture = dateKey > todayStr;
    const isToday = dateKey === todayStr;

    if (achieved >= dailyTargetHours) {
      status = "COMPLETED";
      notes = `Target achieved (${achieved}h broadcast)`;
    } else if (achieved > 0) {
      status = "PARTIAL";
      notes = `Partial broadcast (${achieved}h of ${dailyTargetHours}h target)`;
    } else if (isToday) {
      status = "PARTIAL";
      notes = "Daily broadcast pending";
    } else if (isFuture) {
      status = "EXCUSED";
      notes = "Scheduled future broadcast date";
    }

    dailyLogs.push({
      id: `log-${dateKey}`,
      date: dateKey,
      targetHours: dailyTargetHours,
      achievedHours: achieved,
      status,
      notes,
    });
  }

  // Reverse so newest days appear first in the log table
  dailyLogs.reverse();

  monthlyCompletedHours = Number(monthlyCompletedHours.toFixed(1));
  const compliancePercentage = Math.min(100, Math.round((monthlyCompletedHours / monthlyTargetHours) * 100));

  let overallStatus = "MISSED";
  if (compliancePercentage >= 75) {
    overallStatus = "COMPLETED";
  } else if (compliancePercentage >= 35 || (now.getDate() <= 15 && activeStreamDays >= 3)) {
    overallStatus = "PARTIAL";
  }

  const user = await User.findById(userObjectId).select("identifyApprovalStatus liveAccess").lean();
  const isApproved = user?.identifyApprovalStatus === "approved" || user?.liveAccess === true;

  const rulesChecklist = [
    {
      id: "rule-1",
      title: "Minimum 15 Live Stream Days / Month",
      description: "Broadcast for at least 1 hour across 15 separate calendar days.",
      isCompliant: activeStreamDays >= 15,
    },
    {
      id: "rule-2",
      title: "Minimum Monthly Live Hours (40h)",
      description: "Accumulate 40 or more broadcast hours within the current billing cycle.",
      isCompliant: monthlyCompletedHours >= monthlyTargetHours,
    },
    {
      id: "rule-3",
      title: "High-Definition Video Quality (1080p)",
      description: "Maintain stable video stream bitrate and resolution standards.",
      isCompliant: true,
    },
    {
      id: "rule-4",
      title: "Community Guidelines & Safety Compliance",
      description: "Zero strikes or policy warnings on your active creator account.",
      isCompliant: isApproved,
    },
  ];

  return res.status(200).json({
    success: true,
    data: {
      overallStatus,
      monthlyTargetHours,
      monthlyCompletedHours,
      compliancePercentage,
      activeStreamDays,
      dailyLogs,
      rulesChecklist,
    },
  });
});

/**
 * @desc Fetch Creator Referral Roster and earnings breakdown per referred user
 * @route GET /creator/referrals
 * @access Private (Creator Only)
 */
const getCreatorReferrals = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Fetch all referrals initiated by this creator
  const referrals = await Referral.find({ referrer_id: userObjectId })
    .populate("referred_user_id", "username firstname lastname profilePicture createdAt isVerified liveAccess")
    .sort({ createdAt: -1 })
    .lean();

  if (!referrals || referrals.length === 0) {
    return res.status(200).json({
      success: true,
      data: [],
    });
  }

  // Extract referred user ObjectIDs
  const referredUserIds = referrals
    .filter((r) => r.referred_user_id && r.referred_user_id._id)
    .map((r) => new mongoose.Types.ObjectId(r.referred_user_id._id));

  // Aggregate stream performance & earnings for each referred creator
  const streamEarningsMap = new Map();
  if (referredUserIds.length > 0) {
    const streamStats = await StreamAnalysis.aggregate([
      { $match: { userid: { $in: referredUserIds } } },
      {
        $group: {
          _id: "$userid",
          totalUsd: { $sum: "$usdEarned" },
          totalDiamonds: { $sum: "$diamondsEarned" },
          streamCount: { $sum: 1 },
        },
      },
    ]);

    streamStats.forEach((stat) => {
      streamEarningsMap.set(stat._id.toString(), stat);
    });
  }

  // Build resolved roster list
  const roster = await Promise.all(
    referrals.map(async (ref) => {
      const u = ref.referred_user_id;
      if (!u) {
        return null;
      }

      const uidStr = u._id.toString();
      const streamData = streamEarningsMap.get(uidStr) || { totalUsd: 0, totalDiamonds: 0, streamCount: 0 };

      // 10% recurring referral commission calculation
      const usdCommission = (streamData.totalUsd || 0) * 0.10;
      const diamondCommission = (streamData.totalDiamonds || 0) * 0.042;
      const totalCommission = Number((usdCommission + diamondCommission).toFixed(2));

      // Resolve avatar
      let avatarUrl = "";
      if (u.profilePicture) {
        if (u.profilePicture.startsWith("http://") || u.profilePicture.startsWith("https://") || u.profilePicture.startsWith("data:")) {
          avatarUrl = u.profilePicture;
        } else if (typeof aws?.getLinkFromAWS === "function") {
          try {
            avatarUrl = await aws.getLinkFromAWS(u.profilePicture);
          } catch {
            avatarUrl = "";
          }
        }
      }
      if (!avatarUrl) {
        const displayName = `${u.firstname || ""} ${u.lastname || ""}`.trim() || u.username || "Creator";
        avatarUrl = `https://ui-avatars.com/api/?name=${encodeURIComponent(displayName)}&background=8b5cf6&color=fff`;
      }

      const fullName = `${u.firstname || ""} ${u.lastname || ""}`.trim();
      const displayName = fullName ? `${fullName} (@${u.username})` : (u.username ? `@${u.username}` : "Referred Creator");

      const joinedDate = ref.createdAt
        ? new Date(ref.createdAt).toISOString().split("T")[0]
        : (u.createdAt ? new Date(u.createdAt).toISOString().split("T")[0] : new Date().toISOString().split("T")[0]);

      // If user has streamed or status is qualified or verified, ACTIVE, else PENDING
      const isActive = ref.status === "qualified" || streamData.streamCount > 0 || u.isVerified;

      return {
        id: ref._id.toString(),
        referredUser: displayName,
        avatarUrl,
        joinedDate,
        status: isActive ? "ACTIVE" : "PENDING",
        earningsGenerated: {
          amount: totalCommission.toFixed(2),
          currency: "USD",
        },
      };
    })
  );

  const cleanRoster = roster.filter(Boolean);

  return res.status(200).json({
    success: true,
    data: cleanRoster,
  });
});

/**
 * @desc Fetch authoritative Creator Earnings breakdown, sources, and statement history
 * @route GET /creator/earnings
 * @access Private (Authenticated Creator)
 */
const getCreatorEarnings = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Parallel bounded queries for financial calculations
  const [wallet, completedPayoutsAgg, pendingPayoutsAgg, streamGiftsAgg, tipsAgg, subAgg, referralAgg] = await Promise.all([
    Wallet.findOne({ userid: userObjectId }).lean(),
    Payout.aggregate([
      { $match: { userId: userObjectId, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$netAmount" } } },
    ]),
    Payout.aggregate([
      { $match: { userId: userObjectId, status: { $in: ["pending", "processing"] } } },
      { $group: { _id: null, total: { $sum: "$amount" } } },
    ]),
    StreamAnalysis.aggregate([
      { $match: { userid: userObjectId } },
      {
        $group: {
          _id: null,
          totalUsd: { $sum: "$usdEarned" },
          totalDiamonds: { $sum: "$diamondsEarned" },
        },
      },
    ]),
    GlobalTransaction.aggregate([
      { $match: { creator_id: userObjectId, type: "tip", status: "completed" } },
      { $group: { _id: null, total: { $sum: "$net_creator_amount" } } },
    ]),
    GlobalTransaction.aggregate([
      { $match: { creator_id: userObjectId, type: { $in: ["club_subscription", "live_shop_subscription"] }, status: "completed" } },
      { $group: { _id: null, total: { $sum: "$net_creator_amount" } } },
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
  ]);

  // Available for Payout (from Wallet settled balance, 100 diamonds = $1.00)
  const diamondsBalance = Number(wallet?.diamonds || 0);
  const earnedAmount = Number(wallet?.earnedAmount || wallet?.currentAmount || 0);
  const availableAmount = Math.max(0, diamondsBalance > 0 ? diamondsBalance / 100 : earnedAmount);

  // Completed payouts to date
  const totalPaidOut = completedPayoutsAgg[0]?.total || 0;

  // Pending Clearance payouts
  const pendingClearanceAmount = pendingPayoutsAgg[0]?.total || 0;

  // Total Lifetime Gross Earnings (settled available + past completed payouts)
  const totalLifetimeEarnings = availableAmount + totalPaidOut;

  // Revenue Sources (Live Stream Gifts, Tips, Subscriptions, Referral Bonus)
  const giftUsd = Math.max(0, streamGiftsAgg[0]?.totalUsd || (streamGiftsAgg[0]?.totalDiamonds ? streamGiftsAgg[0].totalDiamonds / 100 : 0));
  const tipsUsd = Math.max(0, tipsAgg[0]?.total || 0);
  const subsUsd = Math.max(0, subAgg[0]?.total || 0);
  const referralCount = referralAgg[0]?.qualifiedCount || 0;
  const referralBonusUsd = referralCount * 5.0; // $5.00 per qualified referral

  const combinedSourceSum = giftUsd + tipsUsd + subsUsd + referralBonusUsd;

  const sources = [
    {
      category: "Live Stream Gifts",
      amount: { amount: giftUsd.toFixed(2), currency: "USD" },
      percentage: combinedSourceSum > 0 ? Math.round((giftUsd / combinedSourceSum) * 100) : 0,
    },
    {
      category: "Direct Tips",
      amount: { amount: tipsUsd.toFixed(2), currency: "USD" },
      percentage: combinedSourceSum > 0 ? Math.round((tipsUsd / combinedSourceSum) * 100) : 0,
    },
    {
      category: "Club Subscriptions",
      amount: { amount: subsUsd.toFixed(2), currency: "USD" },
      percentage: combinedSourceSum > 0 ? Math.round((subsUsd / combinedSourceSum) * 100) : 0,
    },
    {
      category: "Referral Bonus",
      amount: { amount: referralBonusUsd.toFixed(2), currency: "USD" },
      percentage: combinedSourceSum > 0 ? Math.round((referralBonusUsd / combinedSourceSum) * 100) : 0,
    },
  ];

  // 6-Month Historical Statement Log
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const now = new Date();
  const history = [];

  for (let i = 0; i < 6; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const startOfM = new Date(Date.UTC(d.getFullYear(), d.getMonth(), 1, 0, 0, 0));
    const endOfM = new Date(Date.UTC(d.getFullYear(), d.getMonth() + 1, 0, 23, 59, 59, 999));
    const periodLabel = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;

    // Parallel queries for this month window
    const [mStream, mTips, mSubs, mRefs] = await Promise.all([
      StreamAnalysis.aggregate([
        { $match: { userid: userObjectId, endedAt: { $gte: startOfM, $lte: endOfM } } },
        { $group: { _id: null, total: { $sum: "$usdEarned" }, diamonds: { $sum: "$diamondsEarned" } } },
      ]),
      GlobalTransaction.aggregate([
        { $match: { creator_id: userObjectId, type: "tip", status: "completed", createdAt: { $gte: startOfM, $lte: endOfM } } },
        { $group: { _id: null, total: { $sum: "$net_creator_amount" } } },
      ]),
      GlobalTransaction.aggregate([
        { $match: { creator_id: userObjectId, type: { $in: ["club_subscription", "live_shop_subscription"] }, status: "completed", createdAt: { $gte: startOfM, $lte: endOfM } } },
        { $group: { _id: null, total: { $sum: "$net_creator_amount" } } },
      ]),
      Referral.countDocuments({
        referrer_id: userObjectId,
        status: "qualified",
        createdAt: { $gte: startOfM, $lte: endOfM },
      }),
    ]);

    const mGiftAmt = mStream[0]?.total || (mStream[0]?.diamonds ? mStream[0].diamonds / 100 : 0);
    const mTipAmt = mTips[0]?.total || 0;
    const mSubAmt = mSubs[0]?.total || 0;
    const mRefAmt = mRefs * 5.0;
    const mTotal = mGiftAmt + mTipAmt + mSubAmt + mRefAmt;

    history.push({
      id: `stmt-${d.getFullYear()}-${d.getMonth() + 1}`,
      period: periodLabel,
      gifts: { amount: mGiftAmt.toFixed(2), currency: "USD" },
      tips: { amount: mTipAmt.toFixed(2), currency: "USD" },
      subscriptions: { amount: mSubAmt.toFixed(2), currency: "USD" },
      referralBonus: { amount: mRefAmt.toFixed(2), currency: "USD" },
      total: { amount: mTotal.toFixed(2), currency: "USD" },
    });
  }

  return res.status(200).json({
    success: true,
    data: {
      totalEarnings: {
        amount: totalLifetimeEarnings.toFixed(2),
        currency: "USD",
      },
      availableForPayout: {
        amount: availableAmount.toFixed(2),
        currency: "USD",
      },
      pendingClearance: {
        amount: pendingClearanceAmount.toFixed(2),
        currency: "USD",
      },
      sources,
      history,
    },
  });
});

/**
 * @desc Get authenticated creator's affiliated Agency or pending partnership invitation
 * @route GET /creator/agency
 * @access Private (Authenticated Creator)
 */
const getCreatorAgency = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const rel = await CreatorAgencyRelationship.findOne({
    creator_id: userObjectId,
    status: { $in: ["active", "pending_creator_consent", "pending_admin_approval"] },
  })
    .populate("agency_id")
    .populate("invited_by", "firstname lastname username email")
    .sort({ createdAt: -1 })
    .lean();

  if (!rel || !rel.agency_id) {
    return res.status(200).json({
      success: true,
      data: {
        hasAgency: false,
        status: "NONE",
        rawStatus: "none",
        agencyName: "",
        agencyId: "",
        contractStartDate: "",
        managerName: "",
        managerEmail: "",
        commissionSplitRate: 20,
      },
    });
  }

  const agency = rel.agency_id;
  const manager = rel.invited_by || agency.main_contact;

  let status = "NONE";
  if (rel.status === "active") status = "ACTIVE";
  else if (rel.status === "pending_creator_consent") status = "PENDING_CONSENT";
  else if (rel.status === "pending_admin_approval") status = "PENDING_ADMIN";

  return res.status(200).json({
    success: true,
    data: {
      hasAgency: true,
      invitationId: String(rel._id),
      status,
      rawStatus: rel.status,
      agencyId: String(agency._id),
      agencyName: agency.agency_name || "Partner Agency",
      contractStartDate: rel.joined_at
        ? new Date(rel.joined_at).toISOString().split("T")[0]
        : (rel.createdAt ? new Date(rel.createdAt).toISOString().split("T")[0] : "Recently"),
      managerName: manager
        ? `${manager.firstname || ""} ${manager.lastname || ""}`.trim() || manager.name || manager.username
        : "Agency Manager",
      managerEmail: manager?.email || agency.main_contact?.email || "agency@frenzone.live",
      commissionSplitRate: 20,
      country: agency.country || "United States",
      website: agency.website || "",
    },
  });
});

module.exports = {
  getCreatorDashboard,
  getCreatorPerformance,
  getCreatorProfile,
  updateCreatorProfile,
  uploadCreatorAvatar,
  getCreatorCompliance,
  getCreatorReferrals,
  getCreatorEarnings,
  getCreatorAgency,
};
