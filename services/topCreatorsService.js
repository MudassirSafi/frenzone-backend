const User = require("../models/userModel");
const Post = require("../models/postModel");
const Comment = require("../models/commentModel");
const GlobalTransaction = require("../models/globalTransactionsModel");
const Club = require("../models/clubModel");

const CREATOR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
const CREATOR_REFRESH_MS = 24 * 60 * 60 * 1000;

const countUniqueUsers = (users) =>
  new Set((users || []).filter(Boolean).map(String)).size;

const eligiblePostFilter = (cutoff) => ({
  createdAt: { $gte: cutoff },
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

const eligibleCreatorFilter = (creatorIds) => ({
  _id: { $in: creatorIds },
  banned: { $ne: true },
  systemBlocked: { $ne: true },
  isAdminBlocked: { $ne: true },
  underStrike: { $ne: true },
  isPhantom: { $ne: true },
  underModeration: { $ne: true },
  moderationStatus: { $nin: ["pending", "review", "under_review", "suspended"] },
  accountStatus: { $nin: ["inactive", "suspended", "moderation"] },
});

async function calculateTopCreators() {
  const now = new Date();
  const cutoff = new Date(now.getTime() - CREATOR_WINDOW_MS);
  const posts = await Post.find(eligiblePostFilter(cutoff))
    .select("_id userid likes sharedBy")
    .lean();

  if (posts.length === 0) {
    await User.updateMany(
      { creatorScore: { $ne: null } },
      { $set: { creatorScore: null, creatorScoreCalculatedAt: now } },
    );
    return 0;
  }

  const postIds = posts.map((post) => post._id);
  const creatorIds = [...new Set(posts.map((post) => post.userid.toString()))];
  const creatorObjectIds = [
    ...new Map(posts.map((post) => [post.userid.toString(), post.userid])).values(),
  ];

  const [commentGroups, gifterGroups, clubs, creators] = await Promise.all([
    Comment.aggregate([
      { $match: { postid: { $in: postIds } } },
      { $group: { _id: "$postid", users: { $addToSet: "$userid" } } },
    ]),
    GlobalTransaction.aggregate([
      {
        $match: {
          creator_id: { $in: creatorObjectIds },
          type: "tip",
          status: "completed",
          createdAt: { $gte: cutoff },
        },
      },
      { $group: { _id: "$creator_id", users: { $addToSet: "$user_id" } } },
    ]),
    Club.find({ userid: { $in: creatorIds } }).select("userid members").lean(),
    User.find(eligibleCreatorFilter(creatorIds))
      .select("_id followers")
      .lean(),
  ]);

  const commentsByPost = new Map(
    commentGroups.map((group) => [
      group._id.toString(),
      countUniqueUsers(group.users),
    ]),
  );
  const giftersByCreator = new Map(
    gifterGroups.map((group) => [
      group._id.toString(),
      countUniqueUsers(group.users),
    ]),
  );
  const clubMembersByCreator = new Map();
  for (const club of clubs) {
    const creatorId = club.userid.toString();
    const members = clubMembersByCreator.get(creatorId) || new Set();
    for (const member of club.members || []) members.add(member.toString());
    clubMembersByCreator.set(creatorId, members);
  }

  const postsByCreator = new Map();
  for (const post of posts) {
    const creatorId = post.userid.toString();
    const metrics = postsByCreator.get(creatorId) || {
      posts: 0,
      likes: 0,
      comments: 0,
      shares: 0,
    };
    metrics.posts += 1;
    metrics.likes += countUniqueUsers(post.likes);
    metrics.comments += commentsByPost.get(post._id.toString()) || 0;
    metrics.shares += countUniqueUsers(post.sharedBy);
    postsByCreator.set(creatorId, metrics);
  }

  const eligibleCreatorIds = new Set(creators.map((creator) => creator._id.toString()));
  const operations = creators.map((creator) => {
    const id = creator._id.toString();
    const engagement = postsByCreator.get(id);
    const postCount = engagement.posts;
    const followers = countUniqueUsers(creator.followers);
    const averageLikes = engagement.likes / postCount;
    const averageComments = engagement.comments / postCount;
    const averageShares = engagement.shares / postCount;
    const uniqueGifters = giftersByCreator.get(id) || 0;
    const clubSubscribers = clubMembersByCreator.get(id)?.size || 0;
    const creatorScore =
      followers * 0.2 +
      postCount * 5 +
      averageLikes * 2 +
      averageComments * 3 +
      averageShares * 4 +
      uniqueGifters * 5 +
      clubSubscribers * 10;

    return {
      updateOne: {
        filter: { _id: creator._id },
        update: {
          $set: {
            creatorScore,
            creatorScoreCalculatedAt: now,
            creatorScoreMetrics: {
              followers,
              postsLast30Days: postCount,
              averageLikes,
              averageComments,
              averageShares,
              uniqueGifters,
              clubSubscribers,
            },
          },
        },
      },
    };
  });

  if (operations.length > 0) {
    await User.bulkWrite(operations, { ordered: false });
  }
  await User.updateMany(
    {
      creatorScore: { $ne: null },
      _id: { $nin: [...eligibleCreatorIds] },
    },
    { $set: { creatorScore: null, creatorScoreCalculatedAt: now } },
  );
  return operations.length;
}

let recalculationPromise = null;

async function recalculateTopCreators() {
  if (!recalculationPromise) {
    recalculationPromise = calculateTopCreators().finally(() => {
      recalculationPromise = null;
    });
  }
  return recalculationPromise;
}

module.exports = {
  recalculateTopCreators,
  CREATOR_REFRESH_MS,
  CREATOR_WINDOW_MS,
};
