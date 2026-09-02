const Story = require("../models/storyModel");
const User = require("../models/userModel");
const Stream = require("../models/streamModel");
const Chat = require("../models/chatModel");
const Thread = require("../models/threadModel");
const Activity = require("../models/activityModel");
const { aws } = require("../helpers/otherHelpers");
const {
  authorizeMessageSend,
  isConversationMuted,
} = require("../services/privacyAccessService");

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

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const canViewAccountContent = (user, viewerId) =>
  !user.isPrivate ||
  user._id.toString() === viewerId?.toString() ||
  (user.followers || []).some(
    followerId => followerId.toString() === viewerId?.toString(),
  );

const postStory = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (req.files.length == 0) {
      throw Error("Cannot Upload Empty Story");
    }

    var contentName = null
    var contentType = null
    for (const content of req.files) {
      const story = await Story.create({
        userid,
      });
      contentName = randomName();
      const params = {
        Bucket: bucketName,
        Key: contentName,
        Body: content.buffer,
        ContentType: content.mimetype,
      };

      const command = new PutObjectCommand(params);
      await s3.send(command);

      contentType = content.mimetype
      await story.updateOne({
        content: contentName,
        contentType
      });

      await user.updateOne({
        $push: { stories: story._id },
      });
      await Promise.all(
        user.followers.map(async userid => {
          // await createActivity(
          //   userid,
          //   user._id,
          //   `${user.username} posted as story`,
          //   null,
          //   story._id,
          //   null,
          //   null,
          //   null,
          //   true,
          //   null,
          //   "story"
          // );

          var notificationTitle = `New Story`;
          var notificationBody = `posted as new story`;
          await sendNotification(
            userid,
            notificationTitle,
            `${user.firstname + " " + user.lastname} ${notificationBody}`,
            "story",
            story._id
          );
          // await createActivity(
          //   userid,
          //   user._id,
          //   notificationBody,
          //   undefined,
          //   story._id,
          //   null,
          //   null,
          //   null,
          //   false,
          //   null,
          //   "story",
          //   {story: await storyDataById(story._id)}
          // );

          var streamid = ""
          if (user.isLive) {
            const stream = await Stream.findOne({ userid }).select("_id");
            if (stream) {
              streamid = stream._id;
            }
          }

          var storyDetail = {
            userid: user._id,
            username: user.username,
            profilePicture: await getPicUrl(user._id),
            isVerified: user.isVerified,
            isLive: user.isLive,
            streamid,
            story: {
              _id: story._id,
              url: await aws.getLinkFromAWS(contentName),
              contentType,
              likes: [],
              viewedBy: []
            }
          };

          var socketActivity = global.onlineSockets.get(userid.toString());

          if (contentName && contentType) {
            if (socketActivity) {
              for (const socket of socketActivity) {
                if (socket) {
                  socket.emit("newStoryPosted", storyDetail);
                }
              }
            }
          }
        })
      )
    }


    res.status(200).json({
      message: "Story Posted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getStories = async (req, res) => {
  try {
    const userid = req.params.userid;
    if (userid?.toString() !== req.userId?.toString()) {
      return res.status(403).json({
        success: false,
        message: "You can only load your own story feed",
      });
    }
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    var userId = user._id;

    const currentDate = new Date(Date.now());
    stories = await Promise.all(
      user.following.map(async (userid) => {
        let user = await User.findById(userid);
        if (user) {
          var viewed = false;
          let userStories = await Story.find({
            userid,
            expiresAt: { $gt: currentDate },
          }).sort({ createdAt: "asc" });
          userStories = await Promise.all(
            userStories.map(async (story) => {
              let params = {
                Bucket: bucketName,
                Key: story.content,
              };

              const command = new GetObjectCommand(params);
              const command2 = new HeadObjectCommand(params);
              const object = await s3.send(command2);
              const contentType = object.ContentType;
              const url = await getSignedUrl(s3, command, {
                expiresIn: "604800",
              });
              if (story.viewedBy.includes(userId)) {
                viewed = true
              }
              return {
                _id: story._id,
                createdAt: story.createdAt,
                contentType,
                url,
                likes: story.likes,
                viewedBy: story.viewedBy || []
              };
            })
          );
          let streamid = "";

          if (user.isLive) {
            const stream = await Stream.findOne({ userid }).select("_id");
            if (stream) {
              streamid = stream._id;
            }
          }

          userdetail = {
            userid: user._id,
            username: user.username,
            profilePicture: await getPicUrl(user._id),
            isVerified: user.isVerified,
            isLive: user.isLive,
            streamid,
            stories: userStories,
            viewed
          };
          if (userStories.length != 0) {
            userdetail.latestTimes =
              userStories[userStories.length - 1].createdAt;
          } else {
            userdetail.latestTimes = new Date("1990-01-01");
          }

          return userdetail;
        }
      })
    );
    stories = stories.filter((item) => item !== null);
    stories.sort((a, b) => b.latestTimes - a.latestTimes);
    stories = stories.map((story) => {
      delete story.latestTimes;
      return story;
    });

    const liveStories = stories.filter(story => story.isLive);
    const nonLiveStories = stories.filter(story => !story.isLive);

    const unviewedNonLive = nonLiveStories.filter(story => !story.viewed);
    const viewedNonLive = nonLiveStories.filter(story => story.viewed);

    const sortedStories = [...liveStories, ...unviewedNonLive, ...viewedNonLive];

    res.status(200).json({
      stories: sortedStories,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getUserStory = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!canViewAccountContent(user, req.userId)) {
      return res.status(200).json({
        stories: [],
        privateContentHidden: true,
      });
    }

    const currentDate = new Date(Date.now());

    const userStories = await Story.find({
      userid,
      expiresAt: { $gt: currentDate },
    }).sort({ createdAt: "asc" });

    const stories = await Promise.all(
      userStories.map(async (story) => {
        let params = {
          Bucket: bucketName,
          Key: story.content,
        };

        const command = new GetObjectCommand(params);
        const command2 = new HeadObjectCommand(params);
        const object = await s3.send(command2);
        const contentType = object.ContentType;
        const url = await getSignedUrl(s3, command, { expiresIn: "604800" });
        return {
          _id: story._id,
          createdAt: story.createdAt,
          contentType,
          url,
          likes: story.likes,
          viewedBy: story.viewedBy || []
        };
      })
    );

    let streamid = "";

    if (user.isLive) {
      const stream = await Stream.findOne({ userid }).select("_id");
      if (stream) {
        streamid = stream._id;
      }
    }

    res.status(200).json({
      userid: user._id,
      username: user.username,
      profilePicture: await getPicUrl(user._id),
      isVerified: user.isVerified,
      isLive: user.isLive,
      streamid,
      stories,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const deleteStory = async (req, res) => {
  try {
    const storyid = req.body.storyid;
    const story = await Story.findById(storyid);
    if (!story) {
      throw Error("Story Not Found");
    }

    const user = await User.findById(story.userid);
    if (!user) {
      throw Error("User Not Found");
    }

    const params = {
      Bucket: bucketName,
      Key: story.content,
    };
    const command = new DeleteObjectCommand(params);
    await s3.send(command);

    await user.updateOne({
      $pull: { stories: storyid },
    });

    await story.deleteOne();

    res.status(200).json({
      message: "Story deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getStoryById = async (req, res) => {
  try {
    const storyid = req.params.storyid;

    const story = await Story.findById(storyid).lean();
    if (!story) throw Error("Story Not Found");
    const owner = await User.findById(story.userid)
      .select("_id isPrivate followers")
      .lean();
    if (!owner) throw Error("User Not Found");
    if (!canViewAccountContent(owner, req.userId)) {
      return res.status(403).json({
        success: false,
        message: "This account is private",
      });
    }
    story.content = await aws.getLinkFromAWS(story.content)

    res.status(200).json({ story });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const storyDataById = async (id) => {

  const story = await Story.findById(id).lean();
  story.content = await aws.getLinkFromAWS(story.content)

  return story;
}

const { getPicUrl } = require("../controllers/userController");
const { createActivity } = require("./activityController");
const { sendNotification } = require("./notificationController");

// const likeStory = async (req, res) => {
//   try {
//     var storyid = req.body.storyid;
//     const story = await Story.findById(req.body.storyid);
//     const userid = req.body.userid;
//     const user = await User.findById(userid);

//     if (!user) {
//       throw Error("User Not Found");
//     }

//     if (!story) {
//       throw Error("story Not Found");
//     }

//     if (story.likes.includes(user._id)) {
//       await story.updateOne({ $pull: { likes: user._id } });
//       await Activity.deleteMany({
//         otheruserid: userid,
//         storyid,
//       });
//       res.status(200).json({
//         message: "story Unliked",
//       });

//     } else {
//       await story.updateOne({ $push: { likes: user._id } });
//       if (userid != story.userid) {
//         await sendNotification(
//           story.userid,
//           "story Liked",
//           `${user.firstname + " " + user.lastname} liked your story`,
//           "story",
//           story._id
//         );

//         await createActivity(
//           story.userid,
//           userid,
//           "liked your story",
//           undefined,
//           story._id,
//           null,
//           null,
//           null,
//           null,
//           null,
//           "story"
//         );
//       }

//       res.status(200).json({
//         message: "story Liked",
//       });
//     }
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };

const likeStory = async (req, res) => {
  try {
    var storyid = req.body.storyid;
    var story = await Story.findById(storyid);
    const userid = req.body.userid;
    const user = await User.findById(userid);
    const message = "❤️";
    if (!user) {
      throw Error("User Not Found");
    }

    if (!story) {
      throw Error("story Not Found");
    }

    var action = "liked"
    var likes = story.likes.map(like => { return like.toString() })
    if (likes.includes(userid)) {
      await story.updateOne({
        $pull: {
          likes: userid
        }
      })
      action = "unliked"
    } else {
      story = story.toObject()
      story.content = await aws.getLinkFromAWS(story.content)

      await sendMessageCustom(userid, story.userid, message, story._id, "story", story)
      if (userid != story.userid) {
        await sendNotification(
          story.userid,
          "story Liked",
          `${user.firstname + " " + user.lastname} liked your story`,
          "story",
          story._id
        );

        await createActivity(
          story.userid,
          userid,
          "liked your story",
          undefined,
          story._id,
          null,
          null,
          null,
          null,
          null,
          "story"
        );


        story = await Story.findById(storyid);
        await story.updateOne({
          $push: {
            likes: userid
          }
        })
      }
    }

    res.status(200).json({
      message: "story " + action,
    });
  } catch (error) {
    console.log("error", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

const viewStory = async (req, res) => {
  try {
    var storyid = req.body.storyid;
    const story = await Story.findById(storyid);
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (!story) {
      throw Error("story Not Found");
    }

    await story.updateOne({
      $push: {
        viewedBy: userid
      }
    })

    res.status(200).json({
      message: "story Viewed",
    });
  } catch (error) {
    console.log("error", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

const replyStory = async (req, res) => {
  try {
    var storyid = req.body.storyid;
    const story = await Story.findById(storyid).lean();
    const userid = req.body.userid;
    const user = await User.findById(userid);
    const message = req.body.message;

    if (!user) {
      throw Error("User Not Found");
    }

    if (!story) {
      throw Error("story Not Found");
    }
    story.content = await aws.getLinkFromAWS(story.content)

    await sendMessageCustom(userid, story.userid, message, story._id, "story", story)
    if (userid != story.userid) {
      if (!(await isConversationMuted(story.userid, userid))) {
        await sendNotification(
          story.userid,
          "New story reply",
          `${user.firstname + " " + user.lastname} replied to your story`,
          "story",
          story._id
        );
      }

      await createActivity(
        story.userid,
        userid,
        "liked your story",
        undefined,
        story._id,
        null,
        null,
        null,
        null,
        null,
        "story"
      );
    }

    res.status(200).json({
      message: "story Liked",
    });
  } catch (error) {
    console.log("error", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

async function sendMessageCustom(senderid, receiverid, message, replyof, replyModel, replyofData = null) {
  try {
    var senderSockets = global.onlineSockets.get(senderid.toString());
    var receiverSockets = global.onlineSockets.get(receiverid.toString());
    const sender = await User.findById(senderid);
    const receiver = await User.findById(receiverid);
    if (!sender) {
      throw Error("Sender Not Found");
    }
    if (!receiver) {
      throw Error("Receiver Not Found");
    }
    const access = await authorizeMessageSend(sender, receiver);
    if (!access.canSend) {
      const error = new Error("Messaging is not allowed between these users");
      error.statusCode = 403;
      throw error;
    }

    const chat = await Chat.create({ senderid, receiverid, message, replyof, replyModel, chatType: "reply" });
    if (receiver.is_online == "1") {
      await chat.updateOne({
        delivered: true,
      });

      const senderSockets = global.onlineSockets.get(senderid.toString());
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
              // messageid,
              senderid,
              receiverid,
              message,
              replyof: replyofData ? replyofData : replyof,
              replyModel,
              chatType: "reply"
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
            receiverSocket.emit("threadUpdate", threadUpdate);
            receiverSocket.emit("newMessage", {
              _id: chat._id,
              // messageid,
              senderid,
              receiverid,
              message,
              replyof: replyofData ? replyofData : replyof,
              replyModel,
              chatType: "reply"
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
            senderSocket.emit("threadUpdate", newThread);
            senderSocket.emit("newMessage", {
              _id: chat._id,
              // messageid,
              senderid,
              receiverid,
              message,
              replyof: replyofData ? replyofData : replyof,
              replyModel,
              chatType: "reply"
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
            receiverSocket.emit("threadUpdate", newThread);
            receiverSocket.emit("newMessage", {
              _id: chat._id,
              // messageid,
              senderid,
              receiverid,
              message,
              replyof: replyofData ? replyofData : replyof,
              replyModel,
              chatType: "reply"
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
      thread._id
    );
  } catch (error) {
    console.log(error);
  }
}

module.exports = { postStory, getStories, getUserStory, deleteStory, getStoryById, likeStory, replyStory, viewStory };
