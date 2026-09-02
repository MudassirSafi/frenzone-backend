const Stream = require("../models/streamModel");
const StreamAnalysis = require("../models/streamAnalysisModel");
const User = require("../models/userModel");
const Club = require("../models/clubModel");
const Wallet = require("../models/walletModel");
const PKBattle = require("../models/pkBattleModel");
const UserPowerUp = require("../models/userPowerUpModel");
const Activity = require("../models/activityModel");
const crypto = require("crypto");
const mongoose = require("mongoose");
const { generateRtcToken } = require("./agoraController");
const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");
const DEFAULT_LIVE_NOTIFICATION_IMAGE =
  "https://images.pexels.com/photos/164938/pexels-photo-164938.jpeg";
const DEFAULT_LIVE_NOTIFICATION_LINK = "https://example.com/live";

const getLiveNotificationRichContent = (imageUrl) => ({
  imageUrl:
    imageUrl ||
    process.env.LIVE_STREAM_NOTIFICATION_IMAGE_URL ||
    DEFAULT_LIVE_NOTIFICATION_IMAGE,
  linkUrl:
    process.env.LIVE_STREAM_NOTIFICATION_LINK ||
    DEFAULT_LIVE_NOTIFICATION_LINK,
  actionLabel: "Join Now",
});

