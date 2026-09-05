// Node 26 removed the legacy buffer.SlowBuffer export used by an older
// transitive dependency of googleapis. Keep the legacy alias available until
// that dependency is replaced, without modifying node_modules at runtime.
const nodeBuffer = require("buffer");
if (!nodeBuffer.SlowBuffer) nodeBuffer.SlowBuffer = nodeBuffer.Buffer;

const express = require("express");
const connectDB = require("./db");
const app = express();
app.set("view engine", "ejs");
app.use(express.static("public"));
const path = require("path");
app.use(
  "/.well-known",
  express.static(path.join(__dirname, "public/.well-known")),
);
console.log(path.join(__dirname, "public/.well-known"));
const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const { v4: uuidv4 } = require("uuid");
const PKBattle = require("./models/pkBattleModel");
const System = require("./models/systemModel");
const User = require("./models/userModel");
const Post = require("./models/postModel");
const Reel = require("./models/reelModel");
const Story = require("./models/storyModel");
const Activity = require("./models/activityModel");
const Stream = require("./models/streamModel");
const StreamAnalysis = require("./models/streamAnalysisModel");
const Admin = require("./models/adminModel");
const Chat = require("./models/chatModel");
const ClubChat = require("./models/clubChatModel");
const Thread = require("./models/threadModel");
const Wallet = require("./models/walletModel");
const Club = require("./models/clubModel");
const Call = require("./models/callModel");
const Gift = require("./models/giftModel");
const LiveGoal = require("./models/liveGoalModel");
const { aws, getNewUsername } = require("./helpers/otherHelpers");
const { markOnboardingTask } = require("./helpers/newUserOnboardingHelper");
const { sendNotification } = require("./controllers/notificationController");
const { createActivity } = require("./controllers/activityController");
const {
  authorizeMessageSend,
  getMessageAccess,
  isConversationMuted,
} = require("./services/privacyAccessService");

async function saveCompletedStreamAnalysis(stream) {
  if (!stream) return;
  const host = (stream.broadcasters || []).find(
    broadcaster => broadcaster.role === "host" ||
      broadcaster.userid?.toString() === stream.userid?.toString(),
  );
  const giftCoins = Number(stream.giftCoins || host?.earnings || 0);
  const diamondsEarned = giftCoins * 0.42;
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
      topGifters: [...(stream.gifters || [])]
        .sort((a, b) => Number(b.coins || 0) - Number(a.coins || 0))
        .slice(0, 3),
      endedAt: new Date(),
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  );
}

const crypto = require("crypto");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

require("dotenv").config();

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

async function generateUniquePhantomId() {
  let id;
  let exists = true;

  while (exists) {
    id = Math.floor(1000 + Math.random() * 9000);
    exists = await User.exists({ phantomId: id, isPhantom: true });
  }

  return id;
}

async function resolvePhantomIdentity(userDoc, providedPhantomId) {
  if (!userDoc) return null;

  if (providedPhantomId) {
    if (userDoc.phantomId !== providedPhantomId) {
      userDoc.phantomId = providedPhantomId;
      await userDoc.save();
    }
    return providedPhantomId;
  }

  if (userDoc.phantomId) {
    return userDoc.phantomId;
  }

  const generatedId = await generateUniquePhantomId();
  userDoc.phantomId = generatedId;
  await userDoc.save();
  return generatedId;
}

async function getPhantomAwareIdentity(userDoc, fallbackName = "") {
  if (!userDoc) {
    return {
      displayName: fallbackName || "",
      phantomId: null,
      isPhantom: false,
    };
  }

  if (userDoc.isPhantom) {
    const resolved = await resolvePhantomIdentity(userDoc);
    return {
      displayName: resolved
        ? resolved.toString()
        : fallbackName || userDoc.username || "",
      phantomId: resolved ?? null,
      isPhantom: true,
    };
  }

  return {
    displayName: fallbackName || userDoc.username || "",
    phantomId: null,
    isPhantom: false,
  };
}

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const http = require("http");
const server = http.createServer(app);

const io = require("socket.io")(server, {
  cors: {
    origins: "*",
  },
  maxHttpBufferSize: 1e8,
});
global.io = io;
global.onlineSockets = new Map();

require("./cronJobs/phantomCron");
require("./cronJobs/streamHeartbeatCron");
require("./cronJobs/clubStreamResetCron");
require("./cronJobs/trendingPostsCron");
require("./cronJobs/topCreatorsCron");
require("./cronJobs/messageRequestCooldownCron");

const { getThreads2 } = require("./controllers/chatController");

function setSocket(userid, newsocket) {
  if (onlineSockets.get(userid)) {
    onlineSockets.get(userid).push(newsocket);
  } else {
    onlineSockets.set(userid, [newsocket]);
  }
}

