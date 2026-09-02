const Post = require("../models/postModel");
const User = require("../models/userModel");
const { getPost } = require("./postController");
const {
  recalculateTrendingPosts,
  trendingEligibleFilter,
} = require("../services/trendingPostsService");

const TRENDING_REFRESH_MS = 10 * 60 * 1000;
const TRENDING_LIMIT = 5;
const MAX_POSTS_PER_CREATOR = 2;

const safePublicPostFilter = {
  postType: "public",
  price: { $lte: 0 },
  restrictedContent: { $ne: true },
  abusiveText: { $ne: true },
  isRemoved: { $ne: true },
  removed: { $ne: true },
  isDeleted: { $ne: true },
  deleted: { $ne: true },
  underModeration: { $ne: true },
  moderationStatus: {
    $nin: ["pending", "review", "under_review", "rejected", "removed"],
  },
};

function limitPostsPerCreator(candidates) {
  const creatorCounts = new Map();
  return candidates.filter((post) => {
    const creatorId = post.userid?.toString();
    if (!creatorId) return false;
    const count = creatorCounts.get(creatorId) || 0;
    if (count >= MAX_POSTS_PER_CREATOR) return false;
    creatorCounts.set(creatorId, count + 1);
    return true;
  });
}

async function hydrateTrendingPosts(candidates) {
  const posts = [];
  for (const candidate of candidates) {
    try {
      const [post, owner] = await Promise.all([
        getPost(candidate._id),
        User.findById(candidate.userid).select("isVerified").lean(),
      ]);
      post.isVerified = owner?.isVerified || false;
      post.trendingScore = candidate.trendingScore ?? null;
      post.trendingCalculatedAt = candidate.trendingCalculatedAt ?? null;
      posts.push(post);
      if (posts.length === TRENDING_LIMIT) break;
    } catch (error) {
      console.error(
        `Unable to hydrate trending post ${candidate._id}:`,
        error.message,
      );
    }
  }
  return posts;
}

async function getTrendingPosts(req, res) {
  try {
    const now = Date.now();
    const latestCalculation = await Post.findOne(trendingEligibleFilter())
      .sort({ trendingCalculatedAt: -1 })
      .select("trendingCalculatedAt")
      .lean();

    const calculationTime =
      latestCalculation?.trendingCalculatedAt?.getTime?.() || 0;
    if (now - calculationTime >= TRENDING_REFRESH_MS) {
      await recalculateTrendingPosts();
    }

    let candidates = await Post.find(trendingEligibleFilter())
      .sort({ trendingScore: -1, createdAt: -1 })
      .limit(100)
      .select("_id userid trendingScore trendingCalculatedAt createdAt")
      .lean();

    let fallback = false;
    if (candidates.length === 0) {
      fallback = true;
      candidates = await Post.find(safePublicPostFilter)
        .sort({ createdAt: -1 })
        .limit(100)
        .select("_id userid trendingScore trendingCalculatedAt createdAt")
        .lean();
    }

    const limitedCandidates = limitPostsPerCreator(candidates);
    const posts = await hydrateTrendingPosts(limitedCandidates);

    res.status(200).json({
      posts,
      recalculatedAt: posts[0]?.trendingCalculatedAt || null,
      fallback,
    });
  } catch (error) {
    console.error("getTrendingPosts error:", error);
    res.status(500).json({ error: "Unable to load trending posts" });
  }
}

module.exports = { getTrendingPosts };
