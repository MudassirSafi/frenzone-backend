const Referral = require("../../models/referralModel");
const User = require("../../models/userModel");
const StreamAnalysis = require("../../models/streamAnalysisModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");

/**
 * @desc Fetch or generate unique referral code for authenticated user
 * @route GET /referral/code
 * @access Private (Authenticated User)
 */
const getReferralCode = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const user = await User.findById(userId).select("username referralCode app_user_id");

  if (!user) {
    return res.status(404).json({ success: false, error: "User not found" });
  }

  let code = user.referralCode || user.app_user_id || user.username;
  if (!code) {
    code = `FZ${userId.toString().slice(-6).toUpperCase()}`;
    await User.findByIdAndUpdate(userId, { referralCode: code });
  }

  const referralLink = `https://frenzone.live/join/${code}`;

  return res.status(200).json({
    success: true,
    referralCode: code,
    referralLink,
  });
});

/**
 * @desc Get referral performance stats for authenticated user
 * @route GET /referral/stats
 * @access Private (Authenticated User)
 */
const getReferralStats = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;

  const [totalReferred, qualifiedCount, recentReferrals, allReferrals] = await Promise.all([
    Referral.countDocuments({ referrer_id: userId }),
    Referral.countDocuments({ referrer_id: userId, status: "qualified" }),
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
    stats: {
      totalReferred,
      qualifiedCount,
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
  getReferralStats,
};
