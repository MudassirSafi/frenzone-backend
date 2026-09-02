const Post = require("../models/postModel");
const Comment = require("../models/commentModel");
const GlobalTransaction = require("../models/globalTransactionsModel");

const countUniqueUsers = (users) =>
  new Set((users || []).filter(Boolean).map(String)).size;

const trendingEligibleFilter = () => ({
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
});

async function recalculateTrendingPosts() {
  const now = new Date();
  const posts = await Post.find(trendingEligibleFilter())
    .select("_id userid likes sharedBy createdAt")
    .lean();

  if (posts.length === 0) return 0;
  const postIds = posts.map((post) => post._id);

  const [commentGroups, gifterGroups] = await Promise.all([
    Comment.aggregate([
      { $match: { postid: { $in: postIds } } },
      { $group: { _id: "$postid", users: { $addToSet: "$userid" } } },
    ]),
    GlobalTransaction.aggregate([
      {
        $match: {
          post_id: { $in: postIds },
          type: "tip",
          status: "completed",
        },
      },
      { $group: { _id: "$post_id", users: { $addToSet: "$user_id" } } },
    ]),
  ]);

  const commentsByPost = new Map(
    commentGroups.map((group) => [
      group._id.toString(),
      countUniqueUsers(group.users),
    ]),
  );
  const giftersByPost = new Map(
    gifterGroups.map((group) => [
      group._id.toString(),
      countUniqueUsers(group.users),
    ]),
  );

  const operations = posts.map((post) => {
    const id = post._id.toString();
    const uniqueLikes = countUniqueUsers(post.likes);
    const uniqueComments = commentsByPost.get(id) || 0;
    const uniqueShares = countUniqueUsers(post.sharedBy);
    const uniqueGifters = giftersByPost.get(id) || 0;
    const ageHours = Math.max(0, (now - new Date(post.createdAt)) / 3600000);
    const trendingScore =
      uniqueLikes + uniqueComments * 3 + uniqueShares * 5 +
      uniqueGifters * 4 - ageHours * 2;

    return {
      updateOne: {
        filter: { _id: post._id },
        update: { $set: { trendingScore, trendingCalculatedAt: now } },
      },
    };
  });

  await Post.bulkWrite(operations, { ordered: false });
  return operations.length;
}

module.exports = {
  recalculateTrendingPosts,
  trendingEligibleFilter,
};
