const crypto = require("crypto");
const jwt = require("jsonwebtoken");
const Referral = require("../../models/referralModel");
const ReferralScan = require("../../models/referralScanModel");
const User = require("../../models/userModel");
const StreamAnalysis = require("../../models/streamAnalysisModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const { aws } = require("../../helpers/otherHelpers");
const { buildCanonicalReferralUrl } = require("../../helpers/canonicalUrlHelper");

/**
 * @desc Fetch or generate unique referral code and canonical URL for authenticated user
 * @route GET /referral/code
 * @access Private (Authenticated User)
 */
const getReferralCode = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const user = await User.findById(userId).select("username referralCode app_user_id firstname lastname profilePicture");

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  let code = user.referralCode;
  if (!code || /\s/.test(code)) {
    if (user.app_user_id && !/\s/.test(user.app_user_id)) {
      code = user.app_user_id;
    } else if (user.username && /^[a-zA-Z0-9_-]+$/.test(user.username)) {
      code = user.username;
    } else {
      code = `FZ${userId.toString().slice(-6).toUpperCase()}`;
    }
    await User.findByIdAndUpdate(userId, { referralCode: code });
  }

  // Derive canonical frontend URL from environment or request origin (environment-aware)
  const referralLink = buildCanonicalReferralUrl(code, req);

  let avatarUrl = "";
  if (user.profilePicture && typeof aws?.getLinkFromAWS === "function") {
    try {
      avatarUrl = await aws.getLinkFromAWS(user.profilePicture);
    } catch {
      avatarUrl = "";
    }
  }

  const displayName = `${user.firstname || ""} ${user.lastname || ""}`.trim() || user.username;

  return res.status(200).json({
    success: true,
    creatorId: userId.toString(),
    referralCode: code,
    referralUrl: referralLink,
    referralLink,
    displayName,
    username: user.username,
    avatarUrl,
    trackingEnabled: true,
  });
});

/**
 * @desc Track QR scan / referral landing visit with rate-limiting and self-scan prevention
 * @route POST /referral/track-scan
 * @access Public (with optional creator auth inspection)
 */
const trackReferralScan = catchAsyncError(async (req, res) => {
  const { referralCode } = req.body;

  if (!referralCode || typeof referralCode !== "string") {
    return res.status(400).json({
      success: false,
      error: "Referral code is required.",
    });
  }

  const cleanCode = referralCode.trim();

  // Validate that the referral code belongs to an active user/creator
  const creator = await User.findOne({
    $or: [
      { referralCode: cleanCode },
      { app_user_id: cleanCode },
      { username: cleanCode.toLowerCase() },
    ],
  }).select("_id username firstname lastname referralScanCount");

  if (!creator) {
    return res.status(404).json({
      success: false,
      error: "Referral code not found or invalid.",
    });
  }

  // Self-scan prevention: check if scanner token belongs to this creator
  let isSelfScan = false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    try {
      const token = authHeader.split(" ")[1];
      const decoded = jwt.decode(token);
      const scannerId = decoded?.id || decoded?.uid || decoded?.user_id;
      if (scannerId && scannerId.toString() === creator._id.toString()) {
        isSelfScan = true;
      }
    } catch {
      // Ignore token decode errors for anonymous scans
    }
  }

  // Deduplication & Anti-Abuse: 1 scan per IP hash per code per 1-hour window
  const rawIp = req.headers["x-forwarded-for"] || req.socket?.remoteAddress || "127.0.0.1";
  const clientIp = String(rawIp).split(",")[0].trim();
  const ipHash = crypto.createHash("sha256").update(clientIp).digest("hex");
  const userAgent = String(req.headers["user-agent"] || "").slice(0, 255);

  const oneHourAgo = new Date(Date.now() - 3600 * 1000);
  const recentScan = await ReferralScan.findOne({
    referral_code: cleanCode,
    ip_hash: ipHash,
    createdAt: { $gte: oneHourAgo },
  });

  const shouldRecord = !recentScan && !isSelfScan;

  if (shouldRecord) {
    try {
      await Promise.all([
        ReferralScan.create({
          referral_code: cleanCode,
          referrer_id: creator._id,
          ip_hash: ipHash,
          user_agent: userAgent,
        }),
        User.findByIdAndUpdate(creator._id, {
          $inc: { referralScanCount: 1 },
        }),
      ]);
    } catch (err) {
      console.warn("Scan record write non-blocking error:", err.message);
    }
  }

  const creatorName = `${creator.firstname || ""} ${creator.lastname || ""}`.trim() || creator.username;

  return res.status(200).json({
    success: true,
    valid: true,
    referralCode: cleanCode,
    creator: {
      id: creator._id,
      name: creatorName,
      username: creator.username,
    },
    recorded: shouldRecord,
    isSelfScan,
  });
});

