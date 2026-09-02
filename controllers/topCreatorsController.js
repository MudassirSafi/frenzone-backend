const User = require("../models/userModel");
const { getPicUrl } = require("./userController");
const {
  recalculateTopCreators,
  CREATOR_REFRESH_MS,
} = require("../services/topCreatorsService");

function balancedCreators(creators, limit) {
  const emergingTarget = Math.max(1, Math.floor(limit / 3));
  const emerging = creators.filter(
    (creator) =>
      (creator.creatorScoreMetrics?.followers || 0) <= 100 ||
      (creator.creatorScoreMetrics?.postsLast30Days || 0) <= 3,
  );
  const established = creators.filter((creator) => !emerging.includes(creator));
  const selected = [
    ...established.slice(0, limit - emergingTarget),
    ...emerging.slice(0, emergingTarget),
  ];

  for (const creator of creators) {
    if (selected.length >= limit) break;
    if (!selected.some((item) => item._id.toString() === creator._id.toString())) {
      selected.push(creator);
    }
  }
  return selected.sort((a, b) => b.creatorScore - a.creatorScore);
}

async function getTopCreatorSuggestions(req, res) {
  try {
    const limit = Math.min(30, Math.max(1, Number(req.query.limit) || 12));
    const latest = await User.findOne({
      creatorScoreCalculatedAt: { $ne: null },
    })
      .sort({ creatorScoreCalculatedAt: -1 })
      .select("creatorScoreCalculatedAt")
      .lean();
    const calculatedAt = latest?.creatorScoreCalculatedAt?.getTime?.() || 0;
    if (Date.now() - calculatedAt >= CREATOR_REFRESH_MS) {
      await recalculateTopCreators();
    }

    const pool = await User.find({
      creatorScore: { $ne: null },
      "creatorScoreMetrics.postsLast30Days": { $gte: 1 },
      banned: { $ne: true },
      systemBlocked: { $ne: true },
      isAdminBlocked: { $ne: true },
      underStrike: { $ne: true },
      isPhantom: { $ne: true },
    })
      .sort({ creatorScore: -1, creatorScoreCalculatedAt: -1 })
      .limit(Math.max(limit * 5, 50))
      .select(
        "firstname lastname username profilePicture followers isLive creatorScore creatorScoreCalculatedAt creatorScoreMetrics",
      )
      .lean();

    const selected = balancedCreators(pool, limit);
    const creators = await Promise.all(
      selected.map(async (creator) => ({
        _id: creator._id,
        firstname: creator.firstname || "",
        lastname: creator.lastname || "",
        username: creator.username || "",
        profilePicture: await getPicUrl(creator._id),
        isLive: creator.isLive || false,
        isEmerging:
          (creator.creatorScoreMetrics?.followers || 0) <= 100 ||
          (creator.creatorScoreMetrics?.postsLast30Days || 0) <= 3,
        creatorScore: creator.creatorScore,
        creatorScoreCalculatedAt: creator.creatorScoreCalculatedAt,
        metrics: creator.creatorScoreMetrics,
      })),
    );

    res.status(200).json({
      success: true,
      creators,
      recalculatedAt: creators[0]?.creatorScoreCalculatedAt || null,
    });
  } catch (error) {
    console.error("getTopCreatorSuggestions error:", error);
    res.status(500).json({ error: "Unable to load top creator suggestions" });
  }
}

module.exports = { getTopCreatorSuggestions };
