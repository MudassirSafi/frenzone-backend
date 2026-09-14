const crypto = require("crypto");
const mongoose = require("mongoose");
const User = require("../../models/userModel");
const CreatorApplication = require("../../models/creatorApplicationModel");
const Stream = require("../../models/streamModel");
const StreamAnalysis = require("../../models/streamAnalysisModel");
const Activity = require("../../models/activityModel");
const { generateRtcToken, getAppId, isAgoraConfigured } = require("../agoraController");
const { catchAsyncError } = require("../../helpers/catchAsyncError");

/**
 * Helper to save completed StreamAnalysis upon session finalization
 */
const saveStreamAnalysisRecord = async (stream, durationSeconds = 0) => {
  if (!stream) return null;
  const host = (stream.broadcasters || []).find(
    b => b.role === "host" || b.userid?.toString() === stream.userid?.toString()
  );
  const giftCoins = Number(stream.giftCoins || host?.earnings || 0);
  const diamondsEarned = giftCoins * 0.42;
  const topGifters = [...(stream.gifters || [])]
    .sort((a, b) => Number(b.coins || 0) - Number(a.coins || 0))
    .slice(0, 3)
    .map(gifter => ({
      userid: gifter.userid,
      username: gifter.username || "",
      profilePicture: gifter.profilePicture || "",
      giftCount: Number(gifter.giftCount || 0),
      coins: Number(gifter.coins || 0),
    }));

  return StreamAnalysis.findOneAndUpdate(
    { streamid: stream._id },
    {
      streamid: stream._id,
      userid: stream.userid,
      clubid: stream.clubid || null,
      likes: Math.max(Number(stream.likes || 0), Number(stream.likeCount || 0)),
      giftsReceived: Number(stream.giftCount || 0),
      giftCoins,
      diamondsEarned,
      usdEarned: diamondsEarned,
      durationSeconds: Math.max(0, Number(durationSeconds || 0)),
      topGifters,
      endedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
};

/**
 * @desc Verify authoritative Live Access eligibility and active stream state for a creator
 * @route GET /creator/live/status
 * @access Private (Authenticated Creator)
 */
const getCreatorLiveStatus = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({
      success: false,
      authorized: false,
      error: "Authentication required",
    });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Parallel lookup of user, creator application status, and any existing active stream
  const [user, creatorApp, activeStream] = await Promise.all([
    User.findById(userObjectId)
      .select("username firstname lastname isVerified liveAccess banned followers isLive profilePicture")
      .lean(),
    CreatorApplication.findOne({ user_id: userObjectId })
      .select("status legal_agreements admin_review createdAt updatedAt")
      .sort({ createdAt: -1 })
      .lean(),
    Stream.findOne({ userid: userObjectId })
      .select("channelName token lastHeartbeatAt createdAt members broadcasters likes giftCoins")
      .lean(),
  ]);

  if (!user) {
    return res.status(404).json({
      success: false,
      authorized: false,
      error: "Creator account not found",
    });
  }

  // 1. Account suspended or banned
  if (user.banned) {
    return res.status(403).json({
      success: true,
      authorized: false,
      reason: "banned",
      message: "Your account is currently suspended or banned from broadcasting.",
    });
  }

  // 2. Live access explicitly revoked by platform admin
  if (user.liveAccess === false) {
    return res.status(403).json({
      success: true,
      authorized: false,
      reason: "live_access_revoked",
      message: "Live streaming access has been disabled for this account by administration.",
    });
  }

  // 3. Creator Application status check
  if (creatorApp) {
    if (creatorApp.status === "suspended") {
      return res.status(403).json({
        success: true,
        authorized: false,
        reason: "creator_suspended",
        message: "Your creator broadcasting privileges are currently suspended.",
      });
    }
    if (creatorApp.status === "rejected") {
      return res.status(403).json({
        success: true,
        authorized: false,
        reason: "application_rejected",
        message: "Your creator application was not approved. Please review requirements and reapply.",
      });
    }
  }

  // 4. Server-authoritative eligibility criteria
  const isApprovedCreator = creatorApp?.status === "approved";
  const hasFollowerThreshold = Array.isArray(user.followers) && user.followers.length >= 1000;
  const isVerified = Boolean(user.isVerified);
  const hasLiveAccess = Boolean(user.liveAccess);

  const isEligible = hasLiveAccess && (isApprovedCreator || isVerified || hasFollowerThreshold);
  if (!isEligible) {
    const isPending = creatorApp?.status === "pending" || creatorApp?.status === "more_info_required";
    return res.status(403).json({
      success: true,
      authorized: false,
      reason: isPending ? "application_pending" : "not_eligible",
      message: isPending
        ? "Your creator application is currently pending review. Live streaming will be unlocked once approved."
        : "To go live, your creator application must be approved, or your account must be verified or have at least 1,000 followers.",
    });
  }

  // 5. Active stream conflict detection
  let hasActiveStream = false;
  let streamSummary = null;

  if (activeStream) {
    const cutoff = new Date(Date.now() - 60 * 1000);
    const isAlive = activeStream.lastHeartbeatAt && new Date(activeStream.lastHeartbeatAt) >= cutoff;

    if (isAlive) {
      hasActiveStream = true;
      streamSummary = {
        streamId: activeStream._id.toString(),
        channelName: activeStream.channelName,
        startedAt: activeStream.createdAt,
        lastHeartbeatAt: activeStream.lastHeartbeatAt,
        viewerCount: Array.isArray(activeStream.members) ? activeStream.members.length : 0,
      };
    }
  }

  return res.status(200).json({
    success: true,
    authorized: true,
    creator: {
      id: user._id.toString(),
      username: user.username,
      displayName: [user.firstname, user.lastname].filter(Boolean).join(" ") || user.username,
      avatarUrl: user.profilePicture || "",
      isVerified: Boolean(user.isVerified),
      liveAccess: Boolean(user.liveAccess),
      isApprovedCreator,
    },
    hasActiveStream,
    activeStream: streamSummary,
    agoraConfigured: isAgoraConfigured(),
    agoraAppId: getAppId(),
  });
});

