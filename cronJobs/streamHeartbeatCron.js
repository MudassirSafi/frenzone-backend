const cron = require("node-cron");
const Stream = require("../models/streamModel");
const User = require("../models/userModel");
const Activity = require("../models/activityModel");
const StreamAnalysis = require("../models/streamAnalysisModel");

async function saveCompletedStreamAnalysis(stream) {
  const host = (stream.broadcasters || []).find(
    broadcaster => broadcaster.role === "host" ||
      broadcaster.userid?.toString() === stream.userid?.toString(),
  );
  const giftCoins = Number(stream.giftCoins || host?.earnings || 0);
  const diamondsEarned = giftCoins * 0.42;
  const topGifters = [...(stream.gifters || [])]
    .sort((a, b) => Number(b.coins || 0) - Number(a.coins || 0))
    .slice(0, 3);

  await StreamAnalysis.findOneAndUpdate(
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
      topGifters,
      endedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

async function notifyStreamEnded(streamId, hostId, members, reason = "heartbeatTimeout") {
  if (!global.onlineSockets) return;

  const allToNotify = new Set([...members]);
  if (hostId) allToNotify.add(hostId.toString());

  for (const userId of allToNotify) {
    const sockets = global.onlineSockets.get(userId.toString()) || [];
    sockets.forEach((socket) => {
      try {
        socket.emit("streamended", {
          streamid: streamId,
          reason: reason,
        });
      } catch (err) {
        console.error("[Heartbeat Cron] Emit error:", err);
      }
    });
  }
}

async function cleanupStream(streamDoc, reason = "heartbeatTimeout") {
  try {
    const streamId = streamDoc._id;
    const hostId = streamDoc.userid;
    const members = streamDoc.members || [];

    await notifyStreamEnded(streamId, hostId, members, reason);
    await saveCompletedStreamAnalysis(streamDoc);
    await Stream.findByIdAndDelete(streamId);

    if (hostId) {
      await User.findByIdAndUpdate(hostId, { isLive: false });
      await Activity.deleteMany({
        otheruserid: hostId,
        streamid: streamId,
      });
    }
  } catch (err) {
    console.error("[Heartbeat Cron] cleanupStream error:", err);
  }
}

cron.schedule("*/1 * * * *", async () => {
  try {
    // 1. Handle stale streams (Heatbeat timeout)
    const cutoff = new Date(Date.now() - 60 * 1000);
    const staleStreams = await Stream.find({
      $or: [
        { lastHeartbeatAt: { $exists: false } },
        { lastHeartbeatAt: { $lt: cutoff } },
      ],
    });

    for (const stream of staleStreams) {
      await cleanupStream(stream);
    }

    // 2. Increment duration for active club streams
    const activeClubStreams = await Stream.find({
      isClubStreaming: true,
      lastHeartbeatAt: { $gte: cutoff }
    });

    for (const stream of activeClubStreams) {
      const hostId = stream.userid;
      if (hostId) {
        const user = await User.findById(hostId);
        if (user) {
          const newMinutes = (user.todaysPrivateStreamingMinutes || 0) + 1;

          if (newMinutes >= 120) {
            console.log(`[Heartbeat Cron] User ${hostId} reached 2-hour limit. Terminating stream.`);
            await User.findByIdAndUpdate(hostId, { todaysPrivateStreamingMinutes: 120 });
            await cleanupStream(stream, "durationLimitReached");
          } else {
            await User.findByIdAndUpdate(hostId, { $inc: { todaysPrivateStreamingMinutes: 1 } });
          }
        }
      }
    }
  } catch (err) {
    console.error("[Heartbeat Cron] Error:", err);
  }
});