/**
 * @desc Get referral performance stats for authenticated user
 * @route GET /referral/stats
 * @access Private (Authenticated User)
 */
const getReferralStats = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;

  const [totalReferred, qualifiedCount, totalScans, recentReferrals, allReferrals] = await Promise.all([
    Referral.countDocuments({ referrer_id: userId }),
    Referral.countDocuments({ referrer_id: userId, status: "qualified" }),
    ReferralScan.countDocuments({ referrer_id: userId }),
    Referral.find({ referrer_id: userId })
      .populate("referred_user_id", "username firstname lastname profilePicture createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
    Referral.find({ referrer_id: userId }).select("referred_user_id").lean(),
  ]);

  // Aggregate stream earnings of all referred users
  const referredUserIds = allReferrals
    .map((r) => r.referred_user_id)
    .filter(Boolean);

  let totalEarningsUSD = 0;
  if (referredUserIds.length > 0) {
    const streamAgg = await StreamAnalysis.aggregate([
      { $match: { userid: { $in: referredUserIds } } },
      {
        $group: {
          _id: null,
          totalUsd: { $sum: "$usdEarned" },
          totalDiamonds: { $sum: "$diamondsEarned" },
        },
      },
    ]);
    if (streamAgg.length > 0) {
      const usdShare = (streamAgg[0].totalUsd || 0) * 0.10; // 10% bonus
      const diamondShare = (streamAgg[0].totalDiamonds || 0) * 0.042;
      totalEarningsUSD = usdShare + diamondShare;
    }
  }

  // Dynamic Referral Tier calculation
  let referralTier = "Starter";
  let tierDetail = `${Math.max(0, 5 - qualifiedCount)} more qualified referrals to unlock Bronze Partner`;
  if (qualifiedCount >= 50) {
    referralTier = "VIP Partner";
    tierDetail = "Qualified for priority payouts & maximum bonuses";
  } else if (qualifiedCount >= 20) {
    referralTier = "Gold Partner";
    tierDetail = "Qualified for 10% revenue split & fast-track review";
  } else if (qualifiedCount >= 5) {
    referralTier = "Bronze Partner";
    tierDetail = "Qualified for standard revenue split";
  }

  return res.status(200).json({
    success: true,
    totalScans,
    totalReferred,
    qualifiedCount,
    stats: {
      totalReferred,
      qualifiedCount,
      totalScans,
      conversionRate: totalReferred > 0 ? ((qualifiedCount / totalReferred) * 100).toFixed(1) + "%" : "0%",
      totalReferralEarningsUSD: totalEarningsUSD.toFixed(2),
      referralTier,
      tierDetail,
      trend: {
        value: totalReferred > 0 ? `+${Math.min(totalReferred * 5, 25)}%` : "0%",
        positive: totalReferred > 0,
      },
    },
    recentReferrals,
  });
});

module.exports = {
  getReferralCode,
  trackReferralScan,
  getReferralStats,
};