/**
 * @desc Initialize browser live broadcasting session and issue secure Agora token
 * @route POST /creator/live/start
 * @access Private (Authenticated Creator)
 */
const startCreatorLiveSession = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);

  const [user, creatorApp] = await Promise.all([
    User.findById(userObjectId),
    CreatorApplication.findOne({ user_id: userObjectId }).sort({ createdAt: -1 }).lean(),
  ]);

  if (!user) {
    return res.status(404).json({ success: false, error: "Creator account not found" });
  }

  if (user.banned || user.liveAccess === false) {
    return res.status(403).json({
      success: false,
      error: "Broadcasting access restricted for this account.",
    });
  }

  const isApprovedCreator = creatorApp?.status === "approved";
  const hasFollowerThreshold = Array.isArray(user.followers) && user.followers.length >= 1000;
  const isVerified = Boolean(user.isVerified);
  const isEligible = user.liveAccess && (isApprovedCreator || isVerified || hasFollowerThreshold);

  if (!isEligible) {
    return res.status(403).json({
      success: false,
      error: "Creator is not eligible for live broadcasting.",
    });
  }

  // Check Agora configuration status
  const agoraConfigured = isAgoraConfigured();

  // Check existing streams for session conflict / resume handling
  const existingStreams = await Stream.find({ userid: userObjectId });
  const { resume, agoraUid: requestedUid } = req.body || {};

  if (existingStreams.length > 0) {
    const cutoff = new Date(Date.now() - 60 * 1000);
    const aliveStream = existingStreams.find(
      s => s.lastHeartbeatAt && new Date(s.lastHeartbeatAt) >= cutoff
    );

    if (aliveStream && resume) {
      // Resume existing live session
      const hostBroadcaster = (aliveStream.broadcasters || []).find(
        b => b.role === "host" || b.userid?.toString() === userId.toString()
      );
      const uid = hostBroadcaster?.agoraUid || 0;
      return res.status(200).json({
        success: true,
        resumed: true,
        session: {
          streamId: aliveStream._id.toString(),
          channelName: aliveStream.channelName,
          token: aliveStream.token,
          agoraToken: aliveStream.token,
          uid,
          hostUid: uid,
          appId: getAppId(),
          agoraAppId: getAppId(),
          creatorId: userId.toString(),
          startedAt: aliveStream.createdAt,
        },
      });
    }

    // Clean up any stale or unresumed existing streams
    for (const s of existingStreams) {
      await saveStreamAnalysisRecord(s);
      await Stream.findByIdAndDelete(s._id);
    }
  }

  // Generate channel name and secure publisher token
  const randomSuffix = crypto.randomBytes(8).toString("hex");
  const channelName = `fz_live_${userId.toString().slice(-6)}_${randomSuffix}`;

  // Assign numeric UID for Agora RTC (int between 100000 and 999999)
  const agoraUid = requestedUid && Number.isInteger(Number(requestedUid)) && Number(requestedUid) > 0
    ? Number(requestedUid)
    : (parseInt(userId.toString().slice(-6), 16) % 900000) + 100000;

  const token = generateRtcToken(channelName, agoraUid);

  const stream = await Stream.create({
    userid: userObjectId,
    channelName,
    token,
    lastHeartbeatAt: new Date(),
    isClubStreaming: false,
    clubid: null,
    members: [userObjectId],
    broadcasters: [
      {
        userid: userObjectId,
        agoraUid,
        role: "host",
        earnings: 0,
      },
    ],
    moderators: [userObjectId],
  });

  await User.findByIdAndUpdate(userObjectId, { isLive: true });

  // Broadcast userWentLive to followers via Socket.io
  const livePayload = {
    userid: user._id,
    username: user.username,
    profilePicture: user.profilePicture || "",
    isVerified: Boolean(user.isVerified),
    isLive: true,
    streamid: stream._id.toString(),
    channelName,
  };

  const followers = user.followers || [];
  followers.forEach(followerId => {
    const sockets = global.onlineSockets?.get(followerId.toString());
    if (sockets && sockets.length > 0) {
      sockets.forEach(sock => {
        if (sock) {
          sock.emit("userWentLive", livePayload);
        }
      });
    }
  });

  return res.status(200).json({
    success: true,
    session: {
      streamId: stream._id.toString(),
      channelName: stream.channelName,
      token: stream.token,
      agoraToken: stream.token,
      uid: agoraUid,
      hostUid: agoraUid,
      appId: getAppId(),
      agoraAppId: getAppId(),
      creatorId: userId.toString(),
      startedAt: stream.createdAt,
    },
  });
});

