const User = require("../models/userModel");
const Post = require("../models/postModel");
const Reel = require("../models/reelModel");
const Report = require("../models/reportModel");
const PostReport = require("../models/postReportModel");
const Stream = require("../models/streamModel");
const GlobalTransaction = require("../models/globalTransactionsModel");
const { sendBroadcast } = require("./notificationController");

const safeUserProjection = "-password -fcmtoken -plaidAccessToken -plaidItemId -bankAccountDetails -paypalAccountDetails";

const getStats = async (req, res) => {
  try {
    const activeSince = new Date(Date.now() - 5 * 60 * 1000);
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const [users, posts, reels, liveStreams, activeToday, userReports, postReports, verified, revenue] = await Promise.all([
      User.countDocuments(), Post.countDocuments(), Reel.countDocuments(), Stream.countDocuments({ lastHeartbeatAt: { $gte: activeSince } }),
      User.countDocuments({ is_online: "1" }),
      Report.countDocuments(), PostReport.countDocuments(), User.countDocuments({ isVerified: true }),
      GlobalTransaction.aggregate([
        { $match: { status: "completed", createdAt: { $gte: startOfDay } } },
        { $group: { _id: null, total: { $sum: { $ifNull: ["$amount", 0] } } } },
      ]),
    ]);
    res.json({ success: true, stats: { users, posts, reels, liveStreams, activeToday, revenueToday: revenue[0]?.total || 0, pendingReports: userReports + postReports, userReports, postReports, verified } });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getUsers = async (req, res) => {
  try {
    const page = Math.max(Number.parseInt(req.query.page || "1", 10), 1);
    const perPage = Math.min(Math.max(Number.parseInt(req.query.perPage || "20", 10), 1), 100);
    const search = String(req.query.search || "").trim();
    const query = search ? { $or: [
      { username: { $regex: search, $options: "i" } }, { firstname: { $regex: search, $options: "i" } },
      { lastname: { $regex: search, $options: "i" } }, { email: { $regex: search, $options: "i" } },
    ] } : {};
    const [users, total] = await Promise.all([
      User.find(query).select(safeUserProjection).sort({ _id: -1 }).skip((page - 1) * perPage).limit(perPage).lean(),
      User.countDocuments(query),
    ]);
    res.json({ success: true, users, pagination: { page, perPage, total, pages: Math.ceil(total / perPage) } });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getReports = async (req, res) => {
  try {
    const [userReports, postReports] = await Promise.all([
      Report.find().populate("reportedUser", "username firstname lastname").populate("reportedBy", "username").sort({ reportedAt: -1 }).limit(100).lean(),
      PostReport.find().populate("reported", "username firstname lastname").populate("userid", "username").sort({ createdAt: -1 }).limit(100).lean(),
    ]);
    const reports = [
      ...userReports.map((r) => ({ id: r._id, type: "User", title: r.reason, subject: r.reportedUser?.username || "Unknown user", createdAt: r.reportedAt })),
      ...postReports.map((r) => ({ id: r._id, type: "Post", title: r.message || r.type || "Post report", subject: r.reported?.username || "Unknown user", createdAt: r.createdAt })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.json({ success: true, reports: reports.slice(0, 100) });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getActiveLives = async (req, res) => {
  try {
    const activeSince = new Date(Date.now() - 5 * 60 * 1000);
    const streams = await Stream.find({ lastHeartbeatAt: { $gte: activeSince } }).sort({ lastHeartbeatAt: -1 }).limit(100).lean();
    res.json({ success: true, streams });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const stopLive = async (req, res) => {
  try {
    const stream = await Stream.findById(req.params.id);
    if (!stream) return res.status(404).json({ error: "Live stream not found" });
    await Stream.findByIdAndDelete(stream._id);
    if (stream.userid) await User.updateOne({ _id: stream.userid }, { $set: { isLive: false } });
    res.json({ success: true, message: "Live stream ended" });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getTransactions = async (req, res) => {
  try {
    const transactions = await GlobalTransaction.find().sort({ createdAt: -1 }).limit(100).populate("user_id", "username email").lean();
    res.json({ success: true, transactions });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const getContent = async (req, res) => {
  try {
    const search = String(req.query.search || "").trim();
    const limit = Math.min(Math.max(Number.parseInt(req.query.limit || "100", 10), 1), 200);
    const textFilter = search ? { description: { $regex: search, $options: "i" } } : {};
    const [posts, reels] = await Promise.all([
      Post.find(textFilter).populate("userid", "username firstname lastname isVerified").sort({ createdAt: -1 }).limit(limit).lean(),
      Reel.find(textFilter).populate("userid", "username firstname lastname isVerified").sort({ createdAt: -1 }).limit(limit).lean(),
    ]);
    const content = [
      ...posts.map((post) => ({ id: post._id, type: "Post", description: post.description, media: post.contents || [], thumbnail: post.thumbnails?.[0] || "", author: post.userid, createdAt: post.createdAt, likes: post.likes?.length || 0, comments: post.comments?.length || 0, shares: post.shares || 0, visibility: post.postType || "public", flagged: Boolean(post.abusiveText || Object.keys(post.sigthengineResults || {}).length) })),
      ...reels.map((reel) => ({ id: reel._id, type: "Reel", description: reel.description, media: reel.video ? [reel.video] : [], thumbnail: reel.thumbnail || "", author: reel.userid, createdAt: reel.createdAt, likes: reel.likes?.length || 0, comments: reel.comments?.length || 0, shares: reel.shares || 0, visibility: "public", flagged: Boolean(reel.sightengineResults?.length) })),
    ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt)).slice(0, limit);
    res.json({ success: true, content });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const broadcastNotification = async (req, res) => {
  try {
    const title = String(req.body.title || "").trim();
    const body = String(req.body.body || "").trim();
    if (!title || !body) return res.status(400).json({ error: "Notification title and message are required" });
    const users = await User.find({ fcmtoken: { $exists: true, $ne: [] } }).select("_id").lean();
    await Promise.all(users.map((user) => sendBroadcast(user._id, title, body)));
    res.json({ success: true, recipients: users.length });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

const resolveReport = async (req, res) => {
  try {
    const Model = req.params.type === "post" ? PostReport : req.params.type === "user" ? Report : null;
    if (!Model) return res.status(400).json({ error: "Report type must be user or post" });
    const result = await Model.deleteOne({ _id: req.params.id });
    if (!result.deletedCount) return res.status(404).json({ error: "Report not found" });
    res.json({ success: true, message: "Report resolved" });
  } catch (error) { res.status(500).json({ error: error.message }); }
};

module.exports = { getStats, getUsers, getReports, getActiveLives, stopLive, getTransactions, getContent, broadcastNotification, resolveReport };
