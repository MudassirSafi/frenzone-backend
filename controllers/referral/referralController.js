const Referral = require("../../models/referralModel");
const User = require("../../models/userModel");
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

  const [totalReferred, qualifiedCount, recentReferrals] = await Promise.all([
    Referral.countDocuments({ referrer_id: userId }),
    Referral.countDocuments({ referrer_id: userId, status: "qualified" }),
    Referral.find({ referrer_id: userId })
      .populate("referred_user_id", "username firstname lastname profilePicture createdAt")
      .sort({ createdAt: -1 })
      .limit(10)
      .lean(),
  ]);

  return res.status(200).json({
    success: true,
    stats: {
      totalReferred,
      qualifiedCount,
      conversionRate: totalReferred > 0 ? ((qualifiedCount / totalReferred) * 100).toFixed(1) + "%" : "0%",
    },
    recentReferrals,
  });
});

module.exports = {
  getReferralCode,
  getReferralStats,
};