/**
 * @desc Record authoritative HTTP heartbeat for active browser studio broadcast
 * @route POST /creator/live/heartbeat
 * @access Private (Authenticated Creator)
 */
const recordCreatorLiveHeartbeat = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const { streamId } = req.body || {};

  if (!streamId || !mongoose.Types.ObjectId.isValid(streamId)) {
    return res.status(400).json({ success: false, error: "Valid streamId is required" });
  }

  const stream = await Stream.findById(streamId);
  if (!stream) {
    return res.status(404).json({ success: false, error: "Live session not found" });
  }

  // Session ownership check: prevent unauthorized creators from altering heartbeat
  if (stream.userid.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, error: "Unauthorized session ownership" });
  }

  stream.lastHeartbeatAt = new Date();
  await stream.save();

  return res.status(200).json({
    success: true,
    streamId: stream._id.toString(),
    lastHeartbeatAt: stream.lastHeartbeatAt,
  });
});

/**
 * @desc Terminate active browser live session, reconcile metrics, and finalize StreamAnalysis
 * @route POST /creator/live/end
 * @access Private (Authenticated Creator)
 */
const endCreatorLiveSession = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const { streamId } = req.body || {};

  if (!streamId || !mongoose.Types.ObjectId.isValid(streamId)) {
    return res.status(400).json({ success: false, error: "Valid streamId is required" });
  }

  const stream = await Stream.findById(streamId);
  if (!stream) {
    // If stream already ended/cleaned up, look up the completed analysis
    const existingAnalysis = await StreamAnalysis.findOne({ streamid: streamId }).lean();
    if (existingAnalysis) {
      return res.status(200).json({
        success: true,
        alreadyEnded: true,
        summary: {
          streamId: existingAnalysis.streamid.toString(),
          likes: existingAnalysis.likes,
          giftCoins: existingAnalysis.giftCoins,
          diamondsEarned: existingAnalysis.diamondsEarned,
          giftsReceived: existingAnalysis.giftsReceived,
          topGifters: existingAnalysis.topGifters || [],
          endedAt: existingAnalysis.endedAt,
        },
      });
    }
    return res.status(404).json({ success: false, error: "Live stream not found or already ended" });
  }

  // Session ownership check: only creator host can end their own broadcast
  if (stream.userid.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, error: "Unauthorized session ownership" });
  }

  // 1. Notify members via socket streamended
  const members = stream.members || [];
  members.forEach(memberId => {
    const sockets = global.onlineSockets?.get(memberId.toString());
    if (sockets && sockets.length > 0) {
      sockets.forEach(sock => {
        if (sock) {
          sock.emit("streamended", { streamid: stream._id.toString() });
        }
      });
    }
  });

  // 2. Notify followers that user stopped being live
  const user = await User.findById(userId).select("followers");
  const stoppedData = {
    userid: userId,
    isLive: false,
    streamid: "",
  };

  const followers = user?.followers || [];
  followers.forEach(followerId => {
    const sockets = global.onlineSockets?.get(followerId.toString());
    if (sockets && sockets.length > 0) {
      sockets.forEach(sock => {
        if (sock) {
          sock.emit("userStoppedLive", stoppedData);
        }
      });
    }
  });

  // 3. Compute duration and persist final StreamAnalysis
  const startTime = stream.createdAt || (stream._id && typeof stream._id.getTimestamp === "function" ? stream._id.getTimestamp() : new Date());
  const computedDuration = Math.max(1, Math.floor((Date.now() - new Date(startTime).getTime()) / 1000));
  const durationSeconds = Number(req.body.durationSeconds) > 0 ? Number(req.body.durationSeconds) : computedDuration;

  const analysis = await saveStreamAnalysisRecord(stream, durationSeconds);

  // 4. Clean up Stream document and reset user isLive
  await Stream.findByIdAndDelete(stream._id);
  await User.findByIdAndUpdate(userId, { isLive: false });
  await Activity.deleteMany({ otheruserid: userId, streamid: stream._id });

  const totalViewers = req.body.peakViewers || req.body.totalViewers || (Array.isArray(stream.members) ? stream.members.length : 0);
  const diamondsEarned = req.body.totalDiamonds !== undefined ? Number(req.body.totalDiamonds) : (analysis?.diamondsEarned || 0);

  return res.status(200).json({
    success: true,
    summary: {
      streamId: stream._id.toString(),
      durationSeconds,
      likes: analysis?.likes || 0,
      giftCoins: analysis?.giftCoins || 0,
      diamondsEarned,
      giftsReceived: analysis?.giftsReceived || 0,
      totalViewers,
      usdEarned: Number((diamondsEarned * 0.042).toFixed(2)),
      topGifters: analysis?.topGifters || [],
      endedAt: analysis?.endedAt || new Date(),
    },
    streamAnalysis: {
      streamId: stream._id.toString(),
      durationSeconds,
      totalViewers,
      diamondsEarned,
      usdEarned: Number((diamondsEarned * 0.042).toFixed(2)),
      likes: analysis?.likes || 0,
      endedAt: analysis?.endedAt || new Date(),
    },
  });
});