io.on("connection", async (socket) => {
  const userid = socket.handshake.auth.userid;

  await User.findByIdAndUpdate(userid, {
    is_online: "1",
  });
  socket.on("joinPKChannel", ({ pkChannelName }) => {
    socket.join(pkChannelName);
  });

  console.log(userid);
  setSocket(userid, socket);

  socket.on("streamHeartbeat", async (data = {}) => {
    try {
      const { streamid, userid: hostId } = data;
      if (!streamid || !hostId) return;

      const stream = await Stream.findById(streamid);
      if (!stream) return;

      if (stream.userid.toString() !== hostId.toString()) {
        return;
      }

      stream.lastHeartbeatAt = new Date();
      await stream.save();
    } catch (err) {
      console.error("streamHeartbeat error:", err);
    }
  });

  var unDeliveredChats = await Chat.find({
    receiverid: userid,
    delivered: false,
  });

  var senders = [];

  await Promise.all(
    unDeliveredChats.map(async (chat) => {
      await chat.updateOne({
        delivered: true,
      });
      if (!senders.includes(chat.senderid)) {
        senders.push(chat.senderid);
      }
    }),
  );

  senders.forEach((senderid) => {
    const senderSockets = onlineSockets.get(senderid.toString());
    if (senderSockets) {
      for (const senderSocket of senderSockets) {
        senderSocket.emit("deliveredMessage", {
          receiverid: userid,
        });
      }
    }
  });
  const threads = await getThreads2(userid);

  await Promise.all(
    threads.map((thread) => {
      let receiverid;
      if (thread.participants[0].userid == userid) {
        receiverid = thread.participants[1].userid;
      } else {
        receiverid = thread.participants[0].userid;
      }
      receiverid = receiverid.toString();
      const receiverSockets = onlineSockets.get(receiverid);
      let threadUpdate = thread;
      if (receiverSockets) {
        for (const receiverSocket of receiverSockets) {
          if (receiverSocket) {
            receiverSocket.emit("threadUpdate", threadUpdate);
          }
        }
      }
    }),
  );
  socket.on("joinPkRoom", ({ pkChannelName }) => {
    socket.join(pkChannelName);
    console.log(`User ${userid} joined PK room: ${pkChannelName}`);
  });

  socket.on(
    "challengeRequested",
    ({ pkChannelName, streamerId, username, profilePicture, streamid }) => {
      socket.to(pkChannelName).emit("challengeRequested", {
        userid: streamerId,
        username: username,
        profilePic: profilePicture,
        streamid,
        challengedby: userid,
        pkChannelName,
        type: "remote",
      });

      console.log("challengeAccepted sent to room ${roomId} by");
    },
  );

  socket.on(
    "challengeRequested",
    ({ pkChannelName, streamerId, username, profilePicture, streamid }) => {
      socket.to(pkChannelName).emit("challengeRequested", {
        userid: streamerId,
        username: username,
        profilePic: profilePicture,
        streamid,
        challengedby: userid,
        pkChannelName,
        type: "remote",
      });

      console.log("challengeAccepted sent to room ${roomId} by");
    },
  );
  socket.on("disconnect", async () => {
    let arr = onlineSockets.get(userid);
    arr = arr.filter((item) => item !== socket);
    // if (arr.length == 0) {
    await User.findByIdAndUpdate(userid, {
      is_online: "0",
    });
    const stream = await Stream.findOne({ userid });
    const user = await User.findById(userid);
    if (stream) {
      setTimeout(async () => {
        await saveCompletedStreamAnalysis(stream);
        await stream.deleteOne();
        if (user) {
          await user.updateOne({
            isLive: false,
          });

          // Notify followers and club members that the user stopped being live
          const stoppedLiveData = {
            userid: user._id,
            isLive: false,
            streamid: "",
          };

          let targets = new Set();
          if (user.followers)
            user.followers.forEach((f) => targets.add(f.toString()));

          if (stream.isClubStreaming && stream.clubid) {
            const club = await Club.findById(stream.clubid);
            if (club && club.members) {
              club.members.forEach((m) => targets.add(m.toString()));
            }
          }

          console.log(
            `User ${user._id} disconnected. Notifying ${targets.size} unique targets:`,
            Array.from(targets),
          );

          targets.forEach((followerid) => {
            const followerSockets = global.onlineSockets.get(
              followerid.toString(),
            );
            if (followerSockets && followerSockets.length > 0) {
              console.log(
                `Sockets found for target ${followerid.toString()} (Count: ${followerSockets.length}). Emitting userStoppedLive...`,
              );
              followerSockets.forEach((socket) => {
                if (socket) {
                  console.log(
                    `Emitting userStoppedLive to socket ID: ${socket.id}`,
                  );
                  socket.emit("userStoppedLive", stoppedLiveData);
                }
              });
            } else {
              console.log(
                `No active socket session for target ${followerid.toString()}`,
              );
            }
          });
        }
      }, 60000);
      const isPK = stream.isPK;
      const pkChannelName = stream.pkChannelName;

      if (isPK && pkChannelName) {
        const affectedStreams = await Stream.find({ pkChannelName });

        for (const s of affectedStreams) {
          const userId = s.userid.toString();
          const sockets = global.onlineSockets.get(userId) || [];

          for (const sock of sockets) {
            sock.emit("challengedEnded", {
              pkChannelName,
              type: "cleared",
            });
          }
        }
        await PKBattle.findOneAndDelete({ pkChannelName });
        await Stream.deleteMany({ pkChannelName });
      }
    }
    // }
    onlineSockets.set(userid, arr);
    const threads = await getThreads2(userid);

    await Promise.all(
      threads.map((thread) => {
        let receiverid;
        if (thread.participants[0].userid == userid) {
          receiverid = thread.participants[1].userid;
        } else {
          receiverid = thread.participants[0].userid;
        }
        receiverid = receiverid.toString();
        const receiverSockets = onlineSockets.get(receiverid);
        let threadUpdate = thread;
        if (receiverSockets) {
          for (const receiverSocket of receiverSockets) {
            if (receiverSocket) {
              receiverSocket.emit("threadUpdate", threadUpdate);
            }
          }
        }
      }),
    );
    // const stream = await Stream.findOne({userid})

    // if(stream){
    //     await stream.deleteOne()
    // }
  });

  socket.on("deleteMessage", async (data) => {
    try {
      const { chatid, senderid, receiverid } = data;
      const chat = await Chat.findById(chatid);
      await chat.deleteOne();
      const receiverSockets = onlineSockets.get(receiverid);
      if (receiverSockets) {
        for (const receiverSocket of receiverSockets) {
          if (receiverSocket) {
            receiverSocket.emit("messageDeleted", {
              chatid,
              senderid: receiverid,
              receiverid: senderid,
            });
          }
        }
      }
      const senderSockets = onlineSockets.get(senderid);
      if (senderSockets) {
        for (const senderSocket of senderSockets) {
          if (senderSocket) {
            senderSocket.emit("messageDeleted", {
              chatid,
              senderid,
              receiverid,
            });
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("deleteMessageForMe", async (data) => {
    try {
      const { chatid, senderid, receiverid } = data;
      const chat = await Chat.findById(chatid);
      await chat.updateOne({
        deletedForMe: true,
      });

      const senderSockets = onlineSockets.get(senderid);
      if (senderSockets) {
        for (const senderSocket of senderSockets) {
          if (senderSocket) {
            senderSocket.emit("messageDeleted", {
              chatid,
              senderid,
              receiverid,
            });
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("startPKBattle", async (data) => {
    try {
      const { username, profilePic, userid } = data;
      const sockets = global.onlineSockets.get(userid.toString());
      const requestData = {
        username: username,
        profilePic: profilePic,
        userid: userid,
      };
      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("startPKChallenge", { requestData });
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("sendMedia", async (data) => {
    try {
      const { messageid, senderid, receiverid, mimeType, file, replyof } = data;
      if (senderid?.toString() !== userid?.toString()) {
        socket.emit("messagePermissionDenied", {
          messageid,
          receiverid,
          message: "Invalid sender identity.",
        });
        return;
      }
      var mediaType = mimeType.split("/")[0];
      console.log(mediaType);
      const senderSockets = onlineSockets.get(senderid);
      const receiverSockets = onlineSockets.get(receiverid);
      const sender = await User.findById(senderid);
      const receiver = await User.findById(receiverid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!receiver) {
        throw Error("Receiver Not Found");
      }
      const mediaAccess = await authorizeMessageSend(sender, receiver);
      if (!mediaAccess.canSend) {
        socket.emit("messagePermissionDenied", {
          messageid,
          receiverid,
          message: mediaAccess.messageRequestCooldown
            ? "You can send another message after the cooldown period."
            : "You cannot send another message until this request is accepted.",
        });
        return;
      }
      const chat = await Chat.create({
        senderid,
        receiverid,
        replyof,
        chatType: "reply",
      });

      if (receiver.is_online == "1") {
        await chat.updateOne({
          delivered: true,
        });

        const senderSockets = onlineSockets.get(senderid);
        if (senderSockets) {
          for (const senderSocket of senderSockets) {
            senderSocket.emit("deliveredMessage", {
              receiverid,
            });
          }
        }
      }

      let media = randomName();
      const params = {
        Bucket: bucketName,
        Key: media,
        Body: file,
        ContentType: mimeType,
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      await chat.updateOne({
        media,
      });

      let getObjectParams = {
        Bucket: bucketName,
        Key: media,
      };
      let command2 = new GetObjectCommand(getObjectParams);
      const contentURL = await getSignedUrl(s3, command2, {
        expiresIn: "604800",
      });
      let newMedia = {
        _id: chat._id,
        messageid,
        senderid,
        receiverid,
        contentType: mimeType,
        contentURL,
        replyof,
        chatType: "reply",
      };

      let thread = await Thread.findOne({
        $or: [
          { participantOneId: senderid, participantTwoId: receiverid },
          { participantOneId: receiverid, participantTwoId: senderid },
        ],
      });
      let threadExists = true;
      if (!thread) {
        threadExists = false;
        thread = await Thread.create({
          participantOneId: senderid,
          participantTwoId: receiverid,
        });
      }
      await thread.updateOne({
        last_message: "",
        last_message_sender_id: sender._id,
        last_message_Username: sender.username,
        last_message_timestamp: chat.createdAt,
        contentType: mimeType,
      });

      if (threadExists) {
        let threadUpdate = {
          _id: thread._id,
          last_message: "",
          last_message_sender_id: sender._id,
          last_message_Username: sender.username,
          last_message_timestamp: chat.createdAt,
          contentType: mimeType,
        };

        if (senderSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: senderid,
            read: false,
          });
          for (const senderSocket of senderSockets) {
            if (senderSocket) {
              senderSocket.emit("threadUpdate", threadUpdate);
              senderSocket.emit("newMedia", newMedia);
              // senderSocket.emit("unreadMessagesCount", {
              //   count: unreadCount
              // })
            }
          }
        }
        if (receiverSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: receiverid,
            read: false,
          });

          for (const receiverSocket of receiverSockets) {
            if (receiverSocket) {
              receiverSocket.emit("threadUpdate", threadUpdate);
              receiverSocket.emit("newMedia", newMedia);
              receiverSocket.emit("unreadMessagesCount", {
                count: unreadCount,
              });
            }
          }
        }
      } else {
        const user1 = await User.findById(thread.participantOneId);
        const user2 = await User.findById(thread.participantTwoId);
        let newThread = {
          _id: thread._id,
          participants: [
            {
              userid: user1._id,
              username: user1.username,
              is_online: user1.is_online,
              profilePic: await getPicUrl(user1._id),
            },
            {
              userid: user2._id,
              username: user2.username,
              is_online: user2.is_online,
              profilePic: await getPicUrl(user2._id),
            },
          ],
          last_message: "",
          last_message_sender_id: sender._id,
          last_message_Username: sender.username,
          last_message_timestamp: chat.createdAt,
          contentType: mimeType,
        };
        if (senderSockets) {
          for (const senderSocket of senderSockets) {
            if (senderSocket) {
              senderSocket.emit("newThread", newThread);
              senderSocket.emit("newMedia", newMedia);
            }
          }
        }
        if (receiverSockets) {
          for (const receiverSocket of receiverSockets) {
            if (receiverSocket) {
              receiverSocket.emit("newThread", newThread);
              receiverSocket.emit("newMedia", newMedia);
            }
          }
        }
      }
      if (!(await isConversationMuted(receiverid, senderid))) {
        await sendNotification(
          receiverid,
          sender.firstname + " " + sender.lastname,
          `Sent you ${mediaType}`,
          "chat",
          chat._id,
        );
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("seeMessage", async (data) => {
    try {
      const { senderid, userid } = data;
      var unSeenChats = await Chat.find({
        senderid,
        receiverid: userid,
        seen: false,
      });

      await Promise.all(
        unSeenChats.map(async (chat) => {
          await chat.updateOne({
            seen: true,
          });
        }),
      );
      const senderSockets = onlineSockets.get(senderid);
      if (senderSockets) {
        for (const senderSocket of senderSockets) {
          senderSocket.emit("seenMessage", {
            receiverid: userid,
          });
        }
      }
    } catch (err) {
      console.log(err);
    }
  });

  socket.on("sendMessage", async (data) => {
    try {
      const { messageid, senderid, receiverid, message, replyof } = data;
      if (senderid?.toString() !== userid?.toString()) {
        socket.emit("messagePermissionDenied", {
          messageid,
          receiverid,
          message: "Invalid sender identity.",
        });
        return;
      }
      var senderSockets = onlineSockets.get(senderid);
      var receiverSockets = onlineSockets.get(receiverid);
      const sender = await User.findById(senderid);
      const receiver = await User.findById(receiverid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!receiver) {
        throw Error("Receiver Not Found");
      }
      const messageAccess = await authorizeMessageSend(sender, receiver);
      if (!messageAccess.canSend) {
        const denialMessage = messageAccess.blocked
          ? "Messaging is unavailable because one of these accounts has blocked the other."
          : messageAccess.messageRequestCooldown
            ? "You can send another message after the cooldown period."
          : messageAccess.requiresApproval
            ? "Message request sent. You can send more messages after this user accepts or replies"
            : "This user is not accepting new conversations.";
        socket.emit("messagePermissionDenied", {
          messageid,
          receiverid,
          message: denialMessage,
        });
        return;
      }

      const chat = await Chat.create({
        senderid,
        receiverid,
        message,
        replyof,
      });
      if (receiver.is_online == "1") {
        await chat.updateOne({
          delivered: true,
        });

        const senderSockets = onlineSockets.get(senderid);
        if (senderSockets) {
          for (const senderSocket of senderSockets) {
            senderSocket.emit("deliveredMessage", {
              receiverid,
            });
          }
        }
      }
      let thread = await Thread.findOne({
        $or: [
          { participantOneId: senderid, participantTwoId: receiverid },
          { participantOneId: receiverid, participantTwoId: senderid },
        ],
      });
      let threadExists = true;
      if (!thread) {
        threadExists = false;
        thread = await Thread.create({
          participantOneId: senderid,
          participantTwoId: receiverid,
        });
      }
      await thread.updateOne({
        last_message: message,
        last_message_sender_id: sender._id,
        last_message_Username: sender.username,
        last_message_timestamp: chat.createdAt,
        contentType: "",
      });

      if (threadExists) {
        let threadUpdate = {
          _id: thread._id,
          last_message: message,
          last_message_sender_id: sender._id,
          last_message_Username: sender.username,
          last_message_timestamp: chat.createdAt,
          contentType: "",
        };

        if (senderSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: senderid,
            read: false,
          });
          for (const senderSocket of senderSockets) {
            if (senderSocket) {
              senderSocket.emit("threadUpdate", threadUpdate);
              senderSocket.emit("newMessage", {
                _id: chat._id,
                messageid,
                senderid,
                receiverid,
                message,
                replyof,
                chatType: "message",
              });

              // senderSocket.emit("unreadMessagesCount", {
              //   count: unreadCount
              // })
            }
          }
        }
        if (receiverSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: receiverid,
            read: false,
          });

          for (const receiverSocket of receiverSockets) {
            if (receiverSocket) {
              console.log("work2");
              receiverSocket.emit("threadUpdate", threadUpdate);
              receiverSocket.emit("newMessage", {
                _id: chat._id,
                messageid,
                senderid,
                receiverid,
                message,
                replyof,
                chatType: "message",
              });
              receiverSocket.emit("unreadMessagesCount", {
                count: unreadCount,
              });
            }
          }
        }
      } else {
        const user1 = await User.findById(thread.participantOneId);
        const user2 = await User.findById(thread.participantTwoId);
        let newThread = {
          _id: thread._id,
          participants: [
            {
              userid: user1._id,
              username: user1.username,
              is_online: user1.is_online,
              profilePic: await getPicUrl(user1._id),
            },
            {
              userid: user2._id,
              username: user2.username,
              is_online: user2.is_online,
              profilePic: await getPicUrl(user2._id),
            },
          ],
          last_message: message,
          last_message_sender_id: sender._id,
          last_message_Username: sender.username,
          last_message_timestamp: chat.createdAt,
          contentType: "",
        };

        if (senderSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: senderid,
            read: false,
          });
          for (const senderSocket of senderSockets) {
            if (senderSocket) {
              console.log("work1");
              senderSocket.emit("threadUpdate", newThread);
              senderSocket.emit("newMessage", {
                _id: chat._id,
                messageid,
                senderid,
                receiverid,
                message,
                replyof,
                chatType: "message",
              });

              // senderSocket.emit("unreadMessagesCount", {
              //   count: unreadCount
              // })
            }
          }
        }
        if (receiverSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: receiverid,
            read: false,
          });

          for (const receiverSocket of receiverSockets) {
            if (receiverSocket) {
              console.log("work2");
              receiverSocket.emit("threadUpdate", newThread);
              receiverSocket.emit("newMessage", {
                _id: chat._id,
                messageid,
                senderid,
                receiverid,
                message,
                replyof,
                chatType: "message",
              });
              receiverSocket.emit("unreadMessagesCount", {
                count: unreadCount,
              });
            }
          }
        }
      }

      // async function messageInfo(messageid){
      //   var chat = await Chat.findById(messageid);
      // }

      function truncateString(str, maxLength) {
        if (str.length > maxLength) {
          return str.substring(0, maxLength) + "...";
        }
        return str;
      }

      if (!(await isConversationMuted(receiverid, senderid))) {
        await sendNotification(
          receiverid,
          sender.firstname + " " + sender.lastname,
          truncateString(message, 20),
          "chat",
          senderid,
          null,
          null,
          senderid,
          sender.username,
          thread._id,
        );
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("likeMessage", async (data) => {
    try {
      console.log("worksdflka;");
      const { chatid, senderid, receiverid } = data;
      console.log("receiverid: ", receiverid);
      const receiverSockets = onlineSockets.get(receiverid);
      const senderSockets = onlineSockets.get(senderid);
      const sender = await User.findById(senderid);
      const receiver = await User.findById(receiverid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!receiver) {
        throw Error("Receiver Not Found");
      }

      const chat = await Chat.findById(chatid);
      if (!chat) {
        throw Error("chat not found");
      }

      var liked = true;
      if (chat.likedBy.includes(senderid)) {
        await chat.updateOne({
          $pull: { likedBy: senderid },
        });
        liked = false;
      } else {
        await chat.updateOne({
          $push: { likedBy: senderid },
        });
      }

      let thread = await Thread.findOne({
        $or: [
          { participantOneId: senderid, participantTwoId: receiverid },
          { participantOneId: receiverid, participantTwoId: senderid },
        ],
      });

      if (!thread) {
        throw Error("Thread not found!");
      }

      console.log("outside");
      if (receiverSockets) {
        var unreadCount = await Chat.countDocuments({
          receiverid: receiverid,
          read: false,
        });

        for (const receiverSocket of receiverSockets) {
          if (receiverSocket) {
            receiverSocket.emit("newLike", {
              _id: chat._id,
              senderid,
              liked,
            });
            receiverSocket.emit("unreadMessagesCount", {
              count: unreadCount,
            });
          }
        }
      }

      if (senderSockets) {
        var unreadCount = await Chat.countDocuments({
          receiverid: senderid,
          read: false,
        });

        for (const senderSocket of senderSockets) {
          if (senderSocket) {
            senderSocket.emit("newLike", {
              _id: chat._id,
              senderid,
              liked,
            });
            senderSocket.emit("unreadMessagesCount", {
              count: unreadCount,
            });
          }
        }
      }

      // await sendNotification(receiverid, sender.username, "Liked a message", "chat", senderid, null, null, null, sender.username, thread._id)
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("reactMessage", async (data) => {
    try {
      const { chatid, senderid, receiverid, reactionIndex } = data;
      const receiverSockets = onlineSockets.get(receiverid);
      const senderSockets = onlineSockets.get(senderid);
      const sender = await User.findById(senderid);
      const receiver = await User.findById(receiverid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!receiver) {
        throw Error("Receiver Not Found");
      }

      const chat = await Chat.findById(chatid);
      if (!chat) {
        throw Error("chat not found");
      }

      await chat.updateOne({
        reactionIndex,
      });

      let thread = await Thread.findOne({
        $or: [
          { participantOneId: senderid, participantTwoId: receiverid },
          { participantOneId: receiverid, participantTwoId: senderid },
        ],
      });

      if (!thread) {
        throw Error("Thread not found!");
      }

      if (receiverSockets) {
        var unreadCount = await Chat.countDocuments({
          receiverid: receiverid,
          read: false,
        });

        for (const receiverSocket of receiverSockets) {
          if (receiverSocket) {
            receiverSocket.emit("newReact", {
              _id: chat._id,
              senderid,
              reactionIndex,
            });
            receiverSocket.emit("unreadMessagesCount", {
              count: unreadCount,
            });
          }
        }
      }

      if (reactionIndex != -1) {
        if (senderSockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: senderid,
            read: false,
          });

          for (const senderSocket of senderSockets) {
            if (senderSocket) {
              senderSocket.emit("newReact", {
                _id: chat._id,
                senderid,
                reactionIndex,
              });
              senderSocket.emit("unreadMessagesCount", {
                count: unreadCount,
              });
            }
          }
        }

        await sendNotification(
          receiverid,
          sender.firstname + " " + sender.lastname,
          "Reacted a message",
          "chat",
          senderid,
          null,
          null,
          null,
          sender.username,
          thread._id,
        );
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("castVote", async ({ streamId, userId, choice }) => {
    const stream = await Stream.findById(streamId);
    if (!stream || !stream.voting.enabled) return;

    const now = new Date();
    const { startTime, endTime, voters, voteCounts } = stream.voting;
    if (now < startTime || now > endTime) return;

    if (voters.includes(userId)) return;

    voters.push(userId);
    if (voteCounts.hasOwnProperty(choice)) {
      voteCounts[choice] += 1;
    } else {
      voteCounts[choice] = 1;
    }

    await stream.save();

    const payload = { voteCounts };
    stream.members.forEach((memberId) => {
      const sockets = global.onlineSockets.get(memberId.toString()) || [];
      sockets.forEach((s) => s.emit("voteCountsUpdated", payload));
    });
  });

  // Create a map to store timeouts by streamId
  const votingTimeouts = new Map();

  socket.on("startVoting", async ({ streamId }) => {
    try {
      const stream = await Stream.findById(streamId);
      if (!stream) throw new Error("Stream not found");

      // Clear any existing timeout for this stream
      if (votingTimeouts.has(streamId)) {
        clearTimeout(votingTimeouts.get(streamId));
        votingTimeouts.delete(streamId);
      }

      const now = Date.now();
      const windowMs = 30_000;
      const endMs = now + windowMs;

      stream.voting = {
        enabled: true,
        startTime: new Date(now),
        endTime: new Date(endMs),
        voteCounts: { smile: 0, cry: 0 },
        voters: [],
      };
      await stream.save();

      const remainingSec = Math.ceil((endMs - Date.now()) / 1000);
      const payload = { remaining: remainingSec };
      const members = stream.members || [];

      for (const memberId of members) {
        const sockets = global.onlineSockets.get(memberId.toString()) || [];
        for (const s of sockets) {
          s.emit("votingStarted", payload);
        }
      }

      // Store the timeout reference
      const timeoutId = setTimeout(async () => {
        votingTimeouts.delete(streamId); // Remove from map when executed

        const fresh = await Stream.findById(streamId);
        if (!fresh) return;

        // Only end if voting is still enabled
        if (fresh.voting?.enabled) {
          fresh.voting.enabled = false;
          await fresh.save();

          for (const memberId of members) {
            const sockets = global.onlineSockets.get(memberId.toString()) || [];
            for (const s of sockets) {
              s.emit("votingEnded");
            }
          }
        }
      }, windowMs);

      votingTimeouts.set(streamId, timeoutId);
    } catch (err) {
      console.error("startVoting error:", err);
    }
  });

  socket.on("stopVoting", async ({ streamId }) => {
    try {
      const stream = await Stream.findById(streamId);
      if (!stream) throw new Error("Stream not found");
      if (!stream.voting?.enabled) return;

      // Clear the pending timeout for this stream
      if (votingTimeouts.has(streamId)) {
        clearTimeout(votingTimeouts.get(streamId));
        votingTimeouts.delete(streamId);
      }

      stream.voting.enabled = false;
      await stream.save();

      const members = stream.members || [];
      for (const memberId of members) {
        const sockets = global.onlineSockets.get(memberId.toString()) || [];
        for (const s of sockets) {
          s.emit("votingEnded");
        }
      }
    } catch (err) {
      console.error("stopVoting error:", err);
    }
  });

  socket.on("followUserInStream", async (data) => {
    try {
      const { followerId, followedId, streamId, pkChannelName } = data;

      const follower = await User.findById(followerId);
      const followed = await User.findById(followedId);
      const stream = await Stream.findById(streamId);

      if (!follower || !followed || !stream) {
        throw Error("User or Stream Not Found");
      }

      // Get follower's display name (handle phantom users)
      let followerDisplayName = follower.firstname || follower.username || "";
      if (follower.isPhantom && follower.phantomId) {
        followerDisplayName = follower.phantomId.toString();
      }

      const followData = {
        followerId: followerId,
        followerName: followerDisplayName,
        followedId: followedId,
        streamId: streamId,
      };

      // If in PK battle, emit to the PK room
      if (pkChannelName) {
        io.to(pkChannelName).emit("followUserInStream", followData);
      } else {
        // Emit to all stream members
        const members = stream.members || [];
        for (const member of members) {
          const sockets = global.onlineSockets.get(member.toString());
          if (sockets) {
            for (const socket of sockets) {
              socket.emit("followUserInStream", followData);
            }
          }
        }
      }
    } catch (error) {
      console.error("Error in followUserInStream:", error);
    }
  });

  socket.on("sendCommentInPK", async (data) => {
    try {
      const { senderid, pkChannelName, text, streamId } = data;
      const sender = await User.findById(senderid);
      const stream = await Stream.findById(streamId);

      if (!sender) {
        throw Error("Sender Not Found");
      }
      const club = await Club.findOne({ owner: senderid });

      const commentData = {
        userid: senderid,
        username: sender.username,
        userProfilePic: await getPicUrl(senderid),
        time: Date.now(),
        text,
        isVip: sender.isVIP,
        isPro: !!(sender.profileTitle && sender.profileTitle.trim() !== ""),
        hasClub: !club,
      };

      const members = stream.members || [];
      for (const member of members) {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            socket.emit("sendCommentInPKChannel", commentData);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  const commentsMap = new Map();
socket.on("sendCommentInStream", async (data) => {
    try {
      const {
        senderid,
        streamid,
        text,
        parentCommentId = null,
        isPhantom: isPhantomFromClient,
        phantomId: phantomIdFromClient,
      } = data;

      const sender = await User.findById(senderid);
      const stream = await Stream.findById(streamid);
      if (!sender) throw Error("Sender Not Found");
      if (!stream) throw Error("Stream Not Found");

      const isPhantomUser =
        typeof isPhantomFromClient === "boolean"
          ? isPhantomFromClient
          : Boolean(sender.isPhantom);
      let resolvedPhantomId = null;
      if (isPhantomUser) {
        resolvedPhantomId = await resolvePhantomIdentity(
          sender,
          phantomIdFromClient,
        );
      }

      let isModerator = stream.moderators.includes(senderid);
      if (stream.userid.toString() === senderid.toString()) {
        isModerator = false;
      }
      const isVip = Boolean(sender.isVIP);

      // Check if clubsJoined array is not empty
      const hasJoinedClubs = sender.clubsJoined && sender.clubsJoined.length > 0;

      const commentObj = {
        _id: uuidv4(),
        userid: senderid,
        username:
          isPhantomUser && resolvedPhantomId
            ? `${resolvedPhantomId}`
            : `${sender.username}`,
        userProfilePic: await getPicUrl(senderid),
        time: Date.now(),
        text,
        isModerator,
        isVip,
        isPro: !!(sender.profileTitle && sender.profileTitle.trim() !== ""),
        parentId: parentCommentId,
        hasClub: hasJoinedClubs, // Set to true if clubsJoined is not empty
        isPhantom: isPhantomUser,
        phantomId: resolvedPhantomId,
      };

      if (!commentsMap.has(streamid)) {
        commentsMap.set(streamid, []);
      }
      commentsMap.get(streamid).push(commentObj);

      const members = stream.members;
      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());
        if (!sockets) continue;
        for (const s of sockets) {
          s.emit("newCommentInStream", commentObj);
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("wonderBoxInStream", async (data) => {
    try {
      const { senderid, name, streamerId, text, streamId } = data;
      const coinAmount = 150000;

      const sender = await User.findById(senderid);
      if (!sender) throw new Error("Sender not found");
      const receiver = await User.findById(streamerId);
      if (!receiver) throw new Error("Receiver not found");

      const senderWallet = await Wallet.findById(sender.walletid);
      const receiverWallet = await Wallet.findById(receiver.walletid);
      if (!senderWallet || !receiverWallet) throw new Error("Wallet missing");

      if (senderWallet.coins < coinAmount) {
        (global.onlineSockets.get(sender._id.toString()) || []).forEach(
          (sock) =>
            sock.emit("lowBalance", {
              streamid: streamerId,
              coins: coinAmount,
            }),
        );
        return;
      }
      const mainAdmin = await Admin.findOne({ mainAdmin: true });
      if (!mainAdmin) throw new Error("Main Admin not found");

      const baseAmount = coinAmount * mainAdmin.coinEquivalence;
      const streamerShare = baseAmount * ((100 - mainAdmin.giftShare) / 100);
      const adminShare = baseAmount - streamerShare;

      const newSenderBalance = senderWallet.coins - coinAmount;
      const newReceiverBalance = receiverWallet.diamonds + streamerShare;

      await senderWallet.updateOne({
        $set: { coins: newSenderBalance },
        $inc: {
          hourlySentCoins: coinAmount,
          weeklySentCoins: coinAmount,
          monthlySentCoins: coinAmount,
          totalSentCoins: coinAmount,
        },
      });

      await receiverWallet.updateOne({
        $set: { diamonds: newReceiverBalance },
        $inc: {
          hourlyReceivedDiamonds: streamerShare,
          weeklyReceivedDiamonds: streamerShare,
          monthlyReceivedDiamonds: streamerShare,
        },
      });

      const adminWallet = await Wallet.findById(mainAdmin.walletid);
      if (adminWallet) {
        await adminWallet.updateOne({
          $inc: {
            currentAmount: adminShare,
            earnedAmount: adminShare,
          },
        });
      }

      const updatedSenderWallet = await Wallet.findById(sender.walletid);
      const updatedReceiverWallet = await Wallet.findById(receiver.walletid);

      const emitWalletChange = (userId, wallet) => {
        (global.onlineSockets.get(userId.toString()) || []).forEach((sock) =>
          sock.emit("walletChange", {
            userid: userId,
            coins: wallet.coins,
            diamonds: wallet.diamonds,
          }),
        );
      };

      emitWalletChange(sender._id, updatedSenderWallet);
      emitWalletChange(receiver._id, updatedReceiverWallet);
      const targetStream = await Stream.findById(streamId);
      if (!targetStream) throw new Error("Stream not found");

      await markOnboardingTask(sender._id, "gift");

      const senderImage = sender.profilePicture
        ? await aws.getLinkFromAWS(sender.profilePicture)
        : "";
      const wonderBoxPayload = {
        senderid,
        streamerId,
        name,
        text,
        price: streamerShare,
        senderImage,
        streamId,
        receiverName: receiver.username,
        sendername: sender.username,
      };

      const targetUserIds = new Set([
        streamerId.toString(),
        ...(targetStream.members || []).map((memberId) => memberId.toString()),
      ]);

      for (const targetUserId of targetUserIds) {
        const sockets = global.onlineSockets.get(targetUserId) || [];
        sockets.forEach((sock) => sock.emit("wonderBoxReceived", wonderBoxPayload));
      }
    } catch (err) {
      console.error("Error in wonderBoxInStream handler:", err);
    }
  });

  socket.on("wonderBox", async (data) => {
    try {
      const { senderid, name, streamerId, text, pkChannelName } = data;
      const coinAmount = 150000;

      const sender = await User.findById(senderid);
      if (!sender) throw new Error("Sender not found");
      const receiver = await User.findById(streamerId);
      if (!receiver) throw new Error("Receiver not found");

      const senderWallet = await Wallet.findById(sender.walletid);
      const receiverWallet = await Wallet.findById(receiver.walletid);
      if (!senderWallet || !receiverWallet) throw new Error("Wallet missing");

      if (senderWallet.coins < coinAmount) {
        (global.onlineSockets.get(sender._id.toString()) || []).forEach(
          (sock) =>
            sock.emit("lowBalance", {
              streamid: streamerId,
              coins: coinAmount,
            }),
        );
        return;
      }

      const mainAdmin = await Admin.findOne({ mainAdmin: true });
      if (!mainAdmin) throw new Error("Main Admin not found");

      const baseAmount = coinAmount * mainAdmin.coinEquivalence;
      const streamerShare = baseAmount * ((100 - mainAdmin.giftShare) / 100);
      const adminShare = baseAmount - streamerShare;

      const newSenderBalance = senderWallet.coins - coinAmount;
      const newReceiverBalance = receiverWallet.diamonds + streamerShare;

      await senderWallet.updateOne({
        $set: { coins: newSenderBalance },
        $inc: {
          hourlySentCoins: coinAmount,
          weeklySentCoins: coinAmount,
          monthlySentCoins: coinAmount,
          totalSentCoins: coinAmount,
        },
      });

      await receiverWallet.updateOne({
        $set: { diamonds: newReceiverBalance },
        $inc: {
          hourlyReceivedDiamonds: streamerShare,
          weeklyReceivedDiamonds: streamerShare,
          monthlyReceivedDiamonds: streamerShare,
        },
      });

      const adminWallet = await Wallet.findById(mainAdmin.walletid);
      if (adminWallet) {
        await adminWallet.updateOne({
          $inc: {
            currentAmount: adminShare,
            earnedAmount: adminShare,
          },
        });
      }
      const updatedSenderWallet = await Wallet.findById(sender.walletid);
      const updatedReceiverWallet = await Wallet.findById(receiver.walletid);

      const emitWalletChange = (userId, wallet) => {
        (global.onlineSockets.get(userId.toString()) || []).forEach((sock) =>
          sock.emit("walletChange", {
            userid: userId,
            coins: wallet.coins,
            diamonds: wallet.diamonds,
          }),
        );
      };
      emitWalletChange(sender._id, updatedSenderWallet);
      emitWalletChange(receiver._id, updatedReceiverWallet);
      await markOnboardingTask(sender._id, "gift");

      const pkBattle = await PKBattle.findOne({ pkChannelName });
      if (!pkBattle) throw new Error("PK Battle not found");

      const isA =
        pkBattle.streamerA.userId.toString() === receiver._id.toString();
      const side = isA ? pkBattle.streamerA : pkBattle.streamerB;
      side.giftCount = (side.giftCount || 0) + streamerShare;
      await pkBattle.save();

      const scorePayload = {
        pkChannelName,
        streamerA: pkBattle.streamerA.giftCount,
        streamerB: pkBattle.streamerB.giftCount,
      };

      const streamsByPk = await Stream.find({ pkChannelName });
      const senderImage = sender.profilePicture
        ? await aws.getLinkFromAWS(sender.profilePicture)
        : "";

      for (const stream of streamsByPk) {
        for (const memberId of stream.members) {
          const sockets = global.onlineSockets.get(memberId.toString()) || [];

          sockets.forEach((sock) => sock.emit("pkScoreUpdate", scorePayload));

          if (stream.userid.toString() === receiver._id.toString()) {
            sockets.forEach((sock) =>
              sock.emit("wonderBoxReceived", {
                senderid,
                streamerId,
                name,
                text,
                price: streamerShare,
                senderImage,
              }),
            );
          }
        }
      }
    } catch (err) {
      console.error("Error in wonderBox handler:", err);
    }
  });

  socket.on("wonderBoxThankYou", async (data) => {
    try {
      const { senderid, receiverid, giftName } = data;

      const sender = await User.findById(senderid);
      const receiver = await User.findById(receiverid);

      if (!sender || !receiver) return;

      const senderImage = sender.profilePicture
        ? await aws.getLinkFromAWS(sender.profilePicture)
        : null;

      const thankYouMessage = `Thanks for the ${giftName}, @${sender.username}! Your support keeps the stream glowing.`;

      (global.onlineSockets.get(receiverid.toString()) || []).forEach((sock) =>
        sock.emit("wonderBoxThankYouReceived", {
          senderid,
          receiverid,
          giftName,
          senderName: sender.username,
          senderImage,
          thankYouMessage,
        }),
      );
    } catch (err) {
      console.error("Error in wonderBoxThankYou:", err);
    }
  });

  socket.on("likeStream", async (data) => {
    try {
      const { senderid, streamid } = data;
      const sender = await User.findById(senderid);
      const stream = await Stream.findById(streamid);

      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!stream) {
        throw Error("Stream Not Found");
      }

      stream.likeCount = (stream.likeCount || 0) + 1;
      await stream.save();

      const members = stream.members;

      const like = {
        senderid,
        username: sender.username,
        time: Date.now(),
        message: "Stream Liked",
        likeCount: stream.likeCount,
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newLike", like);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("sendCommentInCall", async (data) => {
    try {
      const { senderid, callid, text } = data;
      const sender = await User.findById(senderid);
      const call = await Stream.findById(callid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!call) {
        throw Error("Call Not Found");
      }

      const commentData = {
        userid: senderid,
        username: sender.username,
        userProfilePic: await getPicUrl(senderid),
        time: Date.now(),
        text,
      };

      const members = call.members;

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newCommentInCall", commentData);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("likeCall", async (data) => {
    try {
      const { senderid, callid } = data;
      const sender = await User.findById(senderid);
      // const stream = await Stream.findById(callid);

      const call = await Stream.findById(callid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      if (!call) {
        throw Error("Stream Not Found");
      }
      const members = call.members;

      const like = {
        senderid,
        username: sender.username,
        time: Date.now(),
        message: "Call Liked",
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newLikeInCall", like);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("sendGiftInPKChallenge", async (data) => {
    try {
      const { pkChannelName, userid, giftid, streamer, multiplier = 1 } = data;

      const sender = await User.findById(userid);
      if (!sender) throw Error("Sender Not Found");

      const receiver = await User.findById(streamer);
      if (!receiver) throw Error("Receiver Not Found");

      let gift;
      let coinAmount;

      if (giftid === "Rose") {
        coinAmount = 1;
        gift = {
          _id: "Rose",
          name: "Rose",
          price: 1,
          thumbnail: "Rose",
          gif: "",
        };
      } else {
        gift = await Gift.findById(giftid);
        if (!gift) throw Error("Gift Not Found");

        if (gift.isExclusive && !sender.isVIP) {
          const sockets = global.onlineSockets.get(sender._id.toString());
          if (sockets) {
            for (const sock of sockets) {
              sock.emit("error", {
                message: "Exclusive gifts are only for VIP users.",
              });
            }
          }
          return;
        }

        coinAmount = gift.price;
      }

      const mainAdmin = await Admin.findOne({ mainAdmin: true });
      const baseAmount = coinAmount * mainAdmin.coinEquivalence;
      const senderWallet = await Wallet.findById(sender.walletid);
      const receiverWallet = await Wallet.findById(receiver.walletid);
      if (!senderWallet || !receiverWallet) throw Error("Wallet(s) missing");

      if (coinAmount > senderWallet.coins) {
        const sockets = global.onlineSockets.get(sender._id.toString());
        if (sockets) {
          for (const sock of sockets) {
            sock.emit("lowBalance", {
              streamid: pkChannelName,
              giftid,
              coins: coinAmount,
            });
          }
        }
        return;
      }
      const newSenderBalance = senderWallet.coins - coinAmount;
      const newTotalSentCoins = senderWallet.totalSentCoins + coinAmount;

      await senderWallet.updateOne({
        $set: { coins: newSenderBalance },
        $inc: {
          hourlySentCoins: coinAmount,
          weeklySentCoins: coinAmount,
          monthlySentCoins: coinAmount,
          totalSentCoins: coinAmount,
        },
      });

      if (newTotalSentCoins >= 150000 && !sender.isVIP) {
        await User.findByIdAndUpdate(sender._id, { isVIP: true });
      }
      await markOnboardingTask(sender._id, "gift");

      const senderSockets =
        global.onlineSockets.get(sender._id.toString()) || [];
      senderSockets.forEach((sock) =>
        sock?.emit("walletChange", {
          userid: sender._id,
          coins: newSenderBalance,
          diamonds: senderWallet.diamonds,
        }),
      );

      const streamerShare = baseAmount * ((100 - mainAdmin.giftShare) / 100);
      const receiverDiamondsDelta = coinAmount * 0.42;
      const newReceiverBalance =
        receiverWallet.diamonds + receiverDiamondsDelta;
      await receiverWallet.updateOne({
        $set: { diamonds: newReceiverBalance },
        $inc: {
          hourlyReceivedDiamonds: receiverDiamondsDelta,
          weeklyReceivedDiamonds: receiverDiamondsDelta,
          monthlyReceivedDiamonds: receiverDiamondsDelta,
        },
      });

      const adminWallet = await Wallet.findById(mainAdmin.walletid);
      const adminCoinShare = coinAmount * 0.28;
      await adminWallet.updateOne({
        currentAmount: adminWallet.currentAmount + adminCoinShare,
        earnedAmount: adminWallet.earnedAmount + adminCoinShare,
      });

      const receiverSockets =
        global.onlineSockets.get(receiver._id.toString()) || [];
      receiverSockets.forEach((sock) => {
        sock?.emit("walletChange", {
          userid: receiver._id,
          coins: receiverWallet.coins,
          diamonds: newReceiverBalance,
        });
      });

      const pkBattle = await PKBattle.findOne({ pkChannelName });
      if (!pkBattle) throw Error("PK Battle Not Found");

      const isStreamerA =
        pkBattle.streamerA.userId.toString() === receiver._id.toString();
      const field = isStreamerA ? "streamerA" : "streamerB";

      if (giftid === "Rose") {
        const hasAlreadySent = pkBattle[field].roseSenders.some(
          (id) => id.toString() === sender._id.toString(),
        );

        if (!hasAlreadySent) {
          pkBattle[field].rosesCount += 1;
          pkBattle[field].roseSenders.push(sender._id);
        }
      }

      const effectiveGiftAmount = coinAmount * multiplier;

      if (pkBattle[field].giftCount === 0) {
        pkBattle[field].giftCount += effectiveGiftAmount * 2;
      } else {
        pkBattle[field].giftCount += effectiveGiftAmount;
      }

      const existingGifter = pkBattle[field].topGifters.find(
        (g) => g.userId.toString() === sender._id.toString(),
      );

      const profilePicUrl = await getPicUrl(sender._id);
      if (existingGifter) {
        existingGifter.coins += coinAmount * multiplier;
        existingGifter.image = profilePicUrl;
      } else {
        pkBattle[field].topGifters.push({
          userId: sender._id,
          username: sender.username,
          image: profilePicUrl,
          coins: coinAmount * multiplier,
        });
      }

      pkBattle[field].topGifters.sort((a, b) => b.coins - a.coins);
      pkBattle[field].topGifters = pkBattle[field].topGifters.slice(0, 3);

      await pkBattle.save();

      const senderImage = await getPicUrl(sender._id);

      let thumbnailUrl = "Rose";
      let giftFileUrl = "";
      let isSvga = false;

      if (giftid !== "Rose") {
        thumbnailUrl = await aws.getLinkFromAWS(gift.thumbnail);
        isSvga = gift.isSvga || false;

        if (isSvga && gift.giftFile) {
          giftFileUrl = await aws.getLinkFromAWS(gift.giftFile);
        } else if (!isSvga && gift.gif) {
          giftFileUrl = await aws.getLinkFromAWS(gift.gif);
        }
      }

      const {
        displayName: senderDisplayName,
        phantomId: resolvedPhantomId,
        isPhantom: isPhantomSender,
      } = await getPhantomAwareIdentity(sender, sender.username);

      const newGiftPayload = {
        senderid: sender._id,
        senderName: senderDisplayName,
        receiverid: receiver._id,
        receiverName: receiver.username,
        price: streamerShare,
        giftid: gift._id,
        senderImage,
        thumbnail: thumbnailUrl,
        isSvga,
        giftFile: giftFileUrl,
        multiplier,
        giftName: gift.name || "",
        isPhantom: isPhantomSender,
        phantomId: resolvedPhantomId,
      };
      const topGiftersPayload = {
        pkChannelName,
        streamerA: pkBattle.streamerA.topGifters,
        streamerB: pkBattle.streamerB.topGifters,
      };
      const scorePayload = {
        pkChannelName,
        streamerA: pkBattle.streamerA.giftCount,
        streamerB: pkBattle.streamerB.giftCount,
      };

      const now = new Date();
      const goal = await LiveGoal.findOne({
        hostId: streamer,
        expiresAt: { $gt: now },
      });

      let doneAll = false;
      let expiry;

      if (goal) {
        const isTarget = goal.giftIds.some((id) => id.toString() === giftid);

        const alreadyGot = goal.receivedGiftIds.some(
          (r) => r.giftId.toString() === giftid,
        );

        if (isTarget && !alreadyGot) {
          goal.receivedGiftIds.push({
            giftId: giftid,
            senderId: userid,
          });

          doneAll = goal.giftIds.every((targetId) =>
            goal.receivedGiftIds.some(
              (r) => r.giftId.toString() === targetId.toString(),
            ),
          );

          if (doneAll && goal.status !== "completed") {
            goal.status = "completed";
            expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

            const updatedUser = await User.findByIdAndUpdate(
              streamer,
              {
                profileTitle: "Live Pro",
                profileTitleExpiresAt: expiry,
              },
              { new: true },
            );

            console.log(`User title set: ${updatedUser.profileTitle}`);
          }
          await goal.save();
        }
      }

      const streams = await Stream.find({ pkChannelName });

      for (const stream of streams) {
        for (const memberId of stream.members) {
          const sockets = global.onlineSockets.get(memberId.toString()) || [];
          console.log("stream member sockets: ", memberId);
          for (const s of sockets) {
            s.emit("newGift", newGiftPayload);
            if (doneAll) {
              s.emit("liveGoalCompleted", {
                streamer,
                newTitle: "Live Pro",
                expiresAt: expiry,
              });
            }
            if (giftid === "Rose") {
              s.emit("rosesGiftCount", {
                receiverid: receiver._id,
                rosesCount: pkBattle[field].rosesCount,
              });
            }

            s.emit("pkTopGiftersUpdate", topGiftersPayload);
            s.emit("pkScoreUpdate", scorePayload);
          }
        }
      }
    } catch (error) {
      console.error("Error in sendGiftInPKChallenge:", error);
    }
  });

  socket.on("sendGiftInStream", async (data) => {
    try {
      const { streamid, userid, giftid, streamer } = data;

      const sender = await User.findById(userid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      sender.profilePicture = await getPicUrl(sender._id);

      const stream = await Stream.findById(streamid);
      if (!stream) {
        throw Error("Stream Not Found");
      }

      const receiver = await User.findById(streamer);
      if (!receiver) {
        throw Error("Receiver Not Found");
      }

      let gift;
      let coinAmount;

      if (giftid === "Rose") {
        coinAmount = 1;
        gift = {
          _id: "Rose",
          name: "Rose",
          price: 1,
          thumbnail: "Rose",
          gif: "",
        };
      } else {
        gift = await Gift.findById(giftid);
        if (!gift) {
          throw Error("Gift Not Found");
        }

        if (gift.isExclusive && !sender.isVIP) {
          const sockets = global.onlineSockets.get(sender._id.toString());
          if (sockets) {
            for (const sock of sockets) {
              sock.emit("error", {
                message: "Exclusive gifts are only for VIP users.",
              });
            }
          }
          return;
        }
        coinAmount = gift.price;
      }

      var mainAdmin = await Admin.findOne({ mainAdmin: true });
      var amount = coinAmount * mainAdmin.coinEquivalence;

      const currentWallet = await Wallet.findById(sender.walletid);
      const userToSendWallet = await Wallet.findById(receiver.walletid);

      const {
        displayName: senderDisplayName,
        phantomId: resolvedPhantomId,
        isPhantom: isPhantomSender,
      } = await getPhantomAwareIdentity(sender, sender.username);

      if (coinAmount <= currentWallet.coins) {
        var amountNew = currentWallet.coins - coinAmount;
        const newTotalSentCoins = currentWallet.totalSentCoins + coinAmount;

        await currentWallet.updateOne({
          $set: { coins: amountNew },
          $inc: {
            hourlySentCoins: coinAmount,
            weeklySentCoins: coinAmount,
            monthlySentCoins: coinAmount,
            totalSentCoins: coinAmount,
          },
        });

        if (newTotalSentCoins >= 150000 && !sender.isVIP) {
          await User.findByIdAndUpdate(sender._id, { isVIP: true });
        }
        await markOnboardingTask(sender._id, "gift");

        var socketsWallet = global.onlineSockets.get(sender._id.toString());

        if (socketsWallet) {
          for (const socket of socketsWallet) {
            if (socket) {
              socket.emit("walletChange", {
                userid: sender._id,
                coins: amountNew,
                diamonds: currentWallet.diamonds,
              });
            }
          }
        }

        var streamerShare = amount * ((100 - mainAdmin.giftShare) / 100);
        var adminShare = amount - streamerShare;
        const receiverDiamondsDelta = coinAmount * 0.42;
        const newReceiverBalance =
          userToSendWallet.diamonds + receiverDiamondsDelta;
        var streamGiftAmount = stream.giftAmount + streamerShare;

        await userToSendWallet.updateOne({
          $set: { diamonds: newReceiverBalance },
          $inc: {
            hourlyReceivedDiamonds: receiverDiamondsDelta,
            weeklyReceivedDiamonds: receiverDiamondsDelta,
            monthlyReceivedDiamonds: receiverDiamondsDelta,
          },
        });

        var adminWallet = await Wallet.findById(mainAdmin.walletid);
        const adminCoinShare = coinAmount * 0.28;

        await adminWallet.updateOne({
          currentAmount: adminWallet.currentAmount + adminCoinShare,
          earnedAmount: adminWallet.earnedAmount + adminCoinShare,
        });

        socketsWallet = global.onlineSockets.get(receiver._id.toString());

        if (socketsWallet) {
          for (const socket of socketsWallet) {
            if (socket) {
              socket.emit("walletChange", {
                userid: receiver._id,
                coins: userToSendWallet.coins,
                diamonds: newReceiverBalance,
              });

              socket.emit("streamWalletChange", {
                userid: receiver._id,
                balance: streamGiftAmount,
              });
            }
          }
        }

        let thumbnailUrl = "Rose";
        let giftFileUrl = "";
        const isSvga = gift.isSvga || false;
        if (giftid !== "Rose") {
          if (isSvga) {
            giftFileUrl = gift.giftFile
              ? await aws.getLinkFromAWS(gift.giftFile)
              : "";
          } else {
            giftFileUrl = gift.gif ? await aws.getLinkFromAWS(gift.gif) : "";
          }
        }
        thumbnailUrl = await aws.getLinkFromAWS(gift.thumbnail);
        const senderImage = await getPicUrl(sender._id);

        let doneAll = false;
        let expiry;

        const now = new Date();
        const goal = await LiveGoal.findOne({
          hostId: streamer,
          expiresAt: { $gt: now },
        });

        if (goal) {
          const isTarget = goal.giftIds.some((id) => id.toString() === giftid);

          const alreadyGot = goal.receivedGiftIds.some(
            (r) => r.giftId.toString() === giftid,
          );

          if (isTarget && !alreadyGot) {
            goal.receivedGiftIds.push({
              giftId: giftid,
              senderId: userid,
            });

            doneAll = goal.giftIds.every((targetId) =>
              goal.receivedGiftIds.some(
                (r) => r.giftId.toString() === targetId.toString(),
              ),
            );

            if (doneAll && goal.status !== "completed") {
              goal.status = "completed";
              expiry = new Date(Date.now() + 48 * 60 * 60 * 1000);

              const updatedUser = await User.findByIdAndUpdate(
                streamer,
                {
                  profileTitle: "Live Pro",
                  profileTitleExpiresAt: expiry,
                },
                { new: true },
              );
            }

            await goal.save();
          }
        }

        const broadcaster = stream.broadcasters.find(
          (b) => b.userid?.toString() === streamer.toString(),
        );
        const isHost = broadcaster?.role === "host";

        await Promise.all(
          stream.members.map((member) => {
            const sockets = onlineSockets.get(member.toString());
            if (sockets) {
              for (const socket of sockets) {
                if (socket) {
                  if (giftid === "Rose") {
                    socket.emit("rosesGiftCount", {
                      receiverid: receiver._id,
                      rosesCount: 0,
                    });
                  }
                  socket.emit("newGift", {
                    senderid: sender._id,
                    senderName: senderDisplayName,
                    senderImage,
                    receiverid: streamer,
                    receiverName: receiver.username,
                    price: streamerShare,
                    giftid: gift._id,
                    giftName: gift.name || "",
                    isSvga,
                    giftFile: giftFileUrl,
                    thumbnail: thumbnailUrl,
                    isHost,
                    isPhantom: isPhantomSender,
                    phantomId: resolvedPhantomId,
                  });
                  if (doneAll) {
                    socket.emit("liveGoalCompleted", {
                      streamer,
                      newTitle: "Live Pro",
                      expiresAt: expiry,
                    });
                  }
                }
              }
            }
          }),
        );

        await Stream.updateOne(
          {
            _id: streamid,
            "broadcasters.userid": streamer,
          },
          {
            $inc: {
              "broadcasters.$.earnings": coinAmount,
            },
          },
        );

        const gifterUpdate = await Stream.updateOne(
          { _id: streamid, "gifters.userid": sender._id },
          {
            $inc: {
              giftCount: 1,
              giftCoins: coinAmount,
              "gifters.$.giftCount": 1,
              "gifters.$.coins": coinAmount,
            },
            $set: {
              "gifters.$.username": senderDisplayName,
              "gifters.$.profilePicture": sender.profilePicture || "",
            },
          },
        );

        if (gifterUpdate.matchedCount === 0) {
          await Stream.updateOne(
            { _id: streamid },
            {
              $inc: { giftCount: 1, giftCoins: coinAmount },
              $push: {
                gifters: {
                  userid: sender._id,
                  username: senderDisplayName,
                  profilePicture: sender.profilePicture || "",
                  giftCount: 1,
                  coins: coinAmount,
                },
              },
            },
          );
        }

        const result = await Stream.findById(streamid);

        if (result) {
          const currentBroadcaster = result.broadcasters.find(
            (b) => b.userid?.toString() === streamer.toString(),
          );

          const totalEarnings = currentBroadcaster?.earnings || 0;

          await Promise.all(
            result.members.map((member) => {
              const socketsWallet = global.onlineSockets.get(member.toString());

              if (socketsWallet) {
                for (const socket of socketsWallet) {
                  if (socket) {
                    socket.emit("broadcasterGiftUpdate", {
                      broadcasterId: streamer,
                      totalEarnings,
                    });
                  }
                }
              }
            }),
          );
        }
      } else {
        const sockets = onlineSockets.get(sender._id.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("lowBalance", {
                streamid,
                giftid,
                coins: coinAmount,
              });
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("sendGiftInClubStream", async (data) => {
    try {
      const { streamid, userid, giftid, clubid } = data;

      const sender = await User.findById(userid);
      if (!sender) {
        throw Error("Sender Not Found");
      }
      const stream = await Stream.findById(streamid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      const club = await Club.findById(clubid);
      if (!club) {
        throw Error("Club Not Found");
      }
      const receiver = await User.findById(club.userid);
      if (!receiver) {
        throw Error("Receiver Not Found");
      }
      const gift = await Gift.findById(giftid);
      if (!gift) {
        throw Error("Gift Not Found");
      }

      var coinAmount = gift.price;

      const currentWallet = await Wallet.findById(sender.walletid);
      const userToSendWallet = await Wallet.findById(receiver.walletid);

      const senderName = sender.username;

      if (coinAmount <= currentWallet.currentAmount) {
        var amountNew = currentWallet.currentAmount - coinAmount;
        await currentWallet.updateOne({
          currentAmount: amountNew,
        });
        await markOnboardingTask(sender._id, "gift");
        var socketsWallet = global.onlineSockets.get(sender._id.toString());

        if (socketsWallet) {
          for (const socket of socketsWallet) {
            if (socket) {
              socket.emit("walletChange", {
                userid: sender._id,
                balance: amountNew,
              });
            }
          }
        }

        var mainAdmin = await Admin.findOne({ mainAdmin: true });
        var streamerShare = coinAmount * ((100 - mainAdmin.giftShare) / 100);
        var adminShare = coinAmount - streamerShare;
        const receiverDiamondsDelta = coinAmount * 0.42;
        const newReceiverDiamonds =
          userToSendWallet.diamonds + receiverDiamondsDelta;
        amountNew = userToSendWallet.currentAmount + streamerShare;
        await userToSendWallet.updateOne({
          $set: {
            currentAmount: amountNew,
            diamonds: newReceiverDiamonds,
          },
          $inc: {
            earnedAmount: streamerShare,
            hourlyReceivedDiamonds: receiverDiamondsDelta,
            weeklyReceivedDiamonds: receiverDiamondsDelta,
            monthlyReceivedDiamonds: receiverDiamondsDelta,
          },
        });
        var adminWallet = await Wallet.findById(mainAdmin.walletid);
        const adminCoinShare = coinAmount * 0.28;
        await adminWallet.updateOne({
          currentAmount: adminWallet.currentAmount + adminCoinShare,
          earnedAmount: adminWallet.earnedAmount + adminCoinShare,
        });
        socketsWallet = global.onlineSockets.get(receiver._id.toString());

        if (socketsWallet) {
          for (const socket of socketsWallet) {
            if (socket) {
              socket.emit("walletChange", {
                userid: receiver._id,
                balance: amountNew,
              });
            }
          }
        }

        var gif = await aws.getLinkFromAWS(gift.gif);
        const sockets = onlineSockets.get(receiver._id.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newGift", {
                senderid: sender._id,
                senderName,
                price: streamerShare,
                giftid: gift._id,
                giftName: gift.name || "",
                gif,
              });
            }
          }
        }
      } else {
        const sockets = onlineSockets.get(sender._id.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("lowBalance", {
                streamid,
                giftid,
              });
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("sendMessageInClub", async (data) => {
    try {
      const { messageid, senderid, clubid, roomid, message } = data;
      var user = await User.findById(senderid);
      const club = await Club.findById(clubid);

      if (!user) {
        throw Error("User Not Found");
      }

      if (!club) {
        throw Error("Club Not Found");
      }
      var clubOwner = await User.findById(club.userid);

      const chat = await ClubChat.create({ senderid, clubid, message, roomid });
      console.log("chat: ", chat);

      user.profilePicture = await aws.getLinkFromAWS(user.profilePicture);
      var host = club.userid == senderid;
      const newMessage = {
        _id: chat._id,
        messageid,
        senderid,
        clubid,
        message,
        username: user.username,
        profilePicture: user.profilePicture,
        host,
        roomid,
        createdAt: chat.createdAt,
      };

      function truncateString(str, maxLength) {
        if (str.length > maxLength) {
          return str.substring(0, maxLength) + "...";
        }
        return str;
      }

      const members = new Set([
        club.userid.toString(),
        ...club.members.map(member => member.toString()),
      ]);

      for (const member of members) {
        const sockets = onlineSockets.get(member);

        if (sockets) {
          var unreadCount = await Chat.countDocuments({
            receiverid: member,
            read: false,
          });

          for (const socket of sockets) {
            if (socket) {
              socket.emit("newMessageInClub", newMessage);
              if (member != senderid.toString()) {
                socket.emit("unreadMessagesCount", {
                  count: unreadCount,
                });
              }
            }
          }
        }

        if (member != senderid.toString()) {
          await sendNotification(
            member,
            `${clubOwner.firstname + " " + clubOwner.lastname}'s Club`,
            truncateString(message, 20),
            "clubChat",
            clubid,
          );
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("guestInvite", async (data) => {
    try {
      const { streamid, userid } = data;

      const userSockets = onlineSockets.get(userid.toString());

      if (userSockets) {
        for (const socket of userSockets) {
          if (socket) {
            socket.emit("guestInviteRequest", {
              streamid,
              userid,
            });
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("removeModeratorInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.moderators.includes(userid)) {
        await stream.updateOne({
          $pull: { moderators: userid },
        });
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

      const members = stream.members;

      const newModerator = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("removedModerator", newModerator);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("unblockInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.blocked.includes(userid)) {
        await stream.updateOne({
          $pull: { blocked: userid },
        });
      }

      const members = stream.members;

      const newUnblocked = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newUnblockInStream", newUnblocked);
            }
          }
        }
      }

      const socketsuserid = onlineSockets.get(userid.toString());

      if (socketsuserid) {
        for (const socket of socketsuserid) {
          if (socket) {
            socket.emit("newUnblockInStream", newUnblocked);
          }
        }
      }

      await stream.updateOne({
        $push: { members: userid },
      });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("sendMediaInClub", async (data) => {
    try {
      const { messageid, senderid, clubid, roomid, mimeType, file } = data;
      var user = await User.findById(senderid);
      const club = await Club.findById(clubid);

      if (!user) {
        throw Error("User Not Found");
      }

      if (!club) {
        throw Error("Club Not Found");
      }
      var clubOwner = await User.findById(club.userid);

      const members = club.members;

      const chat = await ClubChat.create({ senderid, clubid, roomid });

      let media = randomName();
      const params = {
        Bucket: bucketName,
        Key: media,
        Body: file,
        ContentType: mimeType,
      };

      const command = new PutObjectCommand(params);
      await s3.send(command);

      await chat.updateOne({
        media,
      });

      let getObjectParams = {
        Bucket: bucketName,
        Key: media,
      };
      let command2 = new GetObjectCommand(getObjectParams);
      const contentURL = await getSignedUrl(s3, command2, {
        expiresIn: "604800",
      });

      user.profilePicture = await aws.getLinkFromAWS(user.profilePicture);
      var host = club.userid == senderid;

      let newMedia = {
        _id: chat._id,
        messageid,
        senderid,
        clubid,
        contentType: mimeType,
        contentURL,
        username: user.username,
        profilePicture: user.profilePicture,
        host,
        roomid,
        createdAt: chat.createdAt,
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newMediaInClub", newMedia);
            }
          }
        }
        if (member.toString() != senderid.toString()) {
          await sendNotification(
            member.toString(),
            `${clubOwner.firstname + " " + clubOwner.lastname}'s Club`,
            `Sent you ${mimeType.split("/")[0]}`,
            "clubChat",
            clubid,
          );
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("blockInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (!stream.blocked.includes(userid)) {
        await stream.updateOne({
          $push: { blocked: userid },
        });
      }

      if (stream.members.includes(userid)) {
        await stream.updateOne({
          $pull: { members: userid },
        });
      }

      if (stream.moderators.includes(userid)) {
        await stream.updateOne({
          $pull: { moderators: userid },
        });
      }

      const members = stream.members;

      const newBlocked = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newBlockInStream", newBlocked);
            }
          }
        }
      }

      await stream.updateOne({
        $pull: { members: userid },
      });

      await stream.updateOne({
        $pull: { moderators: userid },
      });
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("unblockInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.blocked.includes(userid)) {
        await stream.updateOne({
          $pull: { blocked: userid },
        });
      }

      const members = stream.members;

      const newUnblocked = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newUnblockInStream", newUnblocked);
            }
          }
        }
      }

      const socketsuserid = onlineSockets.get(userid.toString());

      if (socketsuserid) {
        for (const socket of socketsuserid) {
          if (socket) {
            socket.emit("newUnblockInStream", newUnblocked);
          }
        }
      }

      await stream.updateOne({
        $push: { members: userid },
      });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("makeModeratorInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (!stream.moderators.includes(userid)) {
        await stream.updateOne({
          $push: { moderators: userid },
        });
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

      const members = stream.members;

      const newModerator = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newModerator", newModerator);
            }
          }
        }
      }

      // await stream.updateOne({
      //   $pull: { members: userid },
      // });

      // await stream.updateOne({
      //   $pull: { moderators: userid },
      // });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("removeModeratorInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.moderators.includes(userid)) {
        await stream.updateOne({
          $pull: { moderators: userid },
        });
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

      const members = stream.members;

      const newModerator = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("removedModerator", newModerator);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("unblockInStream", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.blocked.includes(userid)) {
        await stream.updateOne({
          $pull: { blocked: userid },
        });
      }

      const members = stream.members;

      const newUnblocked = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newUnblockInStream", newUnblocked);
            }
          }
        }
      }

      const socketsuserid = onlineSockets.get(userid.toString());

      if (socketsuserid) {
        for (const socket of socketsuserid) {
          if (socket) {
            socket.emit("newUnblockInStream", newUnblocked);
          }
        }
      }

      await stream.updateOne({
        $push: { members: userid },
      });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("streamActionSend", async (data) => {
    try {
      var { streamid, action, moderatorid } = data;
      var stream = await Stream.findById(streamid);
      if (stream) {
        var moderator = await User.findById(moderatorid);
        const members = stream.members;
        var profilePic = await getPicUrl(moderatorid);
        if (action == "mute") {
          if (stream.muted) {
            action = "loud";
            await stream.updateOne({ muted: false });
          } else {
            await stream.updateOne({ muted: true });
          }
        }
        const response = {
          streamid,
          action,
          streamer: moderator._id,
          username: moderator.username,
          profilePic,
          liveRemoteId: moderator.liveRemoteId,
        };

        for (const member of members) {
          const sockets = onlineSockets.get(member.toString());
          if (sockets) {
            for (const socket of sockets) {
              if (socket) {
                socket.emit("streamActionReceive", response);
              }
            }
          }
        }
      } else {
        throw Error("Stream not found");
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("muteUser", async (data) => {
    try {
      var { userid, streamid, muteTime } = data;
      var startTimer = false;
      var stream = await Stream.findById(streamid);
      var user = await User.findById(userid);
      if (stream && user) {
        var streamOwner = await User.findById(stream.userid);
        var profilePic = await getPicUrl(userid);
        if (stream.mutes.includes(userid)) {
          action = "unmute";
          stream.mutes.pull(userid);
          await stream.save();
        } else {
          action = "mute";
          stream.mutes.push(userid);
          await stream.save();
          if (muteTime) {
            startTimer = true;
          }
        }
        const response = {
          streamid,
          action,
          userid,
          liveRemoteId: user.liveRemoteId,
          username: user.username,
          profilePic,
        };

        var members = stream.members;
        for (const member of members) {
          const sockets = onlineSockets.get(member.toString());
          if (sockets) {
            for (const socket of sockets) {
              if (socket) {
                socket.emit("userMute", response);
              }
            }
          }
        }

        if (startTimer) {
          setTimeout(
            async () => {
              response.action = "unmute";
              var updatedStream = await Stream.findById(streamid);
              if (stream.mutes.includes(userid)) {
                stream.mutes.pull(userid);
                await stream.save();
                members = updatedStream.members;

                for (const member of members) {
                  const sockets = onlineSockets.get(member.toString());
                  if (sockets) {
                    for (const socket of sockets) {
                      if (socket) {
                        socket.emit("userMute", response);
                      }
                    }
                  }
                }
              }
            },
            5 * 60 * 1000,
          );
        }
      } else {
        throw Error("Stream or User not found");
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("sendBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      const streamOwner = stream.userid;
      const user = await User.findById(userid);
      if (!user) {
        throw Error("User Not Found");
      }

      const members = stream.members;

      const newRequest = {
        userid: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
        streamid,
      };

      const sockets = onlineSockets.get(streamOwner._id.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("newBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("acceptBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.members.includes(userid)) {
        await stream.updateOne({
          $pull: { members: userid },
        });
        await stream.updateOne({
          $push: { broadcasters: userid },
        });
        var streamOwner = await User.findById(stream.userid);
        if (!streamOwner.presentBroadcasters.includes(userid)) {
          await streamOwner.updateOne({
            $push: { presentBroadcasters: userid },
          });
        }
      }
      var streamOwnerName = streamOwner.username;
      await sendNotification(
        userid,
        "Request Accepted",
        `${streamOwner.firstname + " " + streamOwner.lastname} has accepted your request to join as Broadcaster.`,
        {
          action: "accptedRequest",
          streamid: stream._id,
          channel: stream.channelName,
          token: stream.token,
        },
      );
      var channel = stream.channelName;
      var token = stream.token;
      await createActivity(
        userid,
        streamOwner._id,
        `Accepted your request to join as Broadcaster.`,
        stream._id,
        undefined,
        channel,
        token,
      );

      const newRequest = {
        _id: stream._id,
        channelName: stream.channelName,
        token: stream.token,
      };

      const sockets = onlineSockets.get(userid.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("acceptedBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("rejectBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      const newRequest = {
        _id: stream._id,
      };

      const sockets = onlineSockets.get(userid.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("rejectedBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("muteUserInVoicemeet", async (data) => {
    try {
      var { userid, streamid, muteTime, mutedBy = "user" } = data;
      var startTimer = false;
      var stream = await Voicemeet.findById(streamid);
      var user = await User.findById(userid);
      if (stream && user) {
        var streamOwner = await User.findById(stream.userid);
        var profilePic = await getPicUrl(userid);
        if (stream.mutes.includes(userid)) {
          action = "unmute";
          stream.mutes.pull(userid);
          await stream.save();
        } else {
          action = "mute";
          stream.mutes.push(userid);
          await stream.save();
          if (muteTime) {
            startTimer = true;
          }
        }
        const response = {
          streamid,
          action,
          userid,
          liveRemoteId: user.liveRemoteId,
          username: user.username,
          profilePic,
          mutedBy,
        };

        var members = stream.members;
        for (const member of members) {
          const sockets = onlineSockets.get(member.toString());
          if (sockets) {
            for (const socket of sockets) {
              if (socket) {
                socket.emit("userMute", response);
              }
            }
          }
        }

        if (startTimer) {
          setTimeout(
            async () => {
              response.action = "unmute";
              var updatedStream = await Voicemeet.findById(streamid);
              if (stream.mutes.includes(userid)) {
                stream.mutes.pull(userid);
                await stream.save();
                members = updatedStream.members;

                for (const member of members) {
                  const sockets = onlineSockets.get(member.toString());
                  if (sockets) {
                    for (const socket of sockets) {
                      if (socket) {
                        socket.emit("userMute", response);
                      }
                    }
                  }
                }
              }
            },
            5 * 60 * 1000,
          );
        }
      } else {
        throw Error("Stream or User not found");
      }
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("pinCommentInStream", async (data) => {
    try {
      const { streamid, image, comment, userName, userId } = data;

      const stream = await Stream.findById(streamid);
      if (!stream) throw Error("Stream not found");

      stream.pinComment = {
        image,
        comment,
        userName,
        userId,
        timestamp: new Date(),
      };
      await stream.save();

      const payload = {
        streamid,
        image,
        comment,
        userName,
        userId,
      };

      for (const memberId of stream.members) {
        const sockets = onlineSockets.get(memberId.toString());
        if (sockets) {
          for (const socket of sockets) {
            socket.emit("commentPinned", payload);
          }
        }
      }

      setTimeout(async () => {
        const updatedStream = await Stream.findById(streamid);
        if (updatedStream && updatedStream.pinComment) {
          updatedStream.pinComment = undefined;
          await updatedStream.save();

          for (const memberId of updatedStream.members) {
            const sockets = onlineSockets.get(memberId.toString());
            if (sockets) {
              for (const socket of sockets) {
                socket.emit("commentUnpinned", { streamid });
              }
            }
          }
        }
      }, 20000);
    } catch (err) {
      console.error("❌ Error in pinComment:", err);
    }
  });

  socket.on("unpinCommentInStream", async (data) => {
    try {
      const { streamid } = data;

      const stream = await Stream.findById(streamid);
      if (!stream) throw Error("Stream not found");

      // Clear pinComment field
      stream.pinComment = undefined;
      await stream.save();

      // Broadcast unpin event to all members
      for (const memberId of stream.members) {
        const sockets = onlineSockets.get(memberId.toString());
        if (sockets) {
          for (const socket of sockets) {
            socket.emit("commentUnpinned", { streamid });
          }
        }
      }
    } catch (err) {
      console.error("❌ Error in unpinCommentInStream:", err);
    }
  });

  socket.on("sendBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      if (!stream) {
        throw Error("Stream Not Found");
      }

      const streamOwner = stream.userid;
      const user = await User.findById(userid);
      if (!user) {
        throw Error("User Not Found");
      }

      const newRequest = {
        userid: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
        streamid,
      };

      // Create a set of user IDs to notify: stream owner + moderators
      const targetUserIds = new Set([
        streamOwner.toString(),
        ...stream.moderators.map((modId) => modId.toString()),
      ]);

      // Emit the event to all their online sockets
      for (const userId of targetUserIds) {
        const sockets = onlineSockets.get(userId);
        if (sockets) {
          for (const sock of sockets) {
            if (sock) {
              sock.emit("newBroadcasterRequest", newRequest);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("acceptBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.members.includes(userid)) {
        await stream.updateOne({
          $pull: { members: userid },
        });
        await stream.updateOne({
          $push: { broadcasters: userid },
        });
        var streamOwner = await User.findById(stream.userid);
        if (!streamOwner.presentBroadcasters.includes(userid)) {
          await streamOwner.updateOne({
            $push: { presentBroadcasters: userid },
          });
        }
      }
      var streamOwnerName = streamOwner.username;
      await sendNotification(
        userid,
        "Request Accepted",
        `${streamOwner.firstname + " " + streamOwner.lastname} has accepted your request to join as Broadcaster.`,
        {
          action: "accptedRequest",
          streamid: stream._id,
          channel: stream.channelName,
          token: stream.token,
        },
      );
      var channel = stream.channelName;
      var token = stream.token;
      await createActivity(
        userid,
        streamOwner._id,
        `Accepted your request to join as Broadcaster.`,
        stream._id,
        undefined,
        channel,
        token,
      );

      const newRequest = {
        _id: stream._id,
        channelName: stream.channelName,
        token: stream.token,
      };

      const sockets = onlineSockets.get(userid.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("acceptedBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("rejectBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Stream.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      const newRequest = {
        _id: stream._id,
      };

      const sockets = onlineSockets.get(userid.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("rejectedBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });
  socket.on("sendBroadcasterRequestInVoicemeet", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      const streamOwner = stream.userid;
      const user = await User.findById(userid);
      if (!user) {
        throw Error("User Not Found");
      }

      const members = stream.members;

      const newRequest = {
        userid: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
        streamid,
      };

      const sockets = onlineSockets.get(streamOwner._id.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("newBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("acceptBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.members.includes(userid)) {
        await stream.updateOne({
          $pull: { members: userid },
        });
        await stream.updateOne({
          $push: { broadcasters: userid },
        });
        var streamOwner = await User.findById(stream.userid);
        if (!streamOwner.presentBroadcasters.includes(userid)) {
          await streamOwner.updateOne({
            $push: { presentBroadcasters: userid },
          });
        }
      }
      var streamOwnerName = streamOwner.username;
      await sendNotification(
        userid,
        "Request Accepted",
        `${streamOwner.firstname + " " + streamOwner.lastname} has accepted your request to join as Broadcaster.`,
        {
          action: "accptedRequest",
          streamid: stream._id,
          channel: stream.channelName,
          token: stream.token,
        },
      );
      var channel = stream.channelName;
      var token = stream.token;
      await createActivity(
        userid,
        streamOwner._id,
        `Accepted your request to join as Broadcaster.`,
        undefined,
        undefined,
        channel,
        token,
        stream._id,
      );

      const newRequest = {
        _id: stream._id,
        channelName: stream.channelName,
        token: stream.token,
      };

      const sockets = onlineSockets.get(userid.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("acceptedBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("rejectBroadcasterRequest", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      const newRequest = {
        _id: stream._id,
      };

      const sockets = onlineSockets.get(userid.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("rejectedBroadcasterRequest", newRequest);
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("makeModeratorInVoicemeet", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (!stream.moderators.includes(userid)) {
        await stream.updateOne({
          $push: { moderators: userid },
        });
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

      const members = stream.members;

      const newModerator = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newModerator", newModerator);
            }
          }
        }
      }

      // await stream.updateOne({
      //   $pull: { members: userid },
      // });

      // await stream.updateOne({
      //   $pull: { moderators: userid },
      // });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("removeModeratorInVoicemeet", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.moderators.includes(userid)) {
        await stream.updateOne({
          $pull: { moderators: userid },
        });
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

      const members = stream.members;

      const newModerator = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("removedModerator", newModerator);
            }
          }
        }
      }
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("blockInVoicemeet", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (!stream.blocked.includes(userid)) {
        await stream.updateOne({
          $push: { blocked: userid },
        });
      }

      if (stream.members.includes(userid)) {
        await stream.updateOne({
          $pull: { members: userid },
        });
      }

      if (stream.moderators.includes(userid)) {
        await stream.updateOne({
          $pull: { moderators: userid },
        });
      }

      const members = stream.members;

      const newBlocked = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newBlockInStream", newBlocked);
            }
          }
        }
      }

      await stream.updateOne({
        $pull: { members: userid },
      });

      await stream.updateOne({
        $pull: { moderators: userid },
      });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("unblockInVoicemeet", async (data) => {
    try {
      const { streamid, userid } = data;
      const stream = await Voicemeet.findById(streamid);
      const user = await User.findById(userid);
      if (!stream) {
        throw Error("Stream Not Found");
      }
      if (!user) {
        throw Error("User Not Found");
      }

      if (stream.blocked.includes(userid)) {
        await stream.updateOne({
          $pull: { blocked: userid },
        });
      }

      const members = stream.members;

      const newUnblocked = {
        _id: user._id,
        username: user.username,
        profilePic: await getPicUrl(user._id),
      };

      for (const member of members) {
        const sockets = onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newUnblockInStream", newUnblocked);
            }
          }
        }
      }

      const socketsuserid = onlineSockets.get(userid.toString());

      if (socketsuserid) {
        for (const socket of socketsuserid) {
          if (socket) {
            socket.emit("newUnblockInStream", newUnblocked);
          }
        }
      }

      await stream.updateOne({
        $push: { members: userid },
      });
    } catch (error) {
      console.log(error);
    }
  });

  socket.on("actionSendInVoiceMeet", async (data) => {
    try {
      var { streamid, action, userid } = data;
      var stream = await Voicemeet.findById(streamid);
      if (stream) {
        var moderator = await User.findById(userid);
        const members = stream.members;
        var profilePic = await getPicUrl(userid);
        if (action == "mute") {
          if (stream.muted) {
            action = "loud";
            await stream.updateOne({ muted: false });
          } else {
            await stream.updateOne({ muted: true });
          }
        }
        const response = {
          streamid,
          action,
          userid: moderator._id,
          username: moderator.username,
          profilePic,
          liveRemoteId: moderator.liveRemoteId,
        };

        for (const member of members) {
          const sockets = onlineSockets.get(member.toString());
          if (sockets) {
            for (const socket of sockets) {
              if (socket) {
                socket.emit("streamActionReceive", response);
              }
            }
          }
        }
      } else {
        console.log("Stream not found");
      }
    } catch (error) {
      console.log(error);
    }
  });
});

const reset = async () => {
  var users = await User.find({ liveAccess: true });
  await Promise.all(
    users.map(async (user) => {
      await user.updateOne({
        liveAccess: false,
      });
    }),
  );

  console.log("all done");
};

// reset();

const cors = require("cors");
require("dotenv").config();

const sharp = require("sharp");
app.post("/giftopng", upload.single("gif"), async (req, res) => {
  var gif = await aws.uploadToAWS(req.file);
  var thumbnail = await sharp(req.file.buffer)
    .resize(300, 300)
    .png()
    .toBuffer();

  var thumbnailFie = {
    buffer: thumbnail,
    mimetype: "image/png",
  };
  thumbnail = await aws.uploadToAWS(thumbnailFie);

  res.send({
    message: "done",
    link: await aws.getLinkFromAWS(thumbnail),
  });
});
app.use(cors());
app.use(express.json({ limit: "100mb" }));
app.post("/version", async (req, res) => {
  console.log(req.body);
  var { version, os } = req.body;
  if (!os) {
    throw Error("Please add os");
  }
  if (!["android", "apple"].includes(os)) {
    throw Error("Please select one of android or apple os");
  }

  const options = { upsert: true, new: true };
  await System.findOneAndUpdate(
    { os },
    {
      title: "Frenzone",
      version,
      os,
    },
    options,
  );

  res.status(200).json({
    message: `Version for Frenzone has been updated to ${version}`,
  });
});

app.get("/version/:os", async (req, res) => {
  var { os } = req.params;
  if (!["android", "apple"].includes(os)) {
    throw Error("Please select one of android or apple os");
  }
  var version = await System.findOne({ os });

  res.status(200).json(version);
});

app.get("/apple-app-site-association", (req, res) => {
  res.sendFile(path.join(__dirname, "apple-app-site-association.json"));
});

app.get("/updateWallets", async (req, res) => {
  var users = await User.find({});
  await Promise.all(
    users.map(async (user) => {
      var tag = user.username.trim().split(" ").join("");
      await user.updateOne({
        tag,
      });
    }),
  );

  res.send("done");
});

app.get("/removeclubmembers", async (req, res) => {
  var userid = "6641f13e10b0fafe0b1e5d4a";
  var user = await User.findById(userid);
  var club = await Club.findById(user.clubid);
  await Promise.all(
    club.members.map(async (member) => {
      member = await User.findById(member);
      await member.updateOne({
        $pull: { clubsJoined: user.clubid },
      });
    }),
  );

  await club.updateOne({
    members: [],
  });
  console.log("ran");
  res.send("updated reels");
});

app.use("/.well-known", express.static(path.join(__dirname, ".well-known")));

const authRoutes = require("./routes/authRoutes");
const postRoutes = require("./routes/postRoutes");
const userRoutes = require("./routes/userRoutes");
const walletRoutes = require("./routes/walletRoutes");
const chatRoutes = require("./routes/chatRoutes");
const reviewRoutes = require("./routes/reviewRoutes");
const reelRoutes = require("./routes/reelRoutes");
const storyRoutes = require("./routes/storyRoutes");
const clubRoutes = require("./routes/clubRoutes");
const ticketRoutes = require("./routes/ticketRoutes");
const streamRoutes = require("./routes/streamRoutes");
const voicemeetRoutes = require("./routes/voicemeetRoutes");
const adminRoutes = require("./routes/adminRoutes");
const payoutRoutes = require("./routes/payoutRoutes");
const formRoutes = require("./routes/formRoutes");
const activityRoutes = require("./routes/activityRoutes");
const notificationRoutes = require("./routes/notificationRoutes");
const songRoutes = require("./routes/songListRoutes");
const giftRoutes = require("./routes/giftRoutes");
const plaidRoutes = require("./routes/plaidRoutes");
const dynamicLinkRoutes = require("./routes/dynamicLinkRoutes");
const reportRoutes = require("./routes/reportRoutes");
const liveGoalRoutes = require("./routes/liveGoalRoutes");
const productRoutes = require("./routes/productRoutes");
const badgeRoutes = require("./routes/badgeRoutes");

const { getPicUrl } = require("./controllers/userController");
const Voicemeet = require("./models/voicemeetModel");
const globalTransactionRoutes = require("./routes/globalTransactionRoutes");
const adminAuthRoutes = require("./routes/adminAuthRoutes");
const adminApiRoutes = require("./routes/adminApiRoutes");
const {
  creatorApplicationRoutes,
  adminCreatorAgencyRoutes,
} = require("./routes/creator/creatorApplicationRoutes");
const creatorDashboardRoutes = require("./routes/creator/creatorDashboardRoutes");
const creatorSupportRoutes = require("./routes/creator/creatorSupportRoutes");
const {
  agencyRoutes,
  adminAgencyRoutes,
} = require("./routes/agency/agencyRoutes");
const coinRoutes = require("./routes/coins/coinRoutes");
const referralRoutes = require("./routes/referral/referralRoutes");

// routes

app.use("/admin", adminRoutes);
app.use("/admin-auth", adminAuthRoutes);
app.use("/admin-api", adminApiRoutes);
app.use("/admin-api/creator-agency", adminCreatorAgencyRoutes);
app.use("/admin-api/creator-agency/agencies", adminAgencyRoutes);
app.use("/creator/application", creatorApplicationRoutes);
app.use("/creator/support", creatorSupportRoutes);
app.use("/creator", creatorDashboardRoutes);
app.use("/agency", agencyRoutes);
app.use("/coins", coinRoutes);
app.use("/referral", referralRoutes);
app.use("/auth", authRoutes);
app.use("/post", postRoutes);
app.use("/user", userRoutes);
app.use("/wallet", walletRoutes);
app.use("/chat", chatRoutes);
app.use("/review", reviewRoutes);
app.use("/reels", reelRoutes);
app.use("/story", storyRoutes);
app.use("/clubs", clubRoutes);
app.use("/tickets", ticketRoutes);
app.use("/stream", streamRoutes);
app.use("/voicemeet", voicemeetRoutes);
app.use("/form", formRoutes);
app.use("/activity", activityRoutes);
app.use("/notification", notificationRoutes);
app.use("/v1", songRoutes);
app.use("/gift", giftRoutes);
app.use("/plaid", plaidRoutes);
app.use("/dynamicLink", dynamicLinkRoutes);
app.use("/payout", payoutRoutes);
app.use("/report", reportRoutes);
app.use("/global-transactions", globalTransactionRoutes);
app.use("/livegoal", liveGoalRoutes);
app.use("/product", productRoutes);
app.use("/badge", badgeRoutes);

app.get("/api/health", (req, res) => {
  res.status(200).json({ status: "Running version 8" });
});

async function updateTags() {
  var clubs = await Club.find({});
  await Promise.all(
    clubs.map(async (club) => {
      var user = await User.findById(club.userid);
      if (user) {
        if (club.clubType != "secondary" && club.primaryRoom) {
          await user.updateOne({
            clubid: club._id,
          });
        }
      }
    }),
  );
  console.log("done update tags");
}

// updateTags();

app.post("/lemverify-webhook", async (req, res) => {
  var { friendlyId, result } = req.body;
  var user = await User.findById(friendlyId);
  if (user) {
    if (result == "PASSED") {
      await user.updateOne({
        lemVerified: true,
      });
    } else {
      await user.updateOne({
        lemVerifyRejected: true,
      });
    }
  }
  console.log(`userid: ${friendlyId} has ${result} the verification test`);
  res.send(`${req.method} Route ${req.path} found !`);
});

function renderDeepLinkLanding(req, res) {
  const fullUrl = `${req.protocol}://${req.get("host")}${req.originalUrl}`;
  const id = req.params.id || "";
  const type = req.params.type || "";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<title>Opening in FrenZone</title>
<meta name="viewport" content="width=device-width, initial-scale=1.0">

<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">

<style>
*{
  box-sizing:border-box;
  margin:0;
  padding:0;
}

body{
  font-family:'Inter',system-ui,-apple-system,BlinkMacSystemFont,sans-serif;
  background: radial-gradient(circle at top,#1a1a1a,#050505);
  color:#fff;
  height:100vh;
  display:flex;
  align-items:center;
  justify-content:center;
  padding:20px;
}

.container{
  width:100%;
  max-width:460px;
}

.card{
  background:#0f0f0f;
  border-radius:18px;
  padding:36px 28px;
  text-align:center;
  box-shadow:0 20px 60px rgba(0,0,0,0.6);
  border:1px solid rgba(255,255,255,0.05);
}

.logo{
  font-size:28px;
  font-weight:700;
  letter-spacing:.4px;
  margin-bottom:6px;
  background:linear-gradient(90deg,#ff9700,#ffb347);
  -webkit-background-clip:text;
  -webkit-text-fill-color:transparent;
}

.subtitle{
  font-size:13px;
  color:#888;
  margin-bottom:28px;
}

.loader{
  width:40px;
  height:40px;
  border-radius:50%;
  border:3px solid rgba(255,255,255,0.1);
  border-top:3px solid #ff9700;
  animation:spin 1s linear infinite;
  margin:0 auto 20px;
}

@keyframes spin{
  to{ transform:rotate(360deg); }
}

h1{
  font-size:20px;
  font-weight:600;
  margin-bottom:12px;
}

p{
  font-size:14px;
  color:#b8b8b8;
  line-height:1.6;
}

code{
  font-size:12px;
  color:#9b9b9b;
  word-break:break-all;
}

.button{
  display:inline-block;
  margin-top:24px;
  padding:12px 26px;
  border-radius:999px;
  background:linear-gradient(135deg,#ff9700,#ffb347);
  color:#050505;
  text-decoration:none;
  font-weight:600;
  font-size:14px;
  transition:.25s ease;
}

.button:hover{
  transform:translateY(-2px);
  box-shadow:0 8px 20px rgba(255,151,0,.4);
}

.meta{
  margin-top:18px;
  font-size:11px;
  color:#777;
}

.footer{
  text-align:center;
  margin-top:18px;
  font-size:11px;
  color:#666;
}

@media (max-width:420px){
  .card{
    padding:28px 20px;
  }
}
</style>

<script>
function openApp(){
  window.location.href = "frenzone://${type}/${id}";
}

setTimeout(openApp, 300);
</script>

</head>

<body>

<div class="container">

<div class="card">

<div class="logo">FrenZone</div>
<div class="subtitle">Social Experiences Reimagined</div>

<div class="loader"></div>

<h1>Opening in the FrenZone App</h1>

<p>If nothing happens, tap the button below to continue.</p>

<a class="button" href="frenzone://${type}/${id}">Open FrenZone</a>

${id ? `<div class="meta">Content ID: <code>${id}</code></div>` : ""}

<div class="meta">
Link: <code>${fullUrl}</code>
</div>

</div>

<div class="footer">
© ${new Date().getFullYear()} FrenZone
</div>

</div>

</body>
</html>
  `;

  res.status(200).type("html").send(html);
}

// Post deep links: https://app.frenzone.live/post/:id
// app.get("/post/:id", renderDeepLinkLanding);
// // Reel deep links: https://app.frenzone.live/blink/:id
// app.get("/blink/:id", renderDeepLinkLanding);
// // Profile deep links: https://app.frenzone.live/profile/:id
// app.get("/profile/:id", renderDeepLinkLanding);

// Dynamic deep link route
app.get("/:type(post|blink|profile)/:id", renderDeepLinkLanding);

app.use("/", (req, res) => {
  res.status(400).send(`${req.method} Route ${req.path} not found !`);
});

// Connect to DB then Run Server
connectDB()
  .then(() => {
    const PORT = process.env.PORT || 5000;
    server.listen(PORT, () => {
      console.log(`Connected to DB and Server is Running on port ${PORT}`);
    });
  })
  .catch((error) => {
    console.log(error);
  });