const saveCompletedStreamAnalysis = async (stream) => {
  if (!stream) return null;
  const host = (stream.broadcasters || []).find(
    broadcaster => broadcaster.role === "host" ||
      broadcaster.userid?.toString() === stream.userid?.toString(),
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
      topGifters,
      endedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
};

const getRecentStreamAnalysis = async (req, res) => {
  try {
    const userid = req.params.userid;
    if (!mongoose.Types.ObjectId.isValid(userid)) {
      return res.status(400).json({ success: false, error: "Invalid user ID" });
    }
    const authenticatedUserId = (req.authUserId || req.userId)?.toString();
    if (authenticatedUserId && authenticatedUserId !== userid) {
      return res.status(403).json({ success: false, error: "Forbidden" });
    }
    const analysis = await StreamAnalysis.findOne({ userid })
      .sort({ endedAt: -1 })
      .lean();
    return res.status(200).json({ success: true, analysis });
  } catch (error) {
    return res.status(500).json({ success: false, error: error.message });
  }
};

const { sendNotification } = require("./notificationController");
const { createActivity } = require("./activityController");
const { getPicUrl } = require("./userController");

const POWER_UPS = ["Boosting gloves", "Magic mist", "Time maker", "Stun hammer"];
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const PHANTOM_COST_COINS = 100000;
const getStreamByUserIDByAdmin = async (req, res) => {
  try {
    const { userid } = req.params;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const stream = await Stream.findOne({ userid });
    if (!stream) {
      throw Error("No Stream Found");
    }
    res.status(200).json({
      stream,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const deleteStreamByAdmin = async (req, res) => {
  console.log(">>> [LOG VERSION 3] deleteStreamByAdmin triggered");
  try {
    const { streamid } = req.params;
    const stream = await Stream.findById(streamid);
    const userid = stream.userid;
    const user = await User.findById(userid);
    const members = stream.members;
    for (const member of members) {
      var sockets = global.onlineSockets.get(member.toString());
      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("streamended", {
              streamid,
            });
          }
        }
      }
    }

    // Notify followers and club members that the user stopped being live
    const stoppedLiveData = {
      userid: user._id,
      isLive: false,
      streamid: ""
    };

    let targets = new Set();
    if (user.followers) user.followers.forEach(f => targets.add(f.toString()));

    if (stream.isClubStreaming && stream.clubid) {
      const club = await Club.findById(stream.clubid);
      if (club && club.members) {
        club.members.forEach(m => targets.add(m.toString()));
      }
    }

    console.log(`Stream ${streamid} deleted by Admin. Notifying ${targets.size} unique targets:`, Array.from(targets));

    targets.forEach(followerid => {
      const followerSockets = global.onlineSockets.get(followerid.toString());
      if (followerSockets && followerSockets.length > 0) {
        console.log(`Sockets found for target ${followerid.toString()} (Count: ${followerSockets.length}). Emitting userStoppedLive...`);
        followerSockets.forEach(socket => {
          if (socket) {
            console.log(`Emitting userStoppedLive to socket ID: ${socket.id}`);
            socket.emit("userStoppedLive", stoppedLiveData);
          }
        });
      } else {
        console.log(`No active socket session for target ${followerid.toString()}`);
      }
    });

    await saveCompletedStreamAnalysis(stream);
    await Stream.findByIdAndDelete(streamid);
    await user.updateOne({
      isLive: false,
    });
    await Activity.deleteMany({
      otheruserid: userid,
      streamid,
    });
    res.status(200).json({
      message: "Stream Deleted by Admin",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const deleteStream = async (req, res) => {
  console.log(">>> [LOG VERSION 3] deleteStream triggered");
  try {
    const streamid = req.body.streamid;
    const stream = await Stream.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    const userid = stream.userid;
    const user = await User.findById(userid);
    const members = stream.members;

    for (const member of members) {
      var sockets = global.onlineSockets.get(member.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("streamended", {
              streamid,
            });
          }
        }
      }
    }

    // Notify followers and club members that the user stopped being live
    const stoppedLiveData = {
      userid: user._id,
      isLive: false,
      streamid: ""
    };

    let targets = new Set();
    if (user.followers) user.followers.forEach(f => targets.add(f.toString()));

    if (stream.isClubStreaming && stream.clubid) {
      const club = await Club.findById(stream.clubid);
      if (club && club.members) {
        club.members.forEach(m => targets.add(m.toString()));
      }
    }

    console.log(`Stream ${streamid} deleted. Notifying ${targets.size} unique targets:`, Array.from(targets));

    targets.forEach(followerid => {
      const followerSockets = global.onlineSockets.get(followerid.toString());
      if (followerSockets && followerSockets.length > 0) {
        console.log(`Sockets found for target ${followerid.toString()} (Count: ${followerSockets.length}). Emitting userStoppedLive...`);
        followerSockets.forEach(socket => {
          if (socket) {
            console.log(`Emitting userStoppedLive to socket ID: ${socket.id}`);
            socket.emit("userStoppedLive", stoppedLiveData);
          }
        });
      } else {
        console.log(`No active socket session for target ${followerid.toString()}`);
      }
    });

    await saveCompletedStreamAnalysis(stream);
    await Stream.findByIdAndDelete(streamid);

    await user.updateOne({
      isLive: false,
    });

    await Activity.deleteMany({
      otheruserid: userid,
      streamid,
    });

    res.status(200).json({
      message: "Stream Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getStreamByUserId = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const stream = await Stream.findOne({ userid });
    if (!stream) {
      throw Error("No Stream Found");
    }
    res.status(200).json({
      stream,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const createStream = async (req, res) => {
  console.log(">>> [LOG VERSION 3] createStream triggered");
  try {

    const {
      userid,
      agoraUid,
      isClubStreaming,
      clubid,
      notificationImageUrl,
    } = req.body;

    const user = await User.findById(userid);
    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found"
      })
    }

    if (isClubStreaming && user.todaysPrivateStreamingMinutes >= 120) {
      return res.status(400).json({
        success: false,
        message: "You have reached your daily limit of 2 hours for private live streaming"
      })
    }

    if (!user.liveAccess && user.followers.length < 1000 && !user.isVerified) {
      return res.status(400).json({
        success: false,
        message: "For going live, should be either verified, having more than 1000 followers and allowed by admin"
      })
    }

    let existingStreams = await Stream.find({ userid });

    if (existingStreams.length > 0) {
      for (const s of existingStreams) {
        await saveCompletedStreamAnalysis(s);
        await Stream.findByIdAndDelete(s._id);
      }
    }

    const channelName = randomName();
    const token = generateRtcToken(channelName);

    stream = await Stream.create({
      userid,
      channelName,
      token,
      lastHeartbeatAt: new Date(),
      isClubStreaming: isClubStreaming || false,
      clubid: clubid || null
    });

    await stream.updateOne({
      $push: { members: userid },
    });

    await stream.updateOne({
      $push: {
        moderators: userid,
        broadcasters: {
          userid,
          agoraUid,
          role: "host"
        },
      },
    });


    await user.updateOne({ isLive: true });

    let targets = [];
    let notificationTitle = "Live Stream";
    let notificationBody = `${user.firstname + " " + user.lastname} is live now`;

    if (isClubStreaming && clubid) {
      const club = await Club.findById(clubid);
      if (club) {
        targets = (club.members || []).filter(m => m.toString() !== userid.toString());
        notificationTitle = "Club live Stream";
        notificationBody = `${user.firstname + " " + user.lastname} is live in club`;
      }
    } else {
      targets = user.followers;
    }

    console.log(`Live Stream started. Notifying ${targets.length} targets:`, targets.map(t => t.toString()));

    const profilePicture = await getPicUrl(user._id);
    const liveData = {
      userid: user._id,
      username: user.username,
      profilePicture,
      isVerified: user.isVerified,
      isLive: true,
      streamid: stream._id
    };
    const richNotification = getLiveNotificationRichContent(
      notificationImageUrl,
    );

    await Promise.all(
      targets.map(async (followerid) => {
        await sendNotification(
          followerid,
          notificationTitle,
          notificationBody,
          "stream",
          stream._id,
          null,
          null,
          null,
          null,
          null,
          "false",
          richNotification
        );
        await createActivity(
          followerid,
          user._id,
          isClubStreaming ? `started club live streaming` : `started live streaming`,
          stream._id,
          undefined,
          isClubStreaming ? channelName : undefined,
          isClubStreaming ? token : undefined
        );

        // Notify follower via socket that user went live
        const followerSockets = global.onlineSockets.get(followerid.toString());
        if (followerSockets && followerSockets.length > 0) {
          console.log(`Sockets found for follower ${followerid.toString()} (Count: ${followerSockets.length}). Emitting userWentLive...`);
          followerSockets.forEach(socket => {
            if (socket) {
              console.log(`Emitting userWentLive to socket ID: ${socket.id}`);
              socket.emit("userWentLive", liveData);
            }
          });
        } else {
          console.log(`No active socket session for follower ${followerid.toString()} (followerSockets exists: ${!!followerSockets}, length: ${followerSockets?.length ?? 0})`);
        }
      })
    );

    res.status(200).json({
      _id: stream._id,
      channelName,
      token,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const createClubStream = async (req, res) => {
  console.log(">>> [LOG VERSION 3] createClubStream triggered");
  try {
    const userid = req.body.userid;
    const clubid = req.body.clubid;
    const user = await User.findById(userid);
    if (!user) {
      res.status(400).json({
        success: false,
        message: "User not found"
      })
    }

    var club = await Club.findById(clubid);
    if (!club) {
      res.status(400).json({
        success: false,
        message: "Club not found"
      })
    }

    if (userid != club.userid) {
      res.status(400).json({
        success: false,
        message: "You are not owner of this club!"
      })
    }

    // if (!user.liveAccess) {
    //   throw Error("User Does Not Have Live Access");
    // }

    let stream = await Stream.find({ clubid });
    if (stream.length != 0) {
      throw Error("Stream Already Exists");
    }

    if (user.todaysPrivateStreamingMinutes >= 120) {
      return res.status(400).json({
        success: false,
        message: "You have reached your daily limit of 2 hours for private live streaming"
      })
    }

    const channelName = randomName();
    const token = generateRtcToken(channelName);

    stream = await Stream.create({
      clubid,
      channelName,
      token,
      userid: club.userid,
      isClubStreaming: true
    });

    await stream.updateOne({
      $push: { members: userid },
    });

    await stream.updateOne({
      $push: { moderators: userid },
    });

    await user.updateOne({
      isLive: true,
    });

    console.log(`Club Live Stream started. Notifying ${club.members.length} members:`, club.members.map(t => t.toString()));

    const profilePicture = await getPicUrl(user._id);
    const liveData = {
      userid: user._id,
      username: user.username,
      profilePicture,
      isVerified: user.isVerified,
      isLive: true,
      streamid: stream._id
    };
    const richNotification = getLiveNotificationRichContent(
      req.body.notificationImageUrl,
    );

    await Promise.all(
      club.members.map(async (followerid) => {
        if (followerid.toString() != userid) {
          await sendNotification(
            followerid,
            "Club live Stream",
            `${user.firstname + " " + user.lastname} is live in club`,
            "stream",
            stream._id,
            null,
            null,
            null,
            null,
            null,
            "false",
            richNotification
          );
          await createActivity(
            followerid,
            user._id,
            `started club live streaming`,
            stream._id,
            undefined,
            channelName,
            token
          );

          // Notify follower via socket that user went live
          const followerSockets = global.onlineSockets.get(followerid.toString());
          if (followerSockets && followerSockets.length > 0) {
            console.log(`Sockets found for club member ${followerid.toString()} (Count: ${followerSockets.length}). Emitting userWentLive...`);
            followerSockets.forEach(socket => {
              if (socket) {
                console.log(`Emitting userWentLive to socket ID: ${socket.id}`);
                socket.emit("userWentLive", liveData);
              }
            });
          } else {
            console.log(`No active socket session for club member ${followerid.toString()}`);
          }
        }
      })
    );

    res.status(200).json({
      _id: stream._id,
      channelName,
      token,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const sendInvite = async (req, res) => {
  try {
    const { userid, streamid, channel, token } = req.body;

    const user = await User.findById(userid);
    const stream = await Stream.findById(streamid);

    if (!user) {
      throw new Error("User Not Found");
    }

    if (!stream) {
      throw new Error("Stream Not Found");
    }
    const streamOwner = await User.findById(stream.userid);
    const existingActivity = await Activity.findOne({
      userid: userid,
      streamid: streamid,
    });

    const streamOwnerName = `${streamOwner.firstname} ${streamOwner.lastname}`;
    await sendNotification(
      userid,
      "Stream Invite",
      `${streamOwnerName} has invited you to join their stream.`,
      {
        action: "joinStream",
        streamid: stream._id,
        channel: stream.channelName,
        token: stream.token,
      }
    );
    await createActivity(
      userid,
      streamOwner._id,
      `Join as Broadcaster`,
      stream._id,
      undefined,
      channel,
      token
    );

    res.status(200).json({ message: "Invite sent successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const sendAudianceInvite = async (req, res) => {
  try {
    const { userid, streamid, senderid } = req.body;

    const user = await User.findById(userid);
    const sender = await User.findById(senderid);
    const stream = await Stream.findById(streamid);

    if (!user) {
      throw new Error("User Not Found");
    }

    if (!sender) {
      throw new Error("Sender Not Found");
    }

    if (!stream) {
      throw new Error("Stream Not Found");
    }
    const existingActivity = await Activity.findOne({
      userid: userid,
      streamid: streamid,
      otheruserid: senderid,
    });

    const senderName = `${sender.firstname} ${sender.lastname}`;
    await sendNotification(
      userid,
      "Stream Invite",
      `${senderName} has invited you to join stream.`,
      {
        action: "joinStream",
        streamid: stream._id,
        channel: stream.channelName,
        token: stream.token,
      }
    );
    await createActivity(
      userid,
      sender._id,
      `Join as Broadcaster`,
      stream._id,
      undefined
    );

    res.status(200).json({ message: "Invite sent successfully" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const getStreamsOfFollowing = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const following = user.following;
    console.log(following);
    const streams = await Stream.find({ userid: { $in: following } });

    res.status(200).json({
      streams,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const joinStream = async (req, res) => {
  try {
    const userid = req.body.userid;
    const streamid = req.body.streamid;

    const user = await User.findById(userid);
    let stream = await Stream.findById(streamid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!stream) {
      throw Error("Stream Not Found");
    }
    var streamOwner = await User.findById(stream.userid);
    if (!streamOwner) {
      throw Error("Stream owner Not Found");
    }
    // if(!streamOwner.presentModerators.includes(userid)){
    //   await streamOwner.updateOne({
    //     $push: { presentModerators: userid }
    //   });
    // }

    if (stream.blocked.includes(userid)) {
      throw Error("User Blocked");
    }

    const token = stream.token;
    if (!stream.members.includes(userid)) {
      stream = await Stream.findByIdAndUpdate(
        streamid,
        { $addToSet: { members: userid } },
        { new: true }
      );
    }

    if (streamOwner.presentModerators.includes(userid)) {
      if (!stream.moderators.includes(userid)) {
        await stream.updateOne({
          $push: { moderators: userid },
        });
      }

      const members = stream.members;

      const newModerator = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = global.onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newModerator", newModerator);
            }
          }
        }
      }
    }

    const isOwnerJoining =
      stream.userid.toString() === userid.toString();

    const requestedPhantomMode =
      req.body.isPhantom === true || req.body.isPhantom === "true";
    const joinAsPhantom = Boolean(user.isPhantom && requestedPhantomMode);

    let joinDisplayName = user.firstname || user.username || "";
    if (joinAsPhantom) {
      if (!user.phantomId) {
        user.phantomId = await generateUniquePhantomId();
        await user.save();
      }
      joinDisplayName = user.phantomId?.toString() || joinDisplayName;
    }

    if (!isOwnerJoining) {
      const members = stream.members;
      var memberCount = stream.members.length - 1;
      for (const member of members) {
        var sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("memberCount", {
                memberCount,
                streamid,
                userid: user._id,
                userId: user._id,
                name: joinDisplayName,
                image: await getPicUrl(user._id),
                isPhantom: joinAsPhantom,
                phantomId: joinAsPhantom ? user.phantomId ?? null : null,
              });
            }
          }
        }
      }
    }

    res.status(200).json({
      _id: stream._id,
      channelName: stream.channelName,
      token,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const joinPKStream = async (req, res) => {
  try {
    const { userid, pkChannelName, streamid } = req.body;
    console.log("User joining PK stream:", streamid);

    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const currentStream = await Stream.findById(streamid);
    if (!currentStream) throw Error("Stream Not Found");

    if (!currentStream.members.includes(userid)) {
      currentStream.members.push(userid);
      await currentStream.save();
    }

    // ✅ Get updated member count for this stream only
    const memberCount = currentStream.members.length;
    console.log("Current stream member count:", memberCount);

    const pkStreams = await Stream.find({ pkChannelName });
    if (!pkStreams || pkStreams.length === 0) throw Error("No PK streams found");
    const allMembers = new Set();
    for (const stream of pkStreams) {
      stream.members.forEach(memberId => {
        allMembers.add(memberId.toString());
      });
    }


    for (const memberId of allMembers) {
      const sockets = global.onlineSockets.get(memberId);
      if (sockets) {
        for (const socket of sockets) {
          socket.emit("pkMemberCount", {
            memberCount,
            streamid,
          });
        }
      }
    }

    // ✅ Respond with stream and member info
    res.status(200).json({
      success: true,
      message: "User joined stream and member count emitted",
      pkChannelName,
      streamid,
      memberCount,  // count of this stream only
    });

  } catch (error) {
    console.error("joinPKStream error:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};



const getClubStreamStatus = async (req, res) => {
  try {
    const { userid, clubid } = req.params;

    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }
    const stream = await Stream.findOne({ clubid });
    var streamid = null;
    var clubLive = false;
    if (stream) {
      clubLive = true;
      streamid = stream._id
    }

    res.status(200).json({
      clubLive,
      streamid
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const leaveStream = async (req, res) => {
  try {
    const userid = req.body.userid;
    const streamid = req.body.streamid;
    const user = await User.findById(userid);
    const stream = await Stream.findById(streamid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (!stream) {
      throw Error("Stream Not Found");
    }

    if (stream.members.includes(userid)) {
      await stream.updateOne({
        $pull: { members: userid },
      });
      stream.members.pull(userid);
      await stream.save();
    }

    const members = stream.members;
    var memberCount = stream.members.length - 1;

    for (const member of members) {
      var sockets = global.onlineSockets.get(member.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("memberCount", {
              memberCount,
            });
          }
        }
      }
    }

    res.status(200).json({
      message: "User Has Left Stream",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};


const leavePKStream = async (req, res) => {
  try {
    const { userid, streamid, pkChannelName } = req.body;

    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const currentStream = await Stream.findById(streamid);
    if (!currentStream) throw Error("Stream Not Found");

    if (currentStream.members.includes(userid)) {
      await Stream.updateOne({ _id: streamid }, { $pull: { members: userid } });
    }

    const pkStreams = await Stream.find({ pkChannelName });
    if (!pkStreams || pkStreams.length === 0) throw Error("No PK streams found");

    const updatedStream = pkStreams.find(
      s => s._id.toString() === streamid.toString()
    );
    if (!updatedStream) throw Error("Updated stream not found");

    const joinedStream =
      pkStreams.find(s => s._id.toString() !== streamid.toString()) || updatedStream;
    const memberCount = updatedStream.members.length;

    const allMembers = new Set();
    for (const stream of pkStreams) {
      for (const memberId of stream.members) {
        allMembers.add(memberId.toString());
      }
    }

    console.log("member count in leave: ", streamid, memberCount);
    for (const memberId of allMembers) {
      const sockets = global.onlineSockets.get(memberId);
      if (sockets) {
        for (const socket of sockets) {
          socket.emit("pkMemberCount", {
            memberCount,
            streamid,
            leave: "left",
          });
        }
      }
    }

    const leaverSockets = global.onlineSockets.get(userid.toString());
    if (leaverSockets) {
      for (const socket of leaverSockets) {
        socket.emit("pkMemberCount", {
          memberCount,
          streamid,
          leave: "left",
        });
      }
    }

    const likeCount = Number(joinedStream.likeCount ?? 0);

    res.status(200).json({
      success: true,
      message: "User has left the PK stream",
      pkChannelName,
      joinedStreamId: joinedStream._id,
      joinedStreamerId: joinedStream.userid,
      likeCount,
    });

  } catch (error) {
    console.error("leavePKStream error:", error);
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};



const getViewers = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await Stream.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    let members = stream.members;

    members = await Promise.all(
      members.map(async (id) => {
        let user = await User.findById(id);
        if (user) {
          const isModerator = stream.moderators.includes(id);
          const isBroadcaster = stream.broadcasters.some(
            (b) => b.userid.toString() === id.toString()
          );

          return {
            _id: user._id,
            username: user.username,
            profilePic: await getPicUrl(id),
            isModerator,
            isBroadcaster,
          };
        }
      })
    );

    res.status(200).json({
      members: members.filter(Boolean),
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getViewersLikesCount = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await Stream.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    let members = stream.members;
    var memberCount = members.length - 1;
    var likeCount = stream.likeCount;
    res.status(200).json({
      memberCount,
      likeCount
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const makeModerator = async (req, res) => {
  try {
    const { userid, streamid } = req.body;
    const stream = await Stream.findById(streamid);
    if (!stream) {
      throw Error("Stream Not Found");
    }
    var streamOwner = await User.findById(stream.userid);
    if (!streamOwner) {
      throw Error("Stream owner Not Found");
    }
    if (!streamOwner.presentModerators.includes(userid)) {
      await streamOwner.updateOne({
        $push: { presentModerators: userid },
      });
    }
    if (stream.members.includes(userid)) {
      if (!stream.moderators.includes(userid)) {
        await stream.updateOne({
          $push: { moderators: userid },
        });
      }
    }

    res.status(200).json({
      message: "Stream Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};


const addCohostsRequest = async (req, res) => {
  try {
    const { streamid, userid, agoraUid } = req.body;

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream Not Found");
console.log("streamId: ", streamid);
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const alreadyRequested = stream.coHostsRequests.some(
      (req) => req.userid.toString() === userid.toString()
    );

    let totalRequests = stream.coHostsRequests.length;

    if (!alreadyRequested) {
      await stream.updateOne({
        $push: {
          coHostsRequests: {
            userid,
            agoraUid,
          },
        },
      });
      totalRequests += 1;

    }

    const newRequest = {
      userid: user._id,
      username: user.username,
      streamid,
      totalRequests
    };

    const targetUserIds = new Set([
      stream.userid.toString(),
      ...stream.moderators.map((id) => id.toString()),
    ]);
    console.log("targetUserIds: ", targetUserIds);
    for (const id of targetUserIds) {
      const sockets = onlineSockets.get(id);
      if (sockets) {
        for (const sock of sockets) {
          sock.emit("cohostRequest", newRequest);
        }
      }
    }

    res.status(200).json({ message: "Cohost request sent" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const removeCohostsRequest = async (req, res) => {
  try {
    const { userid } = req.body;
    const { streamid } = req.params;

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream Not Found");
    const beforeCount = stream.coHostsRequests.length;

    await Stream.updateOne(
      { _id: streamid },
      {
        $pull: {
          coHostsRequests: {
            userid: userid,
          },
        },
      }
    );

    const totalRequests = beforeCount > 0 ? beforeCount - 1 : 0;

    const sockets = onlineSockets.get(userid.toString());
    if (sockets) {
      for (const sock of sockets) {
        sock.emit("cohostRequestDeclined", { userid, streamid, totalRequests });
      }
    }

    const targetUserIds = new Set([
      stream.userid.toString(),
      ...stream.moderators.map((id) => id.toString()),
    ]);

    for (const id of targetUserIds) {
      const sockets = onlineSockets.get(id);
      if (sockets) {
        for (const sock of sockets) {
          sock.emit("cohostRequestDeclined", { userid, streamid, totalRequests });
        }
      }
    }

    res.status(200).json({ message: "Cohost request removed" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getCohostRequests = async (req, res) => {
  try {
    const { streamid } = req.params;

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream not found");
    console.log("streamid ", streamid);

    // ✅ Extract only user IDs
    const cohostUserIds = stream.coHostsRequests.map(req => req.userid);

    // Fetch users
    const users = await User.find({ _id: { $in: cohostUserIds } });

    // Map back with profile and agoraUid
    const cohostRequests = await Promise.all(
      stream.coHostsRequests.map(async (req) => {
        const user = users.find(u => u._id.toString() === req.userid.toString());
        if (!user) return null;
        return {
          userid: user._id,
          username: user.username,
          profileImage: await getPicUrl(user._id),
          agoraUid: req.agoraUid,
        };
      })
    );

    const filtered = cohostRequests.filter(Boolean);

    res.status(200).json({ cohostRequests: filtered });
  } catch (error) {
    console.log("Error is coming ", error);
    res.status(400).json({ error: error.message });
  }
};



const makeBroadcaster = async (req, res) => {
  try {
    const { userid, streamid, agoraUid } = req.body;

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream Not Found");

    const userIdStr = userid.toString();
    const update = {};

    const isMember = stream.members.map(id => id.toString()).includes(userIdStr);
    if (!isMember) throw Error("User is not a member of the stream");

    const broadcasterIndex = stream.broadcasters.findIndex(
      (b) => b.userid?.toString() === userIdStr
    );

    if (broadcasterIndex !== -1) {
      stream.broadcasters[broadcasterIndex].agoraUid = agoraUid;
      await stream.save();
    } else {
      update.$push = {
        broadcasters: {
          userid,
          agoraUid,
          role: "cohost",
        },
      };
    }

    update.$pull = {
      coHostsRequests: { userid },
    };

    const beforeCount = stream.coHostsRequests.length;
    update.$pull = {
      coHostsRequests: { userid },
    };

    if (Object.keys(update).length > 0) {
      await Stream.updateOne({ _id: streamid }, update);
    }
    const totalRequests = beforeCount > 0 ? beforeCount - 1 : 0;
    const sockets = onlineSockets.get(userIdStr);
    if (sockets) {
      for (const sock of sockets) {
        console.log('total requests: ', totalRequests);
        sock.emit("makeBroadCaster", { userid, streamid, totalRequests });
      }
    }
    for (const modId of stream.moderators) {
      const modIdStr = modId.toString();
      const modSockets = onlineSockets.get(modIdStr);
      if (modSockets) {
        for (const sock of modSockets) {
          sock.emit("makeBroadCaster", { userid, streamid, totalRequests });
        }
      }
    }
    res.status(200).json({ message: "Stream Updated" });

  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};



const removeModerator = async (req, res) => {
  try {
    const { userid, streamid } = req.body;
    const stream = await Stream.findById(streamid);
    if (!stream) {
      throw Error("Stream Not Found");
    }
    var streamOwner = await User.findById(stream.userid);
    if (!streamOwner) {
      throw Error("Stream owner Not Found");
    }
    if (streamOwner.presentModerators.includes(userid)) {
      await streamOwner.updateOne({
        $pull: { presentModerators: userid },
      });
    }
    if (stream.members.includes(userid)) {
      await stream.updateOne({
        $pull: { moderators: userid },
      });
    }

    res.status(200).json({
      message: "Stream Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const removeBroadcaster = async (req, res) => {
  try {
    const { userid, streamid } = req.body;

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream Not Found");

    const streamOwner = await User.findById(stream.userid);
    if (!streamOwner) throw Error("Stream owner Not Found");

    if (streamOwner.presentBroadcasters.includes(userid)) {
      await streamOwner.updateOne({
        $pull: { presentBroadcasters: userid },
      });
    }

    const broadcasterToRemove = stream.broadcasters.find(
      (b) => b.userid.toString() === userid
    );

    if (broadcasterToRemove) {
      await Stream.updateOne(
        { _id: streamid },
        { $pull: { broadcasters: { userid } } }
      );
    }

    const allMembers = stream.members || [];

    for (const memberId of allMembers) {
      const sockets = global.onlineSockets.get(memberId.toString());
      if (sockets) {
        for (const socket of sockets) {
          socket.emit("removeBroadcaster", {
            userid,
            agoraUid: broadcasterToRemove?.agoraUid,
            streamid,
          });
        }
      }
    }

    return res.status(200).json({
      message: "Broadcaster removed and socket emitted",
    });
  } catch (error) {
    return res.status(400).json({
      error: error.message,
    });
  }
};

const getModerators = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await Stream.findById(streamid);

    if (!stream) {
      console.log("stream not found,", streamid);
      throw Error("Stream Not Found");
    }

    // Exclude owner from moderators
    let moderators = stream.moderators.filter(
      (id) => id.toString() !== stream.userid.toString()
    );

    // Fetch moderator user data
    moderators = await Promise.all(
      moderators.map(async (id) => {
        const user = await User.findById(id);
        if (user) {
          return {
            _id: user._id,
            username: user.username,
            profilePic: await getPicUrl(user._id),
          };
        }
      })
    );

    moderators = moderators.filter(Boolean);

    res.status(200).json({ moderators });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getBroadcasters = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await Stream.findById(streamid);

    if (!stream) throw Error("Stream Not Found");

    let broadcasters = await Promise.all(
      stream.broadcasters.map(async (b) => {
        const user = await User.findById(b.userid);
        if (!user) return null;

        let thumbnailUrl = null;

        const useProfileThumb = b.isProfileThumbnail === true;

        if (useProfileThumb || !b.thumbnail) {
          thumbnailUrl = await getPicUrl(user._id);
        } else {
          const params = {
            Bucket: bucketName,
            Key: b.thumbnail,
          };
          const command = new GetObjectCommand(params);
          thumbnailUrl = await getSignedUrl(s3, command, {
            expiresIn: 604800,
          });
        }

        return {
          _id: user._id,
          username: `${user.firstname} ${user.lastname}`,
          profilePic: await getPicUrl(user._id),
          agoraUid: b.agoraUid,
          earnings: b.earnings ?? 0,
          role: b.role ?? "cohost",
          isVirtualBackground: b.isVirtualBackground,
          isProfileThumbnail: b.isProfileThumbnail === true,
          thumbnail: thumbnailUrl,
          isLivePaused: b.isLivePaused,
        };
      })
    );

    broadcasters = broadcasters.filter(Boolean);

    res.status(200).json({ broadcasters });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};


const enableThumbnail = async (req, res) => {
  try {
    const { userid, streamid, isVirtualBackground } = req.body;

    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream Not Found");

    const broadcasterIndex = stream.broadcasters.findIndex(
      (b) => b.userid.toString() === userid.toString()
    );
    if (broadcasterIndex === -1) throw Error("User is not a broadcaster");

    let thumbnailUrl = stream.broadcasters[broadcasterIndex].thumbnail || "";

    if (req.file) {
      const imageName = randomName();
      const params = {
        Bucket: bucketName,
        Key: imageName,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      };

      const command = new PutObjectCommand(params);
      await s3.send(command);

      thumbnailUrl = imageName;
      stream.broadcasters[broadcasterIndex].thumbnail = thumbnailUrl;
    }

    stream.broadcasters[broadcasterIndex].isVirtualBackground =
      isVirtualBackground === "true";

    await stream.save();

    let finalThumbnailUrl = "";
    if (stream.broadcasters[broadcasterIndex].isVirtualBackground) {
      if (thumbnailUrl) {
        const getUrlCmd = new GetObjectCommand({
          Bucket: bucketName,
          Key: thumbnailUrl,
        });
        finalThumbnailUrl = await getSignedUrl(s3, getUrlCmd, {
          expiresIn: 604800, // 7 days
        });
      } else {
        finalThumbnailUrl = await getPicUrl(user._id);
      }
    }

    const allSockets = stream.members || [];
    console.log("Members are: ", stream.members);
    for (const memberId of allSockets) {
      const sockets = global.onlineSockets.get(memberId.toString());
      if (sockets) {
        for (const sock of sockets) {
          sock.emit("soloBackgroundUpdated", {
            broadcasterId: userid,
            isVirtualBackground: stream.broadcasters[broadcasterIndex].isVirtualBackground,
            thumbnail: finalThumbnailUrl,
            totalEarnings: stream.broadcasters[broadcasterIndex].earnings || 0,
          });
        }
      }
    }

    return res.status(200).json({
      message: "Virtual background updated successfully",
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }
};

const toggleVirtualBackground = async (req, res) => {
  try {
    const { userid, streamid, isVirtualBackground } = req.body;
    console.log("userid: ", userid);
    console.log("streamid: ", streamid);
    console.log("isVirtualBackground: ", isVirtualBackground);
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found: ", userid);

    const stream = await Stream.findById(streamid);
    if (!stream) throw Error("Stream Not Found");

    const broadcasterIndex = stream.broadcasters.findIndex(
      (b) => b.userid.toString() === userid.toString()
    );
    if (broadcasterIndex === -1) throw Error("User is not a broadcaster");

    const broadcaster = stream.broadcasters[broadcasterIndex];

    const parsedVirtualBackground = isVirtualBackground === true;
    broadcaster.isVirtualBackground = parsedVirtualBackground;

    await stream.save();

    let finalThumbnail = null;

    if (parsedVirtualBackground) {
      const useProfileThumb = broadcaster.isProfileThumbnail === true;

      if (useProfileThumb || !broadcaster.thumbnail) {
        finalThumbnail = await getPicUrl(user._id);
      } else {
        const getUrlCmd = new GetObjectCommand({
          Bucket: bucketName,
          Key: broadcaster.thumbnail,
        });
        finalThumbnail = await getSignedUrl(s3, getUrlCmd, {
          expiresIn: 604800,
        });
      }
    }

    const allSockets = stream.members || [];
    for (const memberId of allSockets) {
      const sockets = global.onlineSockets.get(memberId.toString());
      if (sockets) {
        for (const sock of sockets) {
          sock.emit("soloBackgroundUpdated", {
            broadcasterId: userid,
            isVirtualBackground: parsedVirtualBackground,
            isProfileThumbnail: broadcaster.isProfileThumbnail === true,
            thumbnail: finalThumbnail,
            totalEarnings: broadcaster.earnings || 0,
          });
        }
      }
    }

    return res.status(200).json({
      message: `Virtual background ${parsedVirtualBackground ? 'enabled' : 'disabled'}`,
    });
  } catch (error) {
    console.error(error);
    return res.status(400).json({ error: error.message });
  }
};

const toggleLivePaused = async (req, res) => {
  try {
    const { userid, streamid, isLivePaused } = req.body || {};
    if (!userid || !streamid || typeof isLivePaused !== "boolean") {
      return res
        .status(400)
        .json({ error: "userid, streamid and isLivePaused (boolean) are required" });
    }
    if (!mongoose.Types.ObjectId.isValid(userid) || !mongoose.Types.ObjectId.isValid(streamid)) {
      return res.status(400).json({ error: "Invalid userid or streamid" });
    }

    const stream = await Stream.findById(streamid)
      .select("broadcasters members channelName");
    if (!stream) return res.status(404).json({ error: "Stream Not Found" });

    const idx = stream.broadcasters.findIndex(
      (b) => b.userid?.toString() === userid.toString()
    );
    if (idx === -1) return res.status(400).json({ error: "User is not a broadcaster" });

    stream.broadcasters[idx].isLivePaused = isLivePaused;
    await stream.save();

    const payload = {
      broadcasterId: userid,
      isLivePaused,
    };

    const allMembers = stream.members || [];
    for (const memberId of allMembers) {
      const sockets = global.onlineSockets?.get(memberId.toString());
      if (!sockets) continue;
      for (const sock of sockets) {
        sock.emit("soloLivePausedUpdated", payload);
      }
    }

    return res.status(200).json({
      message: `Live ${isLivePaused ? "paused" : "resumed"}`,
      data: payload,
    });
  } catch (e) {
    console.error("toggleLivePaused error:", e);
    return res.status(400).json({ error: e.message || "Something went wrong" });
  }
};
const updateThumbnailSource = async (req, res) => {
  try {
    const { streamid } = req.params;
    const { userid, isProfileThumbnail, pkChannelName } = req.body;

    const user = await User.findById(userid);
    if (!user) throw new Error("User Not Found");

    const stream = await Stream.findById(streamid);
    if (!stream) throw new Error("Stream Not Found");

    const bIdx = stream.broadcasters.findIndex(
      b => b.userid.toString() === userid.toString()
    );
    if (bIdx === -1) throw new Error("User is not a broadcaster");

    stream.broadcasters[bIdx].isProfileThumbnail = !!isProfileThumbnail;
    await stream.save();

    let finalThumbnail = null;
    const bb = stream.broadcasters[bIdx];
    if (bb.isVirtualBackground) {
      if (bb.thumbnail && !isProfileThumbnail) {
        const cmd = new GetObjectCommand({ Bucket: bucketName, Key: bb.thumbnail });
        finalThumbnail = await getSignedUrl(s3, cmd, { expiresIn: 7 * 24 * 3600 });
      } else {
        finalThumbnail = await getPicUrl(user._id);
      }
    }

    for (const memberId of stream.members || []) {
      const sockets = global.onlineSockets.get(memberId.toString()) || [];
      for (const sock of sockets) {
        sock.emit("soloBackgroundUpdated", {
          broadcasterId: userid,
          isVirtualBackground: bb.isVirtualBackground,
          isProfileThumbnail: bb.isProfileThumbnail,
          thumbnail: finalThumbnail,
          totalEarnings: bb.earnings || 0,
        });
      }
    }

    if (pkChannelName) {
      const pk = await PKBattle.findOne({ pkChannelName: stream.pkChannelName });
      if (pk) {
        const sideKey = pk.streamerA.userId.toString() === userid.toString()
          ? "streamerA"
          : "streamerB";

        pk[sideKey].isProfileThumbnail = bb.isProfileThumbnail;
        pk[sideKey].isVirtualBackground = bb.isVirtualBackground;
        pk[sideKey].thumbnail = bb.thumbnail;
        await pk.save();

        const streams = await Stream.find({ pkChannelName });

        for (const stream of streams) {
          const memberIds = stream.members || [];
          for (const memberId of memberIds) {
            const sockets = global.onlineSockets.get(memberId.toString()) || [];
            for (const sock of sockets) {
              sock.emit("pkBattleThumbnailUpgraded", {
                pkChannelName: pk.pkChannelName,
                userId: userid,
                isVirtualBackground: pk[sideKey].isVirtualBackground,
                isProfileThumbnail: pk[sideKey].isProfileThumbnail,
                thumbnail: finalThumbnail,
              });
            }
          }
        }
      }
    }

    return res.status(200).json({
      message: `Thumbnail source set to ${bb.isProfileThumbnail ? 'profile picture' : 'custom thumbnail'}`,
      thumbnail: finalThumbnail,
    });
  } catch (err) {
    console.error("updateThumbnailSource error:", err);
    return res.status(400).json({ error: err.message });
  }
};


const toggleGuestRequests = async (req, res, next) => {
  try {
    const { streamid, enabled } = req.body

    const stream = await Stream.findById(streamid)
    if (!stream) return res.status(404).json({ error: "Stream not found" })

    stream.requestsGuestsEnabled = !!enabled
    await stream.save()

    for (const memberId of stream.members || []) {
      const sockets = global.onlineSockets.get(memberId.toString()) || [];
      for (const sock of sockets) {
        sock.emit("guestRequestsToggled", {
          streamId: stream._id,
          enabled: stream.requestsGuestsEnabled,
        });
      }
    }
    res.json({
      success: true,
      streamId: stream._id,
      requestsGuestsEnabled: stream.requestsGuestsEnabled,
    })
  } catch (err) {
    next(err)
  }
}


const pinComment = async (req, res) => {
  try {
    const { streamid } = req.params;
    const { commentId, commentData } = req.body;

    const stream = await Stream.findById(streamid);
    if (!stream) {
      return res.status(404).json({ error: "Stream not found" });
    }

    stream.pinComment = {
      commentId,
      commentData,
      timestamp: new Date(),
    };
    await stream.save();

    const allMembers = stream.members || [];
    for (const memberId of allMembers) {
      const sockets = global.onlineSockets.get(memberId.toString());
      if (sockets) {
        for (const socket of sockets) {
          socket.emit("commentPinned", {
            streamid,
            commentId,
            commentData,
          });
        }
      }
    }

    res.status(200).json({ message: "Comment pinned successfully" });
  } catch (err) {
    console.error("Pin comment error:", err);
    res.status(500).json({ error: "Internal server error" });
  }
};



const getBlocked = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await Stream.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    let blocked = stream.blocked;

    blocked = await Promise.all(
      blocked.map(async (id) => {
        let user = await User.findById(id);
        if (user) {
          return {
            _id: user._id,
            username: user.username,
            profilePic: await getPicUrl(id),
          };
        }
      })
    );

    res.status(200).json({
      blocked,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};



const requestChallenge = async (req, res) => {
  try {
    const { pkChannelName, streamerId, userid, streamid } = req.body;

    // Fetch all required documents
    const stream = await Stream.findById(streamid);
    if (stream && stream.isClubStreaming) {
      return res.status(400).json({
        success: false,
        message: "PK Battles are not allowed during club streams."
      });
    }

    const challengedStream = await Stream.findOne({ userid: streamerId });
    if (challengedStream && challengedStream.isClubStreaming) {
      return res.status(400).json({
        success: false,
        message: "The challenged user is currently in a club stream."
      });
    }

    let user = await User.findById(userid);
    const challenged = await User.findById(streamerId);

    // Validate required user
    if (!user || !challenged) {
      console.log("Invalid data provided");
      return res.status(400).json({
        success: false,
        message: "Please enter valid data!"
      });
    }

    user = user.toObject();
    user.profilePicture = await getPicUrl(user._id);
    const requestData = {
      streamerId: streamerId,
      userid: streamerId,
      username: user.username,
      profilePic: user.profilePicture,
      streamid,
      challengedby: userid,
      pkChannelName
    };

    const sockets = global.onlineSockets.get(challenged._id.toString());
    if (sockets) {
      for (const socket of sockets) {
        if (socket) {
          socket.emit("challengeRequested", { requestData });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Challenge requested"
    });

  } catch (error) {
    console.error("Error in requestChallenge:", error);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};

const updateStreamToPk = async (req, res) => {
  try {
    const { streamidRemote, streamidLocal, pkChannelName, challengedBy, isPK } = req.body;

    if (!pkChannelName || !streamidRemote || !streamidLocal) {
      return res.status(400).json({
        success: false,
        message: "pkChannelName, streamidRemote and streamidLocal are required",
      });
    }
    const remoteStream = await Stream.findById(streamidRemote);
    const localStream = await Stream.findById(streamidLocal);
    const userA = await User.findById(localStream.userid);
    const userB = await User.findById(remoteStream.userid);

    const userAImage = await getPicUrl(userA._id);
    const userBImage = await getPicUrl(userB._id);


    const localBroadcaster = localStream.broadcasters
      .find(b => b.userid.toString() === localStream.userid.toString()) || {};
    const remoteBroadcaster = remoteStream.broadcasters
      .find(b => b.userid.toString() === remoteStream.userid.toString()) || {};

    const pkBattle = new PKBattle({
      pkChannelName,
      streamerA: {
        userId: localStream.userid,
        streamId: localStream._id,
        username: userA?.username || "Streamer A",
        profilePic: userAImage,
        thumbnail: localBroadcaster.thumbnail,
        isVirtualBackground: localBroadcaster.isVirtualBackground,
        isProfileThumbnail: localBroadcaster.isProfileThumbnail,
      },
      streamerB: {
        userId: remoteStream.userid,
        streamId: remoteStream._id,
        username: userB?.username || "Streamer B",
        profilePic: userBImage,
        thumbnail: remoteBroadcaster.thumbnail,
        isVirtualBackground: remoteBroadcaster.isVirtualBackground,
        isProfileThumbnail: remoteBroadcaster.isProfileThumbnail,
      }
    });

    await pkBattle.save();


    if (!remoteStream || !localStream) {
      return res.status(404).json({
        success: false,
        message: "One or both streams not found",
      });
    }

    remoteStream.isPK = isPK;
    remoteStream.pkChannelName = pkChannelName;
    localStream.isPK = isPK;
    localStream.pkChannelName = pkChannelName;

    await remoteStream.save();
    await localStream.save();

    const notifyMembers = (stream, type) => {
      const members = stream.members || [];
      for (const member of members) {
        if (member.toString() === userA._id.toString()) continue;

        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            socket.emit("challengeAccepted", {
              pkChannelName,
              remoteUserId: challengedBy,
              streamid: stream._id,
              type,
            });
          }
        }
      }
    };

    notifyMembers(localStream, "local");
    notifyMembers(remoteStream, "remote");

    return res.status(200).json({
      success: true,
      message: "Challenge accepted, streams updated",
      stream: remoteStream,
    });

  } catch (error) {
    console.error("Error in updateStreamToPk:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getStreamById = async (req, res) => {
  try {
    const { streamid } = req.params;

    const stream = await Stream.findById(streamid);
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }
    const votingEnabled = !!stream.voting?.enabled;
    let votingRemaining = null;
    if (stream.voting?.enabled) {
      const nowMs = Date.now();
      const endMs = new Date(stream.voting.endTime).getTime();
      votingRemaining = Math.max(0, Math.ceil((endMs - nowMs) / 1000));
    }

    return res.status(200).json({
      success: true,
      stream: {
        _id: stream._id,
        userid: stream.userid,
        channelName: stream.channelName,
        token: stream.token,
        isPK: stream.isPK,
        pkChannelName: stream.pkChannelName,
        isCommentsMuted: stream.isCommentsMuted,
        blocked: stream.blocked,
        broadcasters: stream.broadcasters,
        moderators: stream.moderators,
        requestsGuestsEnabled: stream.requestsGuestsEnabled,
        votingRemaining: votingRemaining,
        votingEnabled,
      },
    });
  } catch (error) {
    console.error("Error in getStreamById:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const toggleCommentsVisibility = async (req, res) => {
  try {
    const { streamId, isCommentsMuted } = req.body;
    console.log("Comments are:  ", isCommentsMuted);
    if (!streamId || typeof isCommentsMuted !== 'boolean') {
      return res.status(400).json({
        success: false,
        message: "streamId and isCommentsMuted (boolean) are required",
      });
    }

    const stream = await Stream.findById(streamId);

    const members = stream.members || [];
    for (const member of members) {
      const sockets = global.onlineSockets.get(member.toString());
      if (sockets) {
        for (const socket of sockets) {
          socket.emit("muteCommentsInPKChannel", { isCommentsMuted });
        }
      }
    }
    stream.isCommentsMuted = isCommentsMuted;
    await stream.save();
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }

    stream.isCommentsMuted = isCommentsMuted;
    await stream.save();

    return res.status(200).json({
      success: true,
      message: "isCommentsMuted updated successfully",
      stream,
    });

  } catch (error) {
    console.error("Error in updatePKDoubleOpen:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


const updatePKToStream = async (req, res) => {
  try {
    const { pkChannelName, userid } = req.body;

    if (!pkChannelName) {
      return res.status(400).json({
        success: false,
        message: "pkChannelName is required",
      });
    }

    const result = await Stream.updateMany(
      { pkChannelName: pkChannelName },
      { $set: { isPK: false, pkChannelName: "" } }
    );
    console.log('No streams found for that pkChannelName', pkChannelName);

    if (result.matchedCount === 0) {
      return res.status(404).json({
        success: false,
        message: "No streams found for that pkChannelName",
      });
    }

    const clearedStreams = await Stream.find({ pkChannelName: "" });
    for (const stream of clearedStreams) {
      const userId = stream.userid.toString();
      const sockets = global.onlineSockets.get(userId) || [];
      for (const socket of sockets) {
        socket.emit("challengedEnded", {
          pkChannelName,
          type: "cleared",
        });
      }
    }
    await PKBattle.findOneAndDelete({ pkChannelName });

    return res.status(200).json({
      success: true,
      message: `Cleared PK from ${result.modifiedCount} stream(s)`,
    });

  } catch (error) {
    console.error("Error in clearPKFromStreams:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getPkBattleStatus = async (req, res) => {
  try {
    const { pkChannelName } = req.params;

    if (!pkChannelName) {
      return res.status(400).json({
        success: false,
        message: "pkChannelName is required",
      });
    }

    const battle = await PKBattle.findOne({ pkChannelName });

    if (!battle) {
      return res.status(404).json({
        success: false,
        message: "PK Battle not found",
      });
    }

    return res.status(200).json({
      success: true,
      status: battle.status,
      startTime: battle.startTime,
      endTime: battle.endTime,
      rosesTarget: battle.rosesTarget
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const startPkBattle = async (req, res) => {
  try {

    const { pkChannelName } = req.body;
    if (!pkChannelName) {
      return res.status(400).json({
        success: false,
        message: "pkChannelName is required",
      });
    }

    const battle = await PKBattle.findOne({ pkChannelName });

    if (!battle) {
      return res.status(404).json({
        success: false,
        message: "PK Battle not found",
      });
    }
    battle.streamerA.giftCount = 0;
    battle.streamerB.giftCount = 0;
    battle.streamerA.rosesCount = 0;
    battle.streamerB.rosesCount = 0;
    battle.streamerA.topGifters = [];
    battle.streamerB.topGifters = [];
    battle.streamerA.isDoubleOpen = false;
    battle.streamerB.isDoubleOpen = false;
    const choices = [3, 4, 5, 6, 8, 10, 20, 40];
    const rosesTarget = choices[Math.floor(Math.random() * choices.length)];
    battle.rosesTarget = rosesTarget;

    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

    battle.status = 'ongoing';
    battle.startTime = now;
    battle.endTime = fiveMinutesLater;
    await battle.save();
    const streams = await Stream.find({ pkChannelName });

    for (const stream of streams) {
      const memberIds = stream.members || [];
      for (const memberId of memberIds) {
        const sockets = global.onlineSockets.get(memberId.toString()) || [];
        for (const socket of sockets) {
          socket.emit("pkBattleStarted", {
            pkChannelName,
            startTime: now,
            endTime: fiveMinutesLater,
            rosesTarget
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "PK Battle started",
      data: {
        startTime: now,
        endTime: fiveMinutesLater,
        status: "ongoing"
      }
    });

  } catch (error) {
    console.error("Error in startPkBattle:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const updatePKDoubleOpen = async (req, res) => {
  try {
    const { pkChannelName, userId, isDoubleOpen, streamId } = req.body;

    if (!pkChannelName || !userId || isDoubleOpen === undefined) {
      return res.status(400).json({
        success: false,
        message: "Missing required fields"
      });
    }

    const battle = await PKBattle.findOne({ pkChannelName });
    if (!battle) {
      return res.status(404).json({
        success: false,
        message: "PK Battle not found"
      });
    }

    let updatedStreamer = null;

    if (battle.streamerA.userId.toString() === userId) {
      battle.streamerA.isDoubleOpen = isDoubleOpen;
      updatedStreamer = battle.streamerA;
    } else if (battle.streamerB.userId.toString() === userId) {
      battle.streamerB.isDoubleOpen = isDoubleOpen;
      updatedStreamer = battle.streamerB;
    } else {
      return res.status(403).json({
        success: false,
        message: "User is not part of this PK Battle"
      });
    }

    await battle.save();

    const stream = await Stream.findById(streamId);
    if (stream) {
      const memberIds = stream.members || [];
      for (const memberId of memberIds) {
        const sockets = global.onlineSockets.get(memberId.toString()) || [];
        for (const socket of sockets) {
          socket.emit("doubleOpened", {
            pkChannelName,
            streamerId: userId,
            streamId,
            isDoubleOpen,
          });
        }
      }
    }

    return res.status(200).json({
      success: true,
      message: "Double open flag updated successfully",
      data: {
        role: updatedStreamer === battle.streamerA ? "streamerA" : "streamerB",
        username: updatedStreamer.username,
        isDoubleOpen: updatedStreamer.isDoubleOpen
      }
    });

  } catch (err) {
    console.error("Error in updatePKDoubleOpen:", err);
    return res.status(500).json({
      success: false,
      message: "Server error"
    });
  }
};


const likePKStream = async (req, res) => {
  try {
    const { pkChannelName, userId, streamId } = req.body;

    if (!streamId || !userId || !pkChannelName) {
      return res.status(400).json({
        success: false,
        message: "streamId, hostId, and pkChannelName are required",
      });
    }

    const stream = await Stream.findById(streamId);
    if (!stream) {
      return res.status(404).json({
        success: false,
        message: "Stream not found",
      });
    }
    console.log("Hi there ss: ", stream.likeCount);
    stream.likes = (stream.likes || 0) + 1;
    await stream.save();

    const now = new Date();
    const fiveMinutesLater = new Date(now.getTime() + 5 * 60 * 1000);

    const memberIds = stream.members || [];

    for (const memberId of memberIds) {
      const sockets = global.onlineSockets.get(memberId.toString()) || [];

      for (const socket of sockets) {
        socket.emit("pkStreamLiked", {
          pkChannelName,
          likedBy: hostId,
          streamId,
          totalLikes: stream.likes,
          startTime: now,
          endTime: fiveMinutesLater,
        });
      }
    }

    return res.status(200).json({
      success: true,
      message: "Like registered and sockets notified",
      likes: stream.likes,
    });

  } catch (err) {
    console.error("Error in likePKStream:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};


const updatePKVirtualBackground = async (req, res) => {
  const { pkChannelName, userId, isVirtualBackground } = req.body;

  if (!pkChannelName || !userId || typeof isVirtualBackground !== "boolean") {
    return res.status(400).json({
      success: false,
      message: "pkChannelName, userId, and isVirtualBackground (boolean) are required",
    });
  }

  try {
    const battle = await PKBattle.findOne({ pkChannelName });
    if (!battle) {
      return res.status(404).json({ success: false, message: "PK Battle not found" });
    }

    let didUpdate = false;

    if (battle.streamerA.userId.toString() === userId) {
      battle.streamerA.isVirtualBackground = isVirtualBackground;
      didUpdate = true;
    } else if (battle.streamerB.userId.toString() === userId) {
      battle.streamerB.isVirtualBackground = isVirtualBackground;
      didUpdate = true;
    }

    if (!didUpdate) {
      return res.status(400).json({
        success: false,
        message: "userId does not match streamerA.userId or streamerB.userId",
      });
    }
    await battle.save();
    global.io.to(pkChannelName).emit("virtualBackgroundUpdated", {
      userId,
      isVirtualBackground,
    });

    return res.status(200).json({
      success: true,
      data: {
        userId: userId,
        isVirtualBackground: isVirtualBackground,
      }
    });
  } catch (err) {
    console.error("Error in updatePKVirtualBackground:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
      error: err.message,
    });
  }
};


const endBattleAndDeclareWinner = async (req, res) => {
  try {
    const { pkChannelName } = req.body;
    if (!pkChannelName) {
      return res.status(400).json({ success: false, message: "pkChannelName is required" });
    }

    const battle = await PKBattle.findOne({ pkChannelName });
    if (!battle) {
      return res.status(404).json({ success: false, message: "PK Battle not found" });
    }


    const giftA = battle.streamerA.giftCount || 0;
    const giftB = battle.streamerB.giftCount || 0;

    let winner = null;
    let winnerName = null;
    let winnerUid = null;
    let winnerTopGifters = [];
    let winnerHostId = null;

    if (giftA > giftB) {
      winner = battle.streamerA.userId;
      winnerName = battle.streamerA.username;
      winnerUid = battle.streamerA.uniqueId;
      winnerTopGifters = battle.streamerA.topGifters || [];
      winnerHostId = battle.streamerA.userId;
    } else if (giftB > giftA) {
      winner = battle.streamerB.userId;
      winnerName = battle.streamerB.username;
      winnerUid = battle.streamerB.uniqueId;
      winnerTopGifters = battle.streamerB.topGifters || [];
      winnerHostId = battle.streamerB.userId;
    }

    battle.status = 'completed';
    battle.endTime = new Date();
    if (winner) {
      battle.winner = winner;
      battle.winnerHistory.push({
        userId: winner,
        username: winnerName,
        uniqueId: winnerUid,
        wonAt: new Date()
      });
    }

    await battle.save();

    const mvpUsers = winnerTopGifters.slice(0, 3);
    const expiresAt = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000);

    const secondaryPowerUps = POWER_UPS.slice(1);

    for (let i = 0; i < mvpUsers.length; i++) {
      const mvp = mvpUsers[i];
      let assignedPowerUp;

      if (i === 0) {
        assignedPowerUp = "Boosting gloves";
      } else {
        const randomIndex = Math.floor(Math.random() * secondaryPowerUps.length);
        assignedPowerUp = secondaryPowerUps.splice(randomIndex, 1)[0];
      }

      await UserPowerUp.create({
        userId: mvp.userId,
        hostId: winnerHostId,
        powerUp: assignedPowerUp,
        expiresAt
      });
      const sockets = global.onlineSockets.get(mvp.userId.toString()) || [];
      for (const socket of sockets) {
        socket.emit("powerUpAssigned", {
          powerUp: assignedPowerUp,
          hostId: winnerHostId,
          expiresAt,
          message: `You received a "${assignedPowerUp}" PowerUp for being an MVP in ${winnerName}'s PK battle!`
        });
      }
    }

    const streams = await Stream.find({ pkChannelName });

    for (const stream of streams) {
      const memberIds = stream.members || [];
      for (const memberId of memberIds) {
        const sockets = global.onlineSockets.get(memberId.toString()) || [];
        for (const socket of sockets) {
          socket.emit("pkBattleEnded", {
            pkChannelName,
            winnerName,
            winnerUid,
            winnerHostId,
            giftA,
            giftB,
            winnerHistory: battle.winnerHistory
          });
        }
      }
    }


    return res.status(200).json({
      success: true,
      message: "PK Battle ended",
      data: {
        pkChannelName,
        winnerName,
        winnerUid,
        giftA,
        giftB,
        status: "completed",
        winnerHistory: battle.winnerHistory
      }
    });

  } catch (error) {
    console.error("Error in endBattleAndDeclareWinner:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getUserPowerUps = async (req, res) => {
  try {

    const { userId, hostId } = req.query;
    if (!userId || !hostId) {
      return res.status(400).json({ success: false, message: "userId and hostId are required" });
    }

    const now = new Date();

    const powerUps = await UserPowerUp.find({
      userId,
      hostId,
      status: 'active',
      expiresAt: { $gt: now },
    });

    return res.status(200).json({ success: true, data: powerUps });
  } catch (error) {
    console.error("Error fetching powerUps:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const useAndDeletePowerUp = async (req, res) => {
  try {
    const { userId, hostId, powerUp, pkChannelName, streamId } = req.body;

    if (!userId || !hostId || !powerUp) {
      return res.status(400).json({ success: false, message: "Missing fields" });
    }

    const result = await UserPowerUp.findOneAndDelete(
      {
        userId,
        hostId,
        powerUp,
        status: 'active'
      },
      null,
      { sort: { expiresAt: 1 } }
    );


    if (powerUp === "Boosting gloves") {
      const streams = await Stream.find({ pkChannelName });

      for (const stream of streams) {
        const memberIds = stream.members || [];

        for (const memberId of memberIds) {
          const sockets = global.onlineSockets.get(memberId.toString()) || [];

          for (const socket of sockets) {
            socket.emit("glovesPowerUpUsed", {
              pkChannelName,
              triggeredBy: userId,
              powerUp: "Boosting gloves",
              startTime: new Date(),
            });
          }
        }
      }
    }

    if (powerUp === "Magic mist") {
      const streams = await Stream.find({ pkChannelName });

      const myStream = streams.find(stream => stream._id.toString() === streamId);
      if (!myStream) {
        return res.status(404).json({ success: false, message: "Sender stream not found" });
      }
      const hostUserId = myStream.userid?.toString();


      for (const stream of streams) {
        const memberIds = stream.members || [];
        for (const memberId of memberIds) {
          const sockets = global.onlineSockets.get(memberId.toString()) || [];
          for (const socket of sockets) {
            socket.emit("magicMistReceived", {
              pkChannelName,
              triggeredBy: userId,
              hostUserId,
              hostStreamId: myStream._id.toString(),
              powerUp: "Magic mist",
              startTime: new Date(),
            });
          }
        }
      }
    }

    if (powerUp === "Time maker") {
      const battle = await PKBattle.findOne({ pkChannelName });
      if (!battle || battle.status !== 'ongoing') {
        return res.status(400).json({ success: false, message: "Battle not ongoing" });
      }

      const newEndTime = new Date(new Date(battle.endTime).getTime() + 10_000);
      battle.endTime = newEndTime;
      await battle.save();

      const streams = await Stream.find({ pkChannelName });
      for (const stream of streams) {
        const memberIds = stream.members || [];
        for (const memberId of memberIds) {
          const sockets = global.onlineSockets.get(memberId.toString()) || [];
          for (const socket of sockets) {
            socket.emit("timeMakerUsed", {
              pkChannelName,
              newEndTime: newEndTime.toISOString(),
              addedBy: userId,
            });
          }
        }
      }
    }


    return res.status(200).json({ success: true, message: "PowerUp used" });
  } catch (err) {
    console.error("Error using powerUp:", err);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

async function resolveThumbnail(participant) {
  if (participant.isVirtualBackground) {
    if (participant.thumbnail) {
      const cmd = new GetObjectCommand({
        Bucket: bucketName,
        Key: participant.thumbnail,
      });
      return await getSignedUrl(s3, cmd, { expiresIn: 7 * 24 * 3600 });
    } else {
      return await getPicUrl(participant.userId);
    }
  }

  if (participant.isProfileThumbnail) {
    return await getPicUrl(participant.userId);
  }
  if (participant.thumbnail) {
    const cmd = new GetObjectCommand({
      Bucket: bucketName,
      Key: participant.thumbnail,
    });
    return await getSignedUrl(s3, cmd, { expiresIn: 7 * 24 * 3600 });
  }

  return await getPicUrl(participant.userId);
}

const getPkBattleUsersInfo = async (req, res) => {
  try {
    const { pkChannelName } = req.params;

    if (!pkChannelName) {
      return res.status(400).json({
        success: false,
        message: "pkChannelName is required",
      });
    }

    const battle = await PKBattle.findOne({ pkChannelName });

    if (!battle) {
      return res.status(404).json({
        success: false,
        message: "PK Battle not found",
      });
    }
    const thumbnailA = await resolveThumbnail(battle.streamerA);
    const thumbnailB = await resolveThumbnail(battle.streamerB);
    return res.status(200).json({
      success: true,
      streamers: [
        {
          userId: battle.streamerA.userId,
          username: battle.streamerA.username,
          profilePic: battle.streamerA.profilePic,
          uniqueId: battle.streamerA.uniqueId,
          isVirtualBackground: battle.streamerA.isVirtualBackground,
          thumbnailUrl: thumbnailA,
          isProfileThumbnail: battle.streamerA.isProfileThumbnail,
          streamId: battle.streamerA.streamId,
          isDoubleOpen: battle.streamerA.isDoubleOpen,
          rosesCount: battle.streamerA.rosesCount,
          isLivePaused: battle.streamerA.isLivePaused
        },
        {
          userId: battle.streamerB.userId,
          username: battle.streamerB.username,
          profilePic: battle.streamerB.profilePic,
          uniqueId: battle.streamerB.uniqueId,
          isVirtualBackground: battle.streamerB.isVirtualBackground,
          thumbnailUrl: thumbnailB,
          isProfileThumbnail: battle.streamerA.isProfileThumbnail,
          streamId: battle.streamerB.streamId,
          isDoubleOpen: battle.streamerB.isDoubleOpen,
          rosesCount: battle.streamerB.rosesCount,
          isLivePaused: battle.streamerB.isLivePaused
        },
      ]
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};

const getPkBattleUserByUid = async (req, res) => {
  try {
    const { pkChannelName, uniqueId } = req.body;

    if (!pkChannelName || uniqueId === undefined) {
      return res.status(400).json({
        success: false,
        message: "pkChannelName and uniqueId are required",
      });
    }

    const battle = await PKBattle.findOne({ pkChannelName });

    if (!battle) {
      return res.status(404).json({
        success: false,
        message: "PK Battle not found",
      });
    }

    let matchedStreamer = null;
    let role = null;

    if (battle.streamerA.uniqueId === uniqueId) {
      matchedStreamer = battle.streamerA;
      role = "A";
    } else if (battle.streamerB.uniqueId === uniqueId) {
      matchedStreamer = battle.streamerB;
      role = "B";
    }

    if (!matchedStreamer) {
      return res.status(404).json({
        success: false,
        message: "Unique ID does not match any streamer in PK battle"
      });
    }

    return res.status(200).json({
      success: true,
      data: {
        userId: matchedStreamer.userId,
        username: matchedStreamer.username,
        profilePic: matchedStreamer.profilePic,
        role: role
      }
    });

  } catch (error) {
    console.error("Error in getPkBattleUserByUid:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};

const updatePKUniqueId = async (req, res) => {
  try {
    console.log("updatePKUniqueId req.body", req.body);
    const { pkChannelName, uniqueId, userid } = req.body;

    if (!pkChannelName || uniqueId === undefined || !userid) {
      console.log("pkChannelName, uniqueId, and userid are required");

      return res.status(400).json({
        success: false,
        message: "pkChannelName, uniqueId, and userid are required"
      });
    }

    const pkBattle = await PKBattle.findOne({ pkChannelName });
    if (!pkBattle) {
      console.log("PK Battle not found");
      return res.status(404).json({ success: false, message: "PK Battle not found" });
    }

    let matchedStreamer = null;
    let role = null;

    if (pkBattle.streamerA.userId.toString() === userid.toString()) {
      pkBattle.streamerA.uniqueId = uniqueId;
      matchedStreamer = pkBattle.streamerA;
      role = "A";
    } else if (pkBattle.streamerB.userId.toString() === userid.toString()) {
      pkBattle.streamerB.uniqueId = uniqueId;
      matchedStreamer = pkBattle.streamerB;
      role = "B";
    } else {
      console.log("User ID does not match any streamer in this PK battle");
      return res.status(404).json({
        success: false,
        message: "User ID does not match any streamer in this PK battle"
      });
    }

    await pkBattle.save();
    console.log("Unique ID updated for PK Battle streamer");
    const user = await User.findById(userid);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    return res.status(200).json({
      success: true,
      message: "Unique ID updated for PK Battle streamer",
      data: {
        userId: user._id,
        username: user.username,
        profilePic: matchedStreamer.profilePic,
        streamId: matchedStreamer.streamId,
        role: role
      }
    });

  } catch (error) {
    console.error("Error in updatePKUniqueId:", error);
    return res.status(500).json({ success: false, message: "Server error" });
  }
};


const generatePKBattleToken = async (req, res) => {
  try {
    const userId = req.body.userid;
    const { pkChannelName } = req.body;
    console.log(`Generating token for user ${userId} for channel ${pkChannelName}`);

    if (!pkChannelName) {
      throw new Error("pkChannelName is required");
    }

    console.log(`Generating token for user ${userId} for channel ${pkChannelName}`);

    const token = generateRtcToken(pkChannelName);

    return res.status(200).json({
      success: true,
      token,
      channelName: pkChannelName,
    });

  } catch (error) {
    return res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};


const challengeStreamer = async (req, res) => {
  const { challangedid, userid, streamid } = req.body;
  const user = await User.findById(userid);
  const challenged = await User.findById(challangedid);
  const stream = await Stream.findById(streamid);
  if (!user || challenged || stream) {
    res.status(400).json({
      success: false,
      message: "Please enter valid data!"
    })
    return;
  }

  if (!stream.broadcasters.includes(userid)) {
    res.status(400).json({
      success: false,
      message: "Only broadcaster can challenge the broadcaster"
    })
    return;
  }

  if (!stream.broadcasters.includes(challangedid)) {
    res.status(400).json({
      success: false,
      message: "The person you want to challenge is not a broadcaster"
    })
    return;
  }

  var challengers = [userid, challangedid]
  await Promise.all(
    challengers.map(async challenger => {
      await stream.updateOne({
        $push: {
          challengers: {
            challengerid: challenger,
            giftsCollected: 0
          }
        }
      })
    })
  )

  var streamData = await Stream.findById(streamid);
  await Promise.all(
    challengers.map(async challenger => {
      var sockets = global.onlineSockets.get(challenger);
      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("challengeStarted", {
              challengers: streamData.challengers
            });
          }
        }
      }
    })
  )

  res.status(200).json({
    success: true,
    message: "challege started"
  })
}

const getChallengersScore = async (req, res) => {
  const { streamid } = req.params;
  const stream = await Stream.findById(streamid);
  if (stream) {
    res.status(400).json({
      success: false,
      message: "Please enter valid data!"
    })
  }

  res.status(200).json({ challengers: stream.challengers })
}

const getLiveUsers = async (req, res) => {
  try {
    const liveUsers = await User.find({ isLive: true });

    const usersWithStreamInfo = await Promise.all(
      liveUsers.map(async (userDoc) => {
        const user = userDoc.toObject();
        user.profilePicture = await getPicUrl(user._id);
        const stream = await Stream.findOne({ userid: user._id });
        user.channelName = stream?.channelName || "";
        user.token = stream?.token || "";
        user.streamid = stream?._id || null;
        user.isPK = stream?.isPK || false;
        user.pkChannelName = stream?.pkChannelName || "";
        user.isCommentsMuted = stream?.isCommentsMuted || false;
        user.blocked = stream?.blocked || [];
        user.isClubStreaming = stream?.isClubStreaming || false;

        return user;
      })
    );

    return res.status(200).json(usersWithStreamInfo);
  } catch (err) {
    console.error("Error in getLiveUsers:", err);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const getServerTime = async (req, res) => {
  try {
    const currentTime = new Date().toISOString();

    return res.status(200).json({
      success: true,
      serverTime: currentTime,
    });
  } catch (error) {
    console.error("Error in getServerTime:", error);
    return res.status(500).json({
      success: false,
      message: "Server error",
    });
  }
};
const getFollowingStreams = async (req, res) => {
  try {
    const { followingUserIds = [], sortBy = "likeCount", sortDir = "desc" } = req.body || {};
    const page = Math.max(1, Number(req.body?.page) || 1);
    const limit = Math.min(100, Number(req.body?.limit) || 20);
    const skip = (page - 1) * limit;
    if (!Array.isArray(followingUserIds) || followingUserIds.length === 0) {
      return res.json({ page, limit, total: 0, items: [] });
    }
    const ids = followingUserIds.filter(Boolean).map((id) => new mongoose.Types.ObjectId(id));
    const sort = {};
    const dir = String(sortDir).toLowerCase() === "asc" ? 1 : -1;
    const sortable = new Set(["likeCount", "_id"]);
    sort[sortable.has(sortBy) ? sortBy : "likeCount"] = dir;
    sort._id = -1;
    const matchStage = { $match: { userid: { $in: ids }, isClubStreaming: { $ne: true } } };
    const [items, total] = await Promise.all([
      Stream.aggregate([
        matchStage,
        { $sort: sort },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userid",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            channelName: 1,
            likeCount: 1,
            token: 1,
            userid: 1,
            isClubStreaming: 1,
            user: {
              _id: "$user._id",
              username: "$user.username",
              profilePicture: "$user.profilePicture",
            },
          },
        },
      ]),
      Stream.countDocuments({ userid: { $in: ids } }),
    ]);
    const signedItems = await Promise.all(
      items.map(async (it) => {
        if (it.user) it.user = await signUserProfile(it.user);
        return it;
      })
    );
    return res.json({ page, limit, total, items: signedItems });
  } catch (e) {
    return res.status(500).json({ error: e.message });
  }
};

const getTrendingStreams = async (req, res) => {
  try {
    const minLikes = Number(req.query.minLikes) || 10000;
    const page = Math.max(1, Number(req.query.page) || 1);
    const limit = Math.min(100, Number(req.query.limit) || 20);
    const skip = (page - 1) * limit;
    const [items, countResult] = await Promise.all([
      Stream.aggregate([
        { $match: { likeCount: { $gte: minLikes }, isClubStreaming: { $ne: true } } },
        { $sort: { likeCount: -1, _id: -1 } },
        { $skip: skip },
        { $limit: limit },
        {
          $lookup: {
            from: "users",
            localField: "userid",
            foreignField: "_id",
            as: "user",
          },
        },
        { $unwind: { path: "$user", preserveNullAndEmptyArrays: true } },
        {
          $project: {
            channelName: 1,
            likeCount: 1,
            token: 1,
            isClubStreaming: 1,
            user: {
              _id: "$user._id",
              username: "$user.username",
              profilePicture: "$user.profilePicture",
            },
          },
        },
      ]),
      Stream.countDocuments({ likeCount: { $gte: minLikes } }),
    ]);
    const signedItems = await Promise.all(
      items.map(async (it) => {
        if (it.user) it.user = await signUserProfile(it.user);
        return it;
      })
    );
    res.json({ page, limit, total: countResult, items: signedItems });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
};

const signUserProfile = async (user) => {
  if (!user) return null;
  const u = user.toObject ? user.toObject() : user;
  if (u.profilePicture) {
    const command = new GetObjectCommand({ Bucket: bucketName, Key: u.profilePicture });
    u.profileImage = await getSignedUrl(s3, command, { expiresIn: 60 * 60 * 24 * 7 });
  } else {
    u.profileImage = "";
  }
  return u;
};

const makeUserPhantom = async (req, res) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const wallet = await Wallet.findOne({ userid: user._id });
    if (!wallet) return res.status(404).json({ error: "Wallet not found" });

    const cost = 100000;

    if (wallet.coins < cost) {
      return res.status(400).json({ error: "Not enough coins" });
    }


    wallet.coins -= cost;
    await wallet.save();

    const now = new Date();
    const baseTime =
      user.phantomExpiresAt && user.phantomExpiresAt > now
        ? user.phantomExpiresAt
        : now;

    const newExpiry = new Date(baseTime.getTime() + 7 * 24 * 60 * 60 * 1000);

    if (!user.phantomId) {
      user.phantomId = await generateUniquePhantomId();
    }

    user.isPhantom = true;
    user.phantomExpiresAt = newExpiry;

    await user.save();

    res.status(200).json({
      message: "Phantom activated",
      phantomId: user.phantomId,
      expiresAt: user.phantomExpiresAt,
      coinsLeft: wallet.coins,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};

async function generateUniquePhantomId() {
  let id;
  let exists = true;

  while (exists) {
    id = Math.floor(1000 + Math.random() * 9000);

    exists = await User.exists({ phantomId: id, isPhantom: true });
  }

  return id;
}

module.exports = {
  createStream,
  leaveStream,
  deleteStream,
  getStreamsOfFollowing,
  joinStream,
  getStreamByUserId,
  getViewers,
  getViewersLikesCount,
  getModerators,
  makeModerator,
  removeModerator,
  getBlocked,
  sendInvite,
  sendAudianceInvite,
  getStreamByUserIDByAdmin,
  deleteStreamByAdmin,
  createClubStream,
  getClubStreamStatus,
  getBroadcasters,
  removeBroadcaster,
  makeBroadcaster,
  challengeStreamer,
  getLiveUsers,
  getChallengersScore,
  requestChallenge,
  updateStreamToPk,
  updatePKToStream,
  generatePKBattleToken,
  getPkBattleUsersInfo,
  getPkBattleUserByUid,
  updatePKUniqueId,
  getPkBattleStatus,
  startPkBattle,
  getServerTime,
  endBattleAndDeclareWinner,
  updatePKVirtualBackground,
  joinPKStream,
  leavePKStream,
  likePKStream,
  getUserPowerUps,
  useAndDeletePowerUp,
  updatePKDoubleOpen,
  toggleCommentsVisibility,
  getStreamById,
  addCohostsRequest,
  removeCohostsRequest,
  getCohostRequests,
  enableThumbnail,
  toggleVirtualBackground,
  toggleLivePaused,
  updateThumbnailSource,
  toggleGuestRequests,
  getTrendingStreams,
  getFollowingStreams,
  makeUserPhantom,
  getRecentStreamAnalysis
};