/**
 * @desc Retrieve live broadcast telemetry (real-time viewers, likes, gifts)
 * @route GET /creator/live/session/:streamId
 * @access Private (Authenticated Creator)
 */
const getCreatorLiveSessionDetails = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const { streamId } = req.params;

  if (!streamId || !mongoose.Types.ObjectId.isValid(streamId)) {
    return res.status(400).json({ success: false, error: "Valid streamId is required" });
  }

  const stream = await Stream.findById(streamId).lean();
  if (!stream) {
    return res.status(404).json({ success: false, error: "Active live session not found" });
  }

  if (stream.userid.toString() !== userId.toString()) {
    return res.status(403).json({ success: false, error: "Unauthorized session ownership" });
  }

  const startTime = stream.createdAt || (stream._id && typeof stream._id.getTimestamp === "function" ? stream._id.getTimestamp() : new Date());
  const durationSeconds = Math.max(
    0,
    Math.floor((Date.now() - new Date(startTime).getTime()) / 1000)
  );

  return res.status(200).json({
    success: true,
    session: {
      streamId: stream._id.toString(),
      channelName: stream.channelName,
      viewerCount: Array.isArray(stream.members) ? stream.members.length : 0,
      likes: Number(stream.likes || stream.likeCount || 0),
      giftCoins: Number(stream.giftCoins || 0),
      diamondsEarned: Number(stream.giftCoins || 0) * 0.42,
      lastHeartbeatAt: stream.lastHeartbeatAt,
      durationSeconds,
    },
  });
});

module.exports = {
  getCreatorLiveStatus,
  startCreatorLiveSession,
  recordCreatorLiveHeartbeat,
  endCreatorLiveSession,
  getCreatorLiveSessionDetails,
};
