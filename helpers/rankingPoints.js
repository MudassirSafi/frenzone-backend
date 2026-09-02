const mongoose = require("mongoose");
const User = require("../models/userModel");
const Post = require("../models/postModel");

const toSafeInt = (value, fallback = 0) => {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.trunc(n);
};

const round2 = (n) => Math.round(n * 100) / 100;

const computeTotalPostLikesForUser = async (userId) => {
  const uid = typeof userId === "string" ? new mongoose.Types.ObjectId(userId) : userId;
  const rows = await Post.aggregate([
    { $match: { userid: uid } },
    { $project: { likesCount: { $size: { $ifNull: ["$likes", []] } } } },
    { $group: { _id: null, totalLikes: { $sum: "$likesCount" } } },
  ]);
  return rows?.[0]?.totalLikes || 0;
};

const calculateRankingPoints = ({ totalLikes = 0, followersCount = 0, minutesSpentInApp = 0 }) => {
  const hours = Math.max(0, toSafeInt(minutesSpentInApp, 0)) / 60;
  const likesPoints = Math.max(0, toSafeInt(totalLikes, 0)) * 1;
  const followersPoints = Math.max(0, toSafeInt(followersCount, 0)) * 2;
  const hoursPoints = hours * 0.1;
  return round2(likesPoints + followersPoints + hoursPoints);
};

const updateRankingPointsForUser = async (userId) => {
  if (!mongoose.Types.ObjectId.isValid(userId)) return null;

  const user = await User.findById(userId).select("followers minutesSpentInApp").lean();
  if (!user) return null;

  const followersCount = Array.isArray(user.followers) ? user.followers.length : 0;
  const totalLikes = await computeTotalPostLikesForUser(userId);

  const rankingPoints = calculateRankingPoints({
    totalLikes,
    followersCount,
    minutesSpentInApp: user.minutesSpentInApp || 0,
  });

  await User.updateOne({ _id: userId }, { rankingPoints });
  return rankingPoints;
};

module.exports = {
  calculateRankingPoints,
  computeTotalPostLikesForUser,
  updateRankingPointsForUser,
};

