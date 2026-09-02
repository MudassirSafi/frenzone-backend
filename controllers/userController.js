const User = require("../models/userModel");
const Post = require("../models/postModel");
const Reel = require("../models/reelModel");
const OtpPass = require("../models/otpPassModel");
const Story = require("../models/storyModel");
const Activity = require("../models/activityModel");
const Stream = require("../models/streamModel");
const Comment = require("../models/commentModel");
const ReelComment = require("../models/reelCommentModel");
const Chat = require("../models/chatModel");
const ClubChat = require("../models/clubChatModel");
const Thread = require("../models/threadModel");
const Business = require("../models/businessModel");
const Wallet = require("../models/walletModel");
const Club = require("../models/clubModel");
const Gift = require("../models/giftModel");
const BankAccount = require("../models/bankAccountModel");
const PaypalAccount = require("../models/paypalAccountModel");
const Reply = require("../models/replyModel");
const ReelReply = require("../models/reelReplyModel");
const ClubRoom = require("../models/clubRoomModel")
const Transaction = require("../models/transactionModel")
require("dotenv").config();

const mongoose = require("mongoose");
const nodemailer = require("nodemailer");
const bcrypt = require("bcrypt");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const { ApiFeatures } = require("../helpers/ApiFeatures");
const VoiceMeet = require("../models/voicemeetModel");
const axios = require('axios');
const crypto = require('crypto');
const fs = require('fs');
const FormData = require('form-data');
const postReportModel = require("../models/postReportModel");
const reviewModel = require("../models/reviewModel");
const { aws } = require("../helpers/otherHelpers");
const {
  activateOnboarding,
  markOnboardingTask,
  normalizeOnboarding,
} = require("../helpers/newUserOnboardingHelper");
const { sendNotificationUpdated, sendCustomNotification } = require("./notificationController");
const { createActivity } = require("./activityController");
const userReports = require("../models/userReports");
const { updateRankingPointsForUser } = require("../helpers/rankingPoints");
const { usersShareClub } = require("../services/privacyAccessService");
const Badge = require("../models/badgeModel");
const { getBadgeImageUrl } = require("./badgeController");

const MINIMUM_FOLLOWING_COUNT = 5;
const MINIMUM_FOLLOWING_ERROR = "You must follow at least 5 users.";

const canViewAccountContent = (user, viewerId) =>
  !user.isPrivate ||
  user._id.toString() === viewerId?.toString() ||
  (user.followers || []).some(
    followerId => followerId.toString() === viewerId?.toString(),
  );

require("dotenv").config();

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const godaddyEmail = process.env.EMAIL;
const godaddyPassword = process.env.PASSWORD;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const mailTransport = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  auth: {
    user: godaddyEmail,
    pass: godaddyPassword,
  },
  secureConnection: true,
  tls: { ciphers: "SSLv3" },
});
// const blockUser = async (req, res) => {
//   try {
//     const currentUser = await User.findById(req.body.currentUserId);
//     const usertoBlock = await User.findById(req.body.usertoBlockId);
//     if (currentUser.username !== usertoBlock.username) {
//       if (!usertoBlock) {
//         throw Error("User does not exist");
//       }
//       if (!currentUser.blocked.includes(usertoBlock._id)) {
//         await currentUser.updateOne({
//           $push: { blocked: usertoBlock._id },
//         });

//         if (currentUser.following.includes(usertoBlock._id)) {
//           await currentUser.updateOne({
//             $pull: { following: usertoBlock._id },
//           });
//           await usertoBlock.updateOne({
//             $pull: { followers: currentUser._id },
//           });
//         }

//         if (usertoBlock.following.includes(currentUser._id)) {
//           await usertoBlock.updateOne({
//             $pull: { following: currentUser._id },
//           });
//           await currentUser.updateOne({
//             $pull: { followers: usertoBlock._id },
//           });
//         }

//         res.status(200).json({
//           message: "User has been Blocked",
//         });
//       } else if (currentUser.blocked.includes(usertoBlock._id)) {
//         await currentUser.updateOne({
//           $pull: { blocked: usertoBlock._id },
//         });
//         res.status(200).json({
//           message: "User has been UnBlocked",
//         });
//       }
//     }
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };

const blockUser = async (req, res) => {
  try {
    const authenticatedUserId = req.userId || req.authUserId;
    const currentUser = await User.findById(authenticatedUserId);
    const usertoBlock = await User.findById(req.body.usertoBlockId);
    if (!currentUser || !usertoBlock) {
      throw Error("User does not exist");
    }
    if (currentUser.username !== usertoBlock.username) {
      if (!currentUser.blocked.includes(usertoBlock._id)) {
        await currentUser.updateOne({
          $push: { blocked: usertoBlock._id }
        });
        
        if (!usertoBlock.blockedBy.includes(currentUser._id)) {
          await usertoBlock.updateOne({
            $push: { blockedBy: currentUser._id }
          });
        }
  
        if (currentUser.following.includes(usertoBlock._id)) {
          await currentUser.updateOne({
            $pull: { following: usertoBlock._id },
          });
          await usertoBlock.updateOne({
            $pull: { followers: currentUser._id },
          });
        }
  
        if (usertoBlock.following.includes(currentUser._id)) {
          await usertoBlock.updateOne({
            $pull: { following: currentUser._id },
          });
          await currentUser.updateOne({
            $pull: { followers: usertoBlock._id },
          });
        }

        res.status(200).json({
          message: "User has been Blocked",
        });
      }else{
        if (currentUser.blocked.includes(usertoBlock._id)) {
          await currentUser.updateOne({
            $pull: { blocked: usertoBlock._id }
          });
        }

        if (usertoBlock.blockedBy.includes(currentUser._id)) {
          await usertoBlock.updateOne({
            $pull: { blockedBy: currentUser._id }
          });
        }

        res.status(200).json({
          message: "User has been un blocked",
        });
      }
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const blockUserInSystem = async (req, res) => {
  try {
    var userid = req.params.userid
    const user = await User.findById(req.params.userid);
    if(!user){
      return  res.status(400).json({
        success: false,
        message: "User not found"
      });
    }

    if(user.systemBlocked){
      await user.updateOne({
        systemBlocked: false
      })

      await sendCustomNotification(userid, "Account Unblocked", "Your account got unblocked");
      await createActivity(
        userid.toString(),
        undefined,
        `Your account got unblocked`,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "block",
        {reason: "account got unblocked"}
      );

      res.status(200).json({
          message: "User has been unblocked",
        });
    }else{
      await user.updateOne({
        systemBlocked: true
      })

      await sendCustomNotification(userid, "Account Blocked", "Your account got blocked");
      await createActivity(
        userid.toString(),
        undefined,
        `Your account got blocked`,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "block",
        {reason: "account got blocked"}
      );

      res.status(200).json({
          message: "User has been unblocked",
        });
    }
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

const getRestrictedIds = async (req, res) => {
  try {
    const userid = await User.findById(req.params.userid);
    var user = await User.findById(userid);
    if(!user){
      return res.status(400).json({
        success: false,
        message: "User not found!"
      })
    }

    var restrictidIds = [...user.blocked, ...user.blockedBy];

    res.status(200).json({
      success: true,
      restrictidIds
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const unBlockUser = async (req, res) => {
  try {
    const currentUser = await User.findById(req.body.currentUserId);
    const usertoBlock = await User.findById(req.body.usertoBlockId);
    if (currentUser.username !== usertoBlock.username) {
      if (!usertoBlock) {
        throw Error("User does not exist");
      }
      if (currentUser.blocked.includes(usertoBlock._id)) {
        await currentUser.updateOne({
          $pull: { blocked: usertoBlock._id }
        });
      }

      if (usertoBlock.blockedBy.includes(currentUser._id)) {
        await usertoBlock.updateOne({
          $pull: { blockedBy: currentUser._id }
        });
      }
    }
    res.status(200).json({
      message: "User has been un blocked",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getUserById = async (req, res) => {
  try {
    const userid = req.params.userid;
    let user = await User.findById(userid).select("-password -followRequests");
    if (!user) {
      throw Error("User Not Found");
    }

    user = user.toObject();
    user.profilePictureUrl = await getPicUrl(user._id);
    res.status(200).json({
      user,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// const getUserFollowerFollowingCount = async (req, res) => {
//   try {
//     const userid = req.params.userid;
//     const requesterId = req.params.requesterId;

//     // Validate ObjectId
//     if (!mongoose.Types.ObjectId.isValid(userid)) {
//       return res.status(400).json({ error: "Invalid user ID" });
//     }

//     const result = await User.aggregate([
//       { $match: { _id: new mongoose.Types.ObjectId(userid) } },

//       {
//         $project: {
//           _id: 1,
//           username: 1,
//           followersCount: { $size: { $ifNull: ["$followers", []] } },
//           followingCount: { $size: { $ifNull: ["$following", []] } },
//           isVerified: 1,
//           twitterUrl: 1,
//           facebookUrl: 1,
//           instagramUrl: 1,
//           linkedinUrl: 1
//         }
//       }
//     ]);

//     if (!result || result.length === 0) {
//       return res.status(404).json({ error: "User not found" });
//     }

//     const user = result[0];

//     // Optional: Add profile picture URL if still needed later
//     // user.profilePictureUrl = await getPicUrl(user._id);

//     return res.status(200).json({
//       user: {
//         _id: user._id,
//         username: user.username,
//         followersCount: user.followersCount,
//         followingCount: user.followingCount,
//         verified: user.isVerified,
//         linkedinUrl: user.islinkedinUrl,
//         instagramUrl: user.isinstagramUrl,
//         facebookUrl: user.isfacebookUrl,
//         twitterUrl: user.istwitterUrl,
//       }
//     });

//   } catch (error) {
//     console.error("Error in getUserFollowerFollowingCount:", error);
//     return res.status(500).json({ error: "Internal server error" });
//   }
// };

const getUserFollowerFollowingCount = async (req, res) => {
  try {
    const { userid, requesterId } = req.params;

    // Validate main user ID
    if (!mongoose.Types.ObjectId.isValid(userid)) {
      return res.status(400).json({ error: "Invalid user ID" });
    }

    // Prepare base match stage
    const matchStage = {
      $match: { _id: new mongoose.Types.ObjectId(userid) }
    };

    // We'll build projection dynamically
    const projectFields = {
      _id: 1,
      username: 1,
      followersCount: { $size: { $ifNull: ["$followers", []] } },
      followingCount: { $size: { $ifNull: ["$following", []] } },
      isVerified: 1,
      twitterUrl: 1,
      facebookUrl: 1,
      instagramUrl: 1,
      linkedinUrl: 1,
      WebsiteUrl: 1,
      bio: 1
    };

    // Only add relationship checks if requesterId is provided and valid
    let isFollowing = false;
    let isFollower = false;

    if (requesterId && requesterId.trim() !== "" && mongoose.Types.ObjectId.isValid(requesterId)) {
      const requesterObjectId = new mongoose.Types.ObjectId(requesterId);

      // Add relationship fields to projection
      projectFields.isRequesterFollowing = {
        $in: [requesterObjectId, "$followers"]
      };
      projectFields.isRequesterFollowedBy = {
        $in: [requesterObjectId, "$following"]
      };
    }

    const result = await User.aggregate([
      matchStage,
      {
        $project: projectFields
      }
    ]);

    if (!result || result.length === 0) {
      return res.status(404).json({ error: "User not found" });
    }

    const user = result[0];

    // Clean response structure
    return res.status(200).json({
      user: {
        _id: user._id,
        username: user.username,
        followersCount: user.followersCount,
        followingCount: user.followingCount,
        isVerified: user.isVerified,
        twitterUrl: user.twitterUrl,
        facebookUrl: user.facebookUrl,
        instagramUrl: user.instagramUrl,
        linkedinUrl: user.linkedinUrl,
        webisteUrl: user.WebsiteUrl,
        bio: user.bio,
        
        // Only include these if requesterId was valid
        ...(requesterId && requesterId.trim() !== "" && mongoose.Types.ObjectId.isValid(requesterId) && {
          isRequesterFollowing: user.isRequesterFollowing || false,   // Does requester follow this user?
          isRequesterFollowedBy: user.isRequesterFollowedBy || false  // Does this user follow requester?
        })
      }
    });

  } catch (error) {
    console.error("Error in getUserFollowerFollowingCount:", error);
    return res.status(500).json({ error: "Internal server error" });
  }
};

const getStrikeStatus = async (req, res) => {
  try {
    const userid = req.params.userid;
    let user = await User.findById(userid).select("underStrike strikeHistory systemBlocked");
    if (!user) {
      throw Error("User Not Found");
    }

    user = user.toObject();
    res.status(200).json({
      strikeStatus: user
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getUserProfile = async (req, res) => {
  try {
    const userid = req.params.userid;
    const includePosts = req.query.includePosts !== "false";
    let user = await User.findById(userid).select("-password");
    if (!user) {
      throw Error("User Not Found");
    }

    const viewerId = req.userId || req.authUserId;
    const isOwner = viewerId?.toString() === user._id.toString();
    const isAcceptedFollower = (user.followers || []).some(
      followerId => followerId.toString() === viewerId?.toString(),
    );
    const canViewPrivateContent =
      !user.isPrivate || isOwner || isAcceptedFollower;

    user = user.toObject();
    user.profilePictureUrl = await getPicUrl(user._id);

    // Populate badges (return full badge objects with imageUrl)
    if (Array.isArray(user.badges) && user.badges.length > 0) {
      const badgeIds = user.badges.map((id) => id.toString());
      const badges = await Badge.find({ _id: { $in: badgeIds } }).select("title text image").lean();
      const byId = new Map(badges.map((b) => [b._id.toString(), b]));
      user.badges = await Promise.all(
        badgeIds
          .filter((id) => byId.has(id))
          .map(async (id) => {
            const b = byId.get(id);
            return {
              _id: b._id,
              title: b.title,
              text: b.text,
              imageUrl: await getBadgeImageUrl(b.image),
            };
          }),
      );
    } else {
      user.badges = [];
    }
    var streamToken = "";
      var streamChannelName=  "";
      var streamid =  ""
    if(user.isLive){
      var stream = await Stream.findOne({userid: user._id});
      if(stream){
        streamToken =stream.token;
        streamChannelName= stream.channelName;
        streamid = stream._id
      }
    }
    user["streamToken"] = streamToken
    user["streamChannelName"] = streamChannelName;
    user["streamid"]  = streamid

    if (includePosts && canViewPrivateContent) {
      const postids = await Post.find({ userid })
        .sort({ createdAt: -1 })
        .select("_id");

      const posts = await Promise.all(
        postids.map((id) => {
          return getPost(id);
        })
      );

      user.postURLS = posts;
    } else {
      user.postURLS = [];
    }
    if (!canViewPrivateContent) {
      user.posts = [];
      user.reels = [];
      user.images = [];
      user.videos = [];
      user.document = [];
      user.clubMembers = [];
      user.clubid = null;
      user.isLive = false;
      user.is_online = "0";
      user.streamToken = "";
      user.streamChannelName = "";
      user.streamid = "";
      user.privateContentHidden = true;
    }

    
  const currentDate = new Date();
  if(currentDate <= user.verifiedExpiration && user.lemVerified){
    user.isVerified = true;
  }

    res.status(200).json({ user });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const followUser = async (req, res) => {
  try {
    const authenticatedUserId = req.userId || req.authUserId;
    if (
      req.body.currentUserId?.toString() !== authenticatedUserId?.toString()
    ) {
      return res.status(403).json({
        success: false,
        message: "Invalid follower identity",
      });
    }
    const currentUser = await User.findById(authenticatedUserId);
    const usertoFollow = await User.findById(req.body.usertoFollowId);

    if (!currentUser || !usertoFollow) {
      throw new Error("User does not exist");
    }

    if (currentUser.username !== usertoFollow.username) {
      if (usertoFollow.blocked.includes(currentUser._id)) {
        throw new Error("You are blocked by this user");
      }

      if (currentUser.blocked.includes(usertoFollow._id)) {
        throw new Error("Cannot follow blocked User");
      }

      if (!currentUser.following.includes(usertoFollow._id)) {
        // Private account flow: create follow request instead of following immediately
        const sharesClub = usertoFollow.isPrivate
          ? await usersShareClub(currentUser._id, usertoFollow._id)
          : false;
        if (usertoFollow.isPrivate && !sharesClub) {
          const alreadyRequested = (usertoFollow.followRequests || []).some(
            (r) => r?.from?.toString?.() === currentUser._id.toString(),
          );
          if (!alreadyRequested) {
            await usertoFollow.updateOne({
              $push: { followRequests: { from: currentUser._id, createdAt: new Date() } },
            });
            await sendCustomNotification(
              usertoFollow._id,
              "Follow request",
              `${currentUser.firstname || ""} ${currentUser.lastname || ""} wants to follow you.`.trim(),
            );
          }

          return res.status(200).json({
            message: "Follow request sent",
            requested: true,
          });
        }

        await currentUser.updateOne({
          $push: { following: usertoFollow._id },
        });
        await usertoFollow.updateOne({
          $push: { followers: currentUser._id },
        });
        await markOnboardingTask(currentUser._id, "follow");
        res.status(200).json({
          message: "User has been Followed",
          requested: false,
          following: true,
        });

        if(currentUser.following.length == 999){
          await sendCustomNotification(usertoFollow._id, "Live Unlocked", "Your live feature is unlocked.");
          await createActivity(
            usertoFollow._id.toString(),
            undefined,
            `Your live feature is unlocked.`,
            null,
            null,
            null,
            null,
            null,
            null,
            null,
            "live",
            {reason: "Your live feature is unlocked"}
          );
          await User.findByIdAndUpdate(usertoFollow._id, { liveAccess: true });
        }
      } else if (currentUser.following.includes(usertoFollow._id)) {
        const existingFollowingIds = await User.find({
          _id: { $in: currentUser.following },
        }).distinct("_id");

        const updatedCurrentUser = await User.findOneAndUpdate(
          {
            _id: currentUser._id,
            following: usertoFollow._id,
            $expr: {
              $gt: [
                {
                  $size: {
                    $setIntersection: ["$following", existingFollowingIds],
                  },
                },
                MINIMUM_FOLLOWING_COUNT,
              ],
            },
          },
          { $pull: { following: usertoFollow._id } },
          { new: true },
        );

        if (!updatedCurrentUser) {
          throw new Error(MINIMUM_FOLLOWING_ERROR);
        }

        await usertoFollow.updateOne({
          $pull: { followers: currentUser._id },
        });

        await updateRankingPointsForUser(usertoFollow._id);
        res.status(200).json({
          message: "User has been UnFollowed",
        });
      }
    } else {
      throw Error("users must differ");
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getNewUserOnboarding = async (req, res) => {
  try {
    const { userid } = req.params;
    const user = await User.findById(userid).select("onboarding");

    if (!user) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      onboarding: normalizeOnboarding(user.onboarding),
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

const activateNewUserOnboarding = async (req, res) => {
  try {
    const { userid } = req.params;
    const onboarding = await activateOnboarding(userid);

    if (!onboarding) {
      return res.status(404).json({
        success: false,
        error: "User not found",
      });
    }

    res.status(200).json({
      success: true,
      onboarding,
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      error: error.message,
    });
  }
};

const searchUsers = async (req, res) => {
  try {
    const search = req.body.search.trim() || "";
    let users = await User.find({
      $or: [
        { username: { $regex: `^${search}`, $options: "i" } },
        { firstname: { $regex: `^${search}`, $options: "i" } },
        { lastname: { $regex: `^${search}`, $options: "i" } },
      ]
    }).select("-password").lean();

    users = await Promise.all(
      users.map(async (user) => {
        try {
          const url = await getPicUrl(user._id);
          user.url = url;
          user.isPrivate = user.isPrivate === true;
          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    for (let i = users.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [users[i], users[j]] = [users[j], users[i]];
    }

    res.status(200).json({
      users: users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const searchUsersUpdated = async (req, res) => {
  try {
    const search = req.params.search.trim() || "";
    let users = await User.find({
      $or: [
        { username: { $regex: `^${search}`, $options: "i" } },
        { firstname: { $regex: `^${search}`, $options: "i" } },
        { lastname: { $regex: `^${search}`, $options: "i" } },
      ]
    }).select("-password").lean();

    users = await Promise.all(
      users.map(async (user) => {
        try {
          const url = await getPicUrl(user._id);
          user.url = url;
          user.isPrivate = user.isPrivate === true;

          if(user.isOnCall){
            let voicemeetCheck = await VoiceMeet.findOne({ userid: user._id.toString() });
            if(!voicemeetCheck){
              const userData = await User.findById(user._id.toString());
              if(userData){
                await userData.updateOne({
                  isOnCall: false
                })
              }
              user.isOnCall = false
            }
          }

          if(user.isLive){
            let streamCheck = await Stream.findOne({ userid: user._id.toString() });
            if(!streamCheck){
              const userData = await User.findById(user._id.toString());
              if(userData){
                await userData.updateOne({
                  isLive: false
                })
              }
              user.isLive = false
            }
          }

          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    for (let i = users.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [users[i], users[j]] = [users[j], users[i]];
    }

    res.status(200).json({
      users: users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const searchUsersUpdatedBlocked = async (req, res) => {
  try {
    const search = req.params.search.trim() || "";
    const userid = req.params.userid.trim() || "";
    let users = await User.find({
      $and: [
        {
          $or: [
            { username: { $regex: `^${search}`, $options: "i" } },
            { firstname: { $regex: `^${search}`, $options: "i" } },
            { lastname: { $regex: `^${search}`, $options: "i" } },
          ]
        },
        // Exclude users who blocked the current user
        { blocked: { $nin: [userid] } },
        // Exclude users whom the current user has blocked
        { blockedBy: { $nin: [userid] } },
        // Optional: don't return the current user himself
        { _id: { $ne: userid } }
      ]
    }).select("-password").lean();
    
    users = await Promise.all(
      users.map(async (user) => {
        try {
          const url = await getPicUrl(user._id);
          user.url = url;
          
          if(user.isOnCall){
            let voicemeetCheck = await VoiceMeet.findOne({ userid: user._id.toString() });
            if(!voicemeetCheck){
              const userData = await User.findById(user._id.toString());
              if(userData){
                await userData.updateOne({
                  isOnCall: false
                })
              }
              user.isOnCall = false
            }
          }

          if(user.isLive){
            let streamCheck = await Stream.findOne({ userid: user._id.toString() });
            if(!streamCheck){
              const userData = await User.findById(user._id.toString());
              if(userData){
                await userData.updateOne({
                  isLive: false
                })
              }
              user.isLive = false
            }
          }

          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    for (let i = users.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [users[i], users[j]] = [users[j], users[i]];
    }

    res.status(200).json({
      users: users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const searchClubUsersUpdatedBlocked = async (req, res) => {
  try {
    const userid = req.params.userid?.trim() || "";
    const requestedLimit = Number.parseInt(req.query.limit, 10);
    const limit = Number.isFinite(requestedLimit)
      ? Math.min(Math.max(requestedLimit, 1), 30)
      : 15;
    const viewerId = mongoose.Types.ObjectId.isValid(userid)
      ? new mongoose.Types.ObjectId(userid)
      : null;

    const clubMatch = {};
    const ownerMatch = {};
    if (viewerId) {
      clubMatch.userid = { $ne: viewerId };
      ownerMatch["owner.blocked"] = { $nin: [viewerId] };
      ownerMatch["owner.blockedBy"] = { $nin: [viewerId] };
    }

    const clubs = await Club.aggregate([
      { $match: clubMatch },
      { $sample: { size: limit * 3 } },
      {
        $lookup: {
          from: "users",
          localField: "userid",
          foreignField: "_id",
          as: "owner",
        },
      },
      { $unwind: "$owner" },
      ...(Object.keys(ownerMatch).length > 0 ? [{ $match: ownerMatch }] : []),
      { $limit: limit },
      {
        $project: {
          userid: 1,
          members: 1,
          privateChatRooms: 1,
          liveChatRooms: 1,
          voiceCall: 1,
          fee: 1,
          owner: {
            _id: "$owner._id",
            username: "$owner.username",
            firstname: "$owner.firstname",
            lastname: "$owner.lastname",
            email: "$owner.email",
            about: "$owner.about",
            bio: "$owner.bio",
            profilePicture: "$owner.profilePicture",
            streamid: "$owner.streamid",
            followers: "$owner.followers",
            following: "$owner.following",
            posts: "$owner.posts",
            reels: "$owner.reels",
            blocked: "$owner.blocked",
            twitterUrl: "$owner.twitterUrl",
            facebookUrl: "$owner.facebookUrl",
            instagramUrl: "$owner.instagramUrl",
            linkedinUrl: "$owner.linkedinUrl",
            WebsiteUrl: "$owner.WebsiteUrl",
            is_online: "$owner.is_online",
            isVerified: "$owner.isVerified",
            isLive: "$owner.isLive",
            isOnCall: "$owner.isOnCall",
            walletid: "$owner.walletid",
            __v: "$owner.__v",
          },
        },
      },
    ]);

    const users = await Promise.all(
      clubs.map(async (club) => {
        try {
          const user = club.owner;
          let url = "";
          if (user.profilePicture) {
            const command = new GetObjectCommand({
              Bucket: bucketName,
              Key: user.profilePicture,
            });
            url = await getSignedUrl(s3, command, { expiresIn: "604800" });
          }
          user.url = url;

          user.clubid = club._id;
          user.clubMemberCount = Array.isArray(club?.members)
            ? new Set(
                club.members
                  .map((member) => member.toString())
                  .filter((member) => member !== club.userid?.toString())
              ).size
            : 0;
          user.clubPrivateChatRooms = club?.privateChatRooms === true;
          user.clubLiveChatRooms = club?.liveChatRooms === true;
          user.clubVoiceCall = club?.voiceCall === true;
          user.clubFee = typeof club?.fee === "number" ? club.fee : null;
          
          if(user.isOnCall){
            let voicemeetCheck = await VoiceMeet.findOne({ userid: user._id.toString() });
            if(!voicemeetCheck){
              const userData = await User.findById(user._id.toString());
              if(userData){
                await userData.updateOne({
                  isOnCall: false
                })
              }
              user.isOnCall = false
            }
          }

          if(user.isLive){
            let streamCheck = await Stream.findOne({ userid: user._id.toString() });
            if(!streamCheck){
              const userData = await User.findById(user._id.toString());
              if(userData){
                await userData.updateOne({
                  isLive: false
                })
              }
              user.isLive = false
            }
          }

          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    res.status(200).json({
      users: users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getTagUsers = async (req, res) => {
  try {
    const search = req.query?.search?.trim() || "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    let users = await User.find({
      $or: [
        { tag: { $regex: `^${escapedSearch}`, $options: "i" } },
        { username: { $regex: `^${escapedSearch}`, $options: "i" } },
        { firstname: { $regex: `^${escapedSearch}`, $options: "i" } },
        { lastname: { $regex: `^${escapedSearch}`, $options: "i" } },
      ],
    }).select("tag profilePicture username firstname lastname").lean();

    users = await Promise.all(
      users.map(async (user) => {
        try {
          user.profilePicture = await getPicUrl(user._id);
          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    // for (let i = users.length - 1; i > 0; i--) {
    //   const j = Math.floor(Math.random() * (i + 1));
    //   [users[i], users[j]] = [users[j], users[i]];
    // }

    res.status(200).json({
      tagUsers: users
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getTagUsersUpdated = async (req, res) => {
  try {
    const search = req.body.search?.trim() || "";
    const escapedSearch = search.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    console.log("searched name is: ", search);
    let users = await User.find({
      $or: [
        { tag: { $regex: `^${escapedSearch}`, $options: "i" } },
        { username: { $regex: `^${escapedSearch}`, $options: "i" } },
        { lastname: { $regex: `^${escapedSearch}`, $options: "i" } },
        { firstname: { $regex: `^${escapedSearch}`, $options: "i" } }
      ]
    }).select("tag profilePicture username firstname lastname").lean();

    users = await Promise.all(
      users.map(async (user) => {
        try {
          user.profilePicture = await getPicUrl(user._id);
          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    // for (let i = users.length - 1; i > 0; i--) {
    //   const j = Math.floor(Math.random() * (i + 1));
    //   [users[i], users[j]] = [users[j], users[i]];
    // }

    res.status(200).json({
      tagUsers: users
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllFollowers = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");
    if (user.hideFollowersFollowing &&
        userid.toString() !== req.userId?.toString()) {
      return res.status(403).json({
        success: false,
        code: "FOLLOW_LIST_HIDDEN",
        message: "This user has hidden their Followers and Following lists.",
      });
    }

    const followers = await Promise.all(
      user.followers.map(async (id) => {
        let follower = await User.findById(id).select("-password");
        follower = follower.toObject();
        follower.url = await getPicUrl(follower._id);
        return follower;
      })
    );
    res.status(200).json({
      followers,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllFollowing = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");
    if (user.hideFollowersFollowing &&
        userid.toString() !== req.userId?.toString()) {
      return res.status(403).json({
        success: false,
        code: "FOLLOW_LIST_HIDDEN",
        message: "This user has hidden their Followers and Following lists.",
      });
    }

    const following = await Promise.all(
      user.following.map(async (id) => {
        let following = await User.findById(id).select("-password");
        following = following.toObject();
        following.url = await getPicUrl(following._id);
        return following;
      })
    );

    res.status(200).json({
      following,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllFollowersAndFollowing = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    const followers = await Promise.all(
      user.followers.map(async (id) => {
        let follower = await User.findById(id).select("-password");
        follower = follower.toObject();
        follower.url = await getPicUrl(follower._id);
        return follower;
      })
    );

    const following = await Promise.all(
      user.following.map(async (id) => {
        let following = await User.findById(id).select("-password");
        following = following.toObject();
        following["profilepicture"] = (following.profilePicture && following.profilePicture.trim() != "") ? await getPicUrlAws(following.profilePicture) : "";
        console.log("proifl: ", profilePicture)
        console.log("url: ", following["profilepicture"])
        return following;
      })
    );

    const allUsers = followers.concat(following);
    const uniqueUsers = allUsers.filter(
      (user, index, self) =>
        index ===
        self.findIndex((u) => u._id.toString() === user._id.toString())
    );

    res.status(200).json({
      users: uniqueUsers,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getBlocked = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    const blocked = await Promise.all(
      user.blocked.map(async (id) => {
        let blocked = await User.findById(id).select("-password");
        blocked = blocked.toObject();
        blocked.url = await getPicUrl(blocked._id);
        return blocked;
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

const setProfilePic = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    imageName = randomName();

    const params = {
      Bucket: bucketName,
      Key: imageName,
      Body: req.file.buffer,
      ContentType: req.file.mimetype,
    };

    const command = new PutObjectCommand(params);

    await s3.send(command);

    await User.findByIdAndUpdate(userid, {
      profilePicture: imageName,
    });

    res.status(200).json({ message: "Profile Picture Set" });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getProfilePic = async (req, res) => {
  try {
    const userid = req.params.userid;

    let url = await getPicUrl(userid);

    res.status(200).json({
      url,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const deleteProfilePic = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const params = {
      Bucket: bucketName,
      Key: user.profilePicture,
    };

    const command = new DeleteObjectCommand(params);

    await s3.send(command);

    await User.findByIdAndUpdate(userid, {
      profilePicture: "",
    });

    res.status(200).json({
      message: "Profile Picture Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const editProfile = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const {
      username,
      firstname,
      lastname,
      twitterUrl,
      facebookUrl,
      instagramUrl,
      linkedinUrl,
      WebsiteUrl,
      address,
      bio,
      dob,
      ipAddress
    } = req.body;
    var updateArray = {};

    if (username && username != user.username && username.trim() != "") {
      var existingUsername = await User.findOne({
        username,
        _id: { $ne: userid },
      });
      if (existingUsername) {
        throw Error("Username not available");
      }
      updateArray["username"] = username;
    }

    if (firstname) {
      updateArray["firstname"] = firstname;
    }

    if (lastname) {
      updateArray["lastname"] = lastname;
    }

    if (twitterUrl) {
      updateArray["twitterUrl"] = twitterUrl;
    }else{
      updateArray["twitterUrl"] = "";
    }

    if (facebookUrl) {
      updateArray["facebookUrl"] = facebookUrl;
    }else{
      updateArray["facebookUrl"] = "";
    }

    if (instagramUrl) {
      updateArray["instagramUrl"] = instagramUrl;
      console.log("instagraurl: ", instagramUrl);
    } else{
      updateArray["instagramUrl"] = "";
    }

    if (linkedinUrl) {
      updateArray["linkedinUrl"] = linkedinUrl;
    }else{
      updateArray["linkedinUrl"] = "";
    }

    if (WebsiteUrl) {
      updateArray["WebsiteUrl"] = WebsiteUrl;
    } else{
      updateArray["WebsiteUrl"] = "";
    }

    if (bio) {
      updateArray["bio"] = bio;
    }else{
      updateArray["bio"] = "";
    }

    if (dob) {
      updateArray["dob"] = dob;
    }else{
      updateArray["dob"] = null;
    }

    if (ipAddress) {
      updateArray["ipAddress"] = ipAddress;
    }else{
      updateArray["ipAddress"] = "";
    }

    if (address) {
      updateArray["address"] = address;
    }else{
      updateArray["address"] = "";
    }

    await user.updateOne(updateArray);

    res.status(200).json({
      message: "Information Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const editProfileInitial = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const {
      address,
      bio,
      dob,
      ipAddress
    } = req.body;
    var updateArray = {};

    if (bio) {
      updateArray["bio"] = bio;
    }

    if (dob) {
      updateArray["dob"] = dob;
    }

    if (ipAddress) {
      updateArray["ipAddress"] = ipAddress;
    }

    if (address) {
      updateArray["address"] = address;
    }

    await user.updateOne(updateArray);

    res.status(200).json({
      message: "Information Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!user.password) {
      throw Error("Cannot Change Password of Social Users");
    }

    const oldpassword = req.body.oldpassword;
    const newpassword = req.body.newpassword;

    const match = await bcrypt.compare(oldpassword, user.password);
    if (!match) {
      throw Error("Old Password Not Correct");
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newpassword, salt);

    await user.updateOne({
      password: hashed,
    });

    res.status(200).json({
      message: "Password Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

function OTP() {
  const min = 1000; // Minimum 4-digit number
  const max = 9999; // Maximum 4-digit number
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

const resetPasswordRequest = async (req, res) => {
  try {
    const email = req.body.email;
    const user = await User.findOne({ email });
    if (!user) {
      throw Error("User Not Found");
    }

    const otp = OTP();
    const otpDoc = await OtpPass.findOne({ email });
    if (otpDoc) {
      await otpDoc.deleteOne();
    }
    await OtpPass.create({
      email,
      otp,
    });

    const firstname = user.firstname;
    const lastname = user.lastname;

    await sendMail(otp, firstname, lastname, email);

    res.status(200).json({
      message: "Verification Pending. OTP Sent",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const verifyPasswordOtp = async (req, res) => {
  try {
    const email = req.body.email;
    let otp = req.body.otp;
    otp = parseInt(otp, 10);
    const otpDoc = await OtpPass.findOne({ email });

    if (otpDoc.otp == otp) {
      await otpDoc.deleteOne();
      res.status(200).json({
        message: "Verification Successful",
      });
    } else {
      throw Error("Otp Verification Failed");
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const newPassword = async (req, res) => {
  try {
    const email = req.body.email;
    const user = await User.findOne({ email });
    if (!user) {
      throw Error("User Not Found");
    }
    const newpassword = req.body.newpassword;
    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(newpassword, salt);
    await user.updateOne({
      password: hashed,
    });
    res.status(200).json({
      message: "Password Reset",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(User.find({}).sort({ _id: -1 }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (user) => {
        user = user.toObject();
        user.profilePicUrl = await getPicUrl(user._id);
        return user;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, users: result });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllVerifiedUsers = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(User.find({isVerified: true}).sort({ _id: -1 }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (user) => {
        user = user.toObject();
        user.profilePicUrl = await getPicUrl(user._id);
        return user;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, users: result });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getUsersUnderStrike = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(User.find({underStrike: true}), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (user) => {
        user = user.toObject();
        user.profilePicUrl = await getPicUrl(user._id);
        return user;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, users: result });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getRandomUsers = async (req, res) => {
  try {
    let users = await User.aggregate([{ $sample: { size: 50 } }]);
    users = await Promise.all(
      users.map(async (user) => {
        // user = user.toObject();
        user.profilePicUrl = await getPicUrl(user._id);
        return user;
      })
    );

    res.status(200).json({
      users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const getRandomVerified = async (req, res) => {
  try {    
    var userIds = [] 
    var business = await Business.findOne({});
    if(!business || business.mustSubscribeUsers.length < 5){
        userIds = [
        "6930ef99bacf362cdab83b21",
        "66633301dbb960a267736bf7",
        "66e6a327f732b8baa401cdfc",
        "689a2b9436f1ef05c34b642d",
        "68ac34425afec6dcb5d9e736"
      ];
    }else{
      userIds = business.mustSubscribeUsers
    }

    let users = await User.find({
      isVerified: true,
      _id: { $in: userIds.map(id => new mongoose.Types.ObjectId(id)) }
    }).limit(5).lean();
    
    users = await Promise.all(
      users.map(async (user) => {
        // user = user.toObject();
        user.profilePicture = await getPicUrl(user._id);
        return user;
      })
    );

    for (let i = users.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [users[i], users[j]] = [users[j], users[i]];
    }

    res.status(200).json({
      users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const setVerified = async (req, res) => {
  try {
    const userid = req.body.userid;
    const verification = req.body.verification;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    await user.updateOne({
      isVerified: verification,
    });

    res.status(200).json({
      message: "Verification Status Set",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const getImages = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!canViewAccountContent(user, req.userId || req.authUserId)) {
      return res.status(200).json({ images: [], privateContentHidden: true });
    }

    const postids = user.posts;
    let images = [];

    for (const id of postids) {
      const post = await getPost(id);
      let contentArray = post.contentArray;
      for (const content of contentArray) {
        const type = content.contentType.split("/")[0];
        if (type == "image") {
          content.userid = userid;
          content.postid = post._id;
          content.likes = post.likes;
          content.comments = post.comments;
          content.postType = post.postType;
          content.canView = post.canView;
          delete content.contentType;
          content.createdAt = post.createdAt;
          content.savedBy = post.savedBy;
          images.push(content);
        }
      }
    }

    res.status(200).json({
      images,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
// const getVideos = async (req, res) => {
//   try {
//     const userid = req.params.userid;
//     const user = await User.findById(userid);
//     if (!user) {
//       throw Error("User Not Found");
//     }

//     const postids = user.posts;
//     let videos = [];

//     for (const id of postids) {
//       const post = await getPost(id);
//       var postPrice = 0;
//       if (post.postType == "paid") {
//         postPrice = post.price;
//       }
//       const { contentArray, savedBy } = post;

//       for (let i = 0; i < contentArray.length; i++) {
//         const content = contentArray[i];
//         const type = content.contentType.split("/")[0];
//         if (type === "video") {
//           const video = {
//             userid: userid,
//             postid: post._id,
//             likes: post.likes,
//             comments: post.comments,
//             postType: post.postType,
//             canView: post.canView,
//             createdAt: post.createdAt,
//             objectUrl: content.objectUrl,
//             thumbnail: content.thumbnail,
//             sightengineResults: post.sigthengineResults,
//             commentsAllowed: post.commentsAllowed,
//             location: post.location,
//             savedBy: savedBy,
//             shares: post.shares,
//             price: postPrice,
//           };
//           videos.push(video);
//         }
//       }
//     }

//     res.status(200).json({
//       videos,
//     });
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };

const getVideos = async (req, res) => {
  try {
    const userid = req.params.userid;

    const user = await User.findById(userid)
      .select("posts username isPrivate followers");
    if (!user) throw new Error("User Not Found");
    if (!canViewAccountContent(user, req.userId || req.authUserId)) {
      return res.status(200).json({ videos: [], privateContentHidden: true });
    }

    // 1️⃣ Fetch ALL posts at once
    const posts = await Post.find({
      _id: { $in: user.posts }
    })
      .select(
        "userid contents thumbnails likes comments postType price canView createdAt sigthengineResults commentsAllowed location savedBy shares"
      )
      .lean(); // 🚀 IMPORTANT

    if (!posts.length) {
      return res.status(200).json({ videos: [] });
    }

    // 2️⃣ Get profile pic ONCE
    const profilePictureUrl = await getPicUrl(userid);

    let videos = [];

    // 3️⃣ Process posts in parallel
    await Promise.all(
      posts.map(async (post) => {
        let thumbnailIndex = 0;

        // Prepare thumbnail URLs first
        const thumbnailUrls = await Promise.all(
          post.thumbnails.map(async (key) => {
            const params = { Bucket: bucketName, Key: key };
            const head = await s3.send(new HeadObjectCommand(params));
            const url = await getSignedUrl(
              s3,
              new GetObjectCommand(params),
              { expiresIn: 604800 }
            );
            return { contentType: head.ContentType, objectUrl: url };
          })
        );

        // Process contents
        await Promise.all(
          post.contents.map(async (key) => {
            const params = { Bucket: bucketName, Key: key };
            const head = await s3.send(new HeadObjectCommand(params));

            const type = head.ContentType.split("/")[0];
            if (type !== "video") return;

            const objectUrl = await getSignedUrl(
              s3,
              new GetObjectCommand(params),
              { expiresIn: 604800 }
            );

            videos.push({
              userid,
              postid: post._id,
              contentType: head.ContentType,
              likes: post.likes,
              comments: post.comments,
              postType: post.postType,
              canView: post.canView,
              createdAt: post.createdAt,
              objectUrl,
              thumbnail: thumbnailUrls[thumbnailIndex]?.objectUrl || null,
              sightengineResults: post.sigthengineResults,
              commentsAllowed: post.commentsAllowed,
              location: post.location,
              savedBy: post.savedBy,
              shares: post.shares,
              price: post.postType === "paid" ? post.price : 0,
              username: user.username,
              profilePictureUrl
            });
            thumbnailIndex++;
          })
        );
      })
    );

    res.status(200).json({ videos });
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error);
  }
};

const getVideosFast = async (req, res) => {
  try {
    const userid = req.params.userid;

    const user = await User.findById(userid, { posts: 1 }).lean();
    if (!user || !user.posts?.length) {
      return res.status(200).json({ videos: [] });
    }

    const postIds = user.posts.map(id => new mongoose.Types.ObjectId(id)); // ensure ObjectIds

    const rawVideos = await Post.aggregate([
      { $match: { _id: { $in: postIds } } },

      {
        $project: {
          postType: 1,
          price: 1,
          likes: 1,
          comments: 1,
          shares: 1,
          canView: 1,
          createdAt: 1,
          savedBy: 1,
          commentsAllowed: 1,
          location: 1,
          sigthengineResults: 1,   // ← probably typo → sightengineResults?
          contents: 1,
          thumbnails: 1,
        }
      },

      // Explode each content item
      { $unwind: "$contents" },

      // Add index of this content in the original contents array
      {
        $addFields: {
          contentIndex: { $indexOfArray: ["$contents", "$$ROOT.contents"] }
        }
      },

      // Keep only video contents (most efficient place to filter)
      {
        $match: {
          "contents": { $regex: /^video\// }   // works if contents is string (S3 key)
          // If contents is already { contentType: "...", ... } then use:
          // "contents.contentType": { $regex: /^video\//i }
        }
      },

      // Attach matching thumbnail (by index) — safe even if thumbnails.length < contents.length
      {
        $addFields: {
          thumbnailKey: {
            $cond: {
              if: { $lt: ["$contentIndex", { $size: "$thumbnails" }] },
              then: { $arrayElemAt: ["$thumbnails", "$contentIndex"] },
              else: null
            }
          }
        }
      },

      // Final projection (almost ready for client)
      {
        $project: {
          userid: userid,
          postid: "$_id",
          likes: 1,
          comments: 1,
          postType: 1,
          canView: 1,
          createdAt: 1,
          objectUrl: "$contents",           // we'll sign later
          thumbnail: "$thumbnailKey",       // we'll sign later
          sightengineResults: 1,
          commentsAllowed: 1,
          location: 1,
          savedBy: 1,
          shares: 1,
          price: {
            $cond: [{ $eq: ["$postType", "paid"] }, "$price", 0]
          }
        }
      }
    ]);

    // ── Bulk sign all needed URLs ────────────────────────────────────────
    const keysToSign = new Set();

    rawVideos.forEach(v => {
      if (v.objectUrl) keysToSign.add(v.objectUrl);
      if (v.thumbnail) keysToSign.add(v.thumbnail);
    });

    const signedMap = await generateBulkSignedUrls(Array.from(keysToSign));

    // Final mapping
    const videos = rawVideos.map(item => ({
      ...item,
      objectUrl: signedMap[item.objectUrl] || null,
      thumbnail: signedMap[item.thumbnail] || null,
    }));

    return res.status(200).json({ videos });

  } catch (err) {
    console.error(err);
    res.status(400).json({ error: err.message });
  }
};

// Same bulk signing helper (very fast)
async function generateBulkSignedUrls(keys) {
  if (!keys?.length) return {};

  const signedMap = {};

  await Promise.all(
    keys.map(async key => {
      try {
        const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
        const url = await getSignedUrl(s3, command, { expiresIn: 604800 });
        signedMap[key] = url;
      } catch (e) {
        console.warn(`Failed to sign ${key}:`, e);
        signedMap[key] = null;
      }
    })
  );

  return signedMap;
}
const getUserReels = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!canViewAccountContent(user, req.userId || req.authUserId)) {
      return res.status(200).json({ videos: [], privateContentHidden: true });
    }
    const reelids = user.reels;
    let videos = [];

    videos = await Promise.all(
      reelids.map(async (id) => {
        const reel = await getReel(id);
        return {
          userid,
          reelid: reel._id,
          likes: reel.likes,
          comments: reel.comments,
          objectUrl: reel.videoUrl,
          description: reel.description,
          thumbnail: reel.thumbnailUrl,
          createdAt: reel.createdAt,
        };
      })
    );
    // }

    res.status(200).json({
      videos,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const getPicUrl = async (id) => {
  try {
    let user = await User.findById(id);
    if (!user) {
      return "user deleted";
    }

    let url = "";
    if (user.profilePicture != "") {
      const getObjectParams = {
        Bucket: bucketName,
        Key: user.profilePicture,
      };
      const command = new GetObjectCommand(getObjectParams);
      url = await getSignedUrl(s3, command, { expiresIn: "604800" });
    }
    return url;
  } catch (error) {
    throw error.message;
  }
};

const getPicUrlAws = async (id) => {
  try {
    let url = "";
    const getObjectParams = {
      Bucket: bucketName,
      Key: id,
    };
    const command = new GetObjectCommand(getObjectParams);
    url = await getSignedUrl(s3, command, { expiresIn: "604800" });
    return url;
  } catch (error) {
    throw error.message;
  }
};
const getPost = async (id) => {
  try {
    let post = await Post.findById(id);

    if (!post) {
      throw Error("Post Not Found");
    }

    const user = await User.findById(post.userid);
    let url = await getPicUrl(user._id);
    let contentArray = await Promise.all(
      post.contents.map(async (content) => {
        let getObjectParams = {
          Bucket: bucketName,
          Key: content,
        };
        let command = new GetObjectCommand(getObjectParams);
        let command2 = new HeadObjectCommand(getObjectParams);
        const object = await s3.send(command2);
        const objectUrl = await getSignedUrl(s3, command, {
          expiresIn: "604800",
        });

        const contentType = object.ContentType;

        return {
          contentType,
          objectUrl,
        };
      })
    );

    let thumbnailArray = [];
    if (post.thumbnails.length != 0) {
      thumbnailArray = await Promise.all(
        post.thumbnails.map(async (thumbnail) => {
          let getObjectParams = {
            Bucket: bucketName,
            Key: thumbnail,
          };
          let command = new GetObjectCommand(getObjectParams);
          let command2 = new HeadObjectCommand(getObjectParams);
          const object = await s3.send(command2);
          const objectUrl = await getSignedUrl(s3, command, {
            expiresIn: "604800",
          });
          return {
            contentType: object.ContentType,
            objectUrl,
          };
        })
      );
    }
    let count = 0;
    contentArray = await Promise.all(
      contentArray.map((object) => {
        let contentType = object.contentType;
        let type = contentType.split("/")[0];
        if (type == "video") {
          if (count < thumbnailArray.length) {
            object.thumbnail = thumbnailArray[count].objectUrl;
            count = count + 1;
          }
        }
        return object;
      })
    );

    post = post.toObject();
    post.contentArray = contentArray;
    post.username = user.username;
    post.profilePictureUrl = url;

    return post;
  } catch (error) {
    throw new Error(error.message);
  }
};

const getPostReport = async (id) => {
  try {
    let post = await Post.findById(id);

    if (!post) {
      return null
    }

    var user = await User.findById(post.userid);
    if(user){
      user = {
        _id: user._id,
        username: user.username,
        firstname: user.firstname,
        lastname: user.lastname,
        profilePicture: await getPicUrl(user._id),
        ipAddress: user.ipAddress,
        email: user.email,
        address: user.address
      }
    }
    let contentArray = await Promise.all(
      post.contents.map(async (content) => {
        let getObjectParams = {
          Bucket: bucketName,
          Key: content,
        };
        let command = new GetObjectCommand(getObjectParams);
        let command2 = new HeadObjectCommand(getObjectParams);
        const object = await s3.send(command2);
        const objectUrl = await getSignedUrl(s3, command, {
          expiresIn: "604800",
        });

        const contentType = object.ContentType;

        return {
          contentType,
          objectUrl,
        };
      })
    );

    let thumbnailArray = [];
    if (post.thumbnails.length != 0) {
      thumbnailArray = await Promise.all(
        post.thumbnails.map(async (thumbnail) => {
          let getObjectParams = {
            Bucket: bucketName,
            Key: thumbnail,
          };
          let command = new GetObjectCommand(getObjectParams);
          let command2 = new HeadObjectCommand(getObjectParams);
          const object = await s3.send(command2);
          const objectUrl = await getSignedUrl(s3, command, {
            expiresIn: "604800",
          });
          return {
            contentType: object.ContentType,
            objectUrl,
          };
        })
      );
    }
    let count = 0;
    contentArray = await Promise.all(
      contentArray.map((object) => {
        let contentType = object.contentType;
        let type = contentType.split("/")[0];
        if (type == "video") {
          if (count < thumbnailArray.length) {
            object.thumbnail = thumbnailArray[count].objectUrl;
            count = count + 1;
          }
        }
        return object;
      })
    );

    post = post.toObject();
    post.contentArray = contentArray;
    post.user = user

    return post;
  } catch (error) {
    throw new Error(error.message);
  }
};
const getReel = async (reelid) => {
  try {
    let reel = await Reel.findById(reelid);
    let videoUrl = "";
    let thumbnailUrl = "";

    if (!reel) {
      throw Error("Reel Not Found");
    }

    if (reel.video != "") {
      let getObjectParams = {
        Bucket: bucketName,
        Key: reel.video,
      };
      let command = new GetObjectCommand(getObjectParams);
      videoUrl = await getSignedUrl(s3, command, { expiresIn: "604800" });
    }

    if (reel.thumbnail != "") {
      getObjectParams = {
        Bucket: bucketName,
        Key: reel.thumbnail,
      };
      command = new GetObjectCommand(getObjectParams);
      thumbnailUrl = await getSignedUrl(s3, command, { expiresIn: "604800" });
    }

    const user = await User.findById(reel.userid);

    reel = reel.toObject();
    reel.username = user.username;
    reel.profilePictureUrl = await getPicUrl(reel.userid);
    reel.videoUrl = videoUrl;
    reel.thumbnailUrl = thumbnailUrl;

    return reel;
  } catch (error) {
    throw new Error(error.message);
  }
};
async function sendMail(otp, firstname, lastname, email) {
  try {
    const mailOptions = {
      from: godaddyEmail,
      to: email,
      subject: "Frenzone OTP To Reset Password",
      text: `Dear ${firstname + " " + lastname},
            
Your One-Time Password (OTP) to reset your password is ${otp}. Do not share with anyone.
          
Team Frenzone`,
    };

    await mailTransport.sendMail(mailOptions);
  } catch (err) {
    console.error(err);
  }
}

async function sendCustomMail(subject, email, body) {
  try {
    const mailOptions = {
      from: godaddyEmail,
      to: email,
      subject,
      html: body,
    };

    await mailTransport.sendMail(mailOptions);
  } catch (err) {
    console.error(err);
  }
}
// const deleteUser = async (req, res) => {
//   try {
//     var { userid } = req.body;
//     var user = await User.findById(userid);
//     if (user) {
//       await user.deleteOne();
//       var models = [
//         Post,
//         Reel,
//         Story,
//         Activity,
//         Stream,
//         Wallet,
//         ReelComment,
//         Chat,
//         Thread,
//         Transaction
//       ];
//       await Promise.all(
//         models.map(async (model) => {
//           var modelDatas = await model.find({
//             $or: [
//               { userid: userid },
//               { otheruserid: userid },
//               { senderid: userid },
//               { receiverid: userid },
//               { participantOneId: userid },
//               { participantTwoId: userid },
//             ],
//           });
//           await Promise.all(
//             modelDatas.map(async (modelData) => {
//               await modelData.deleteOne();
//               console.log("model: ", model, ", Model data: ", modelData);
//             })
//           );
//         })
//       );

//       var comments = await Comment.find({
//         userid
//       })
//       await Promise.all(
//         comments.map(async comment => {
//           var post = await Post.findById(comment.postid);
//           if(post){
//             await post.updateOne({
//               $pull: {
//                 comments: comment._id
//               }
//             })
//           }
//           await comment.deleteOne();
//         })
//       )

//       var replies = await Reply.find({
//         userid
//       })
//       await Promise.all(
//         replies.map(async reply => {
//           var comment = await Comment.findById(reply.commentid);
//           if(comment){
//             await comment.updateOne({
//               $pull: {
//                 replies: reply._id
//               }
//             })
//           }
//           await reply.deleteOne();
//         })
//       )

//       var us = await User.find({});
//       await Promise.all(
//         us.map(async (u) => {
//           var useridobject = userid.toString();
//           console.log(useridobject);
//           await u.updateOne({ $pull: { following: useridobject } });
//           await u.updateOne({ $pull: { followers: useridobject } });
//           console.log("user: ", u._id, ", folower: ", userid);
//         })
//       );
//     }
//     res.status(200).json({
//       message: "User deleted successfully",
//     });
//     // }else{
//     //   throw Error("User not found!")
//     // }
//   } catch (err) {
//     res.status(400).json({
//       error: err.message,
//     });
//   }
// };

const deleteUser = async (req, res) => {
  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const { userid } = req.body;
    const userObjId = new mongoose.Types.ObjectId(userid);

    // --------------------------------------------------------------
    // 1. Delete the user itself
    // --------------------------------------------------------------
    const user = await User.findByIdAndDelete(userObjId, { session });
    if (!user) {
      await session.abortTransaction();
      return res.status(404).json({ error: "User not found" });
    }

    // --------------------------------------------------------------
    // 2. Delete *owned* documents (posts, reels, comments, replies, clubs, rooms …)
    // --------------------------------------------------------------
    const ownedModels = [
      Post,
      Reel,
      Story,
      Activity,
      Stream,
      Wallet,
      ReelComment,
      Chat,
      Thread,
      Transaction,
      Comment,
      Reply,
      ReelReply,
      ClubRoom,          // <-- rooms created by the user
      reviewModel,
      // postReportModel
    ];

    await Promise.all(
      ownedModels.map(async (Model) => {
        const filter = {
          $or: [
            { userid: userObjId },
            { otheruserid: userObjId },
            { senderid: userObjId },
            { receiverid: userObjId },
            { participantOneId: userObjId },
            { participantTwoId: userObjId },
          ],
        };
        await Model.deleteMany(filter, { session });
      })
    );

    // --------------------------------------------------------------
    // 3. Delete *clubs* owned by the user
    // --------------------------------------------------------------
    const ownedClubs = await Club.find({ userid: userObjId }, { _id: 1 }, { session });
    const ownedClubIds = ownedClubs.map((c) => c._id);

    // a) delete the clubs themselves
    await Club.deleteMany({ _id: { $in: ownedClubIds } }, { session });

    // b) remove the club ids from every member's `clubsJoined`
    if (ownedClubIds.length) {
      await User.updateMany(
        { clubsJoined: { $in: ownedClubIds } },
        { $pull: { clubsJoined: { $in: ownedClubIds } } },
        { session }
      );
    }

    // --------------------------------------------------------------
    // 4. Pull user id from *reference arrays* in every model
    // --------------------------------------------------------------

    // ---- POST ----
    await Post.updateMany(
      {
        $or: [
          { likes: userObjId },
          { comments: userObjId },
          { savedBy: userObjId },
          { canView: userObjId },
          { taggedUsers: userObjId }
        ],
      },
      {
        $pull: {
          likes: userObjId,
          comments: userObjId,
          savedBy: userObjId,
          canView: userObjId,
          taggedUsers: userObjId,
        },
      },
      { session }
    );

    // ---- REEL ----
    await Reel.updateMany(
      {
        $or: [{ likes: userObjId }, { viewedBy: userObjId }, { taggedUsers: userObjId }],
      },
      {
        $pull: {
          likes: userObjId,
          viewedBy: userObjId,
          taggedUsers: userObjId,
        },
      },
      { session }
    );

    // ---- COMMENT (post) ----
    await Comment.updateMany(
      {
        $or: [{ likes: userObjId }, { replies: userObjId }, { taggedUsers: userObjId }],
      },
      {
        $pull: {
          likes: userObjId,
          replies: userObjId,
          taggedUsers: userObjId,
        },
      },
      { session }
    );

    // ---- REELCOMMENT ----
    await ReelComment.updateMany(
      {
        $or: [{ likes: userObjId }, { replies: userObjId }, { taggedUsers: userObjId }],
      },
      {
        $pull: {
          likes: userObjId,
          replies: userObjId,
          taggedUsers: userObjId,
        },
      },
      { session }
    );

    // ---- REPLY (post comment replies) ----
    await Reply.updateMany(
      {
        $or: [{ likes: userObjId }, { taggedUsers: userObjId }],
      },
      {
        $pull: {
          likes: userObjId,
          taggedUsers: userObjId,
        },
      },
      { session }
    );

    // ---- REELREPLY (reel comment replies) ----
    await ReelReply.updateMany(
      {
        likes: userObjId,
      },
      {
        $pull: {
          likes: userObjId,
        },
      },
      { session }
    );

    // ---- CLUB (members array) ----
    await Club.updateMany(
      { members: userObjId },
      { $pull: { members: userObjId } },
      { session }
    );

    // ---- CLUBROOM (members array) ----
    await ClubRoom.updateMany(
      { members: userObjId },
      { $pull: { members: userObjId } },
      { session }
    );

    // ---- USER (followers / following / savedPosts / etc.) ----
    await User.updateMany(
      {
        $or: [
          { followers: userObjId },
          { following: userObjId },
          { savedPosts: userObjId },
          { posts: userObjId },
          { reels: userObjId },
          { blocked: userObjId },
          { clubsJoined: userObjId },
          { presentModerators: userObjId },
          { presentBroadcasters: userObjId },
          { "interactedReels.reelId": userObjId },
        ],
      },
      {
        $pull: {
          followers: userObjId,
          following: userObjId,
          savedPosts: userObjId,
          posts: userObjId,
          reels: userObjId,
          blocked: userObjId,
          clubsJoined: userObjId,
          presentModerators: userObjId,
          presentBroadcasters: userObjId,
          interactedReels: { reelId: userObjId },
        },
      },
      { session }
    );

    // --------------------------------------------------------------
    // 5. Commit transaction
    // --------------------------------------------------------------
    await session.commitTransaction();
    res.status(200).json({ message: "User and all related data deleted successfully" });
  } catch (err) {
    await session.abortTransaction();
    console.error("deleteUser error:", err);
    res.status(500).json({ error: err.message });
  } finally {
    session.endSession();
  }
};

const generateShareableProfileLink = async (req, res) => {
  const userId = req.params.userId;
  console.log("userid: ", userId);
  var user = await User.findById(userId);
  if (user) {
    const deepLink = `${process.env.BASE_URL}/OtherProfileView/${userId}`;
    res.send({ deepLink });
  } else {
    res.send("Invalid userid");
  }
};
const getUserByRemoteId = async (req, res) => {
  try {
    const remoteid = req.params.remoteid;
    var user = await User.findOne({ liveRemoteId: remoteid });
    if (user) {
      user = user.toObject();
      user.profilePictureUrl = await getPicUrl(user._id);
      res.status(200).json({
        user,
      });
    } else {
      res.send("Invalid remote id");
    }
  } catch (error) {
    res.status(400).json(error);
  }
};

const setUserRemoteId = async (req, res) => {
  try {
    const { userid, remoteid } = req.body;
    var remoteUser = await User.findOne({ liveRemoteId: remoteid });
    // if (remoteUser) {
    //   throw Error("A user already has this remoteid");
    // }
    var user = await User.findById(userid);
    if (user) {
      await user.updateOne({
        liveRemoteId: remoteid,
      });
    } else {
      res.send("Invalid userid");
    }

    res.status(200).json({
      messge: "Remote id updated",
    });
  } catch (error) {
    res.status(400).json(error);
  }
};

const updateUserBank = async (req, res) => {
  try {
    const { 
      userid,
      name,
      accountNumber,
      addressLine1,
      addressLine2,
      city,
      province,
      postalCode,
      receivingBank,
      routingNumber,
      swiftCode,
      intermediaryBankName,
      internationalBankName,
      referenceInformation,
      purposeOfPayment
    } = req.body;

    // Fetch the user by ID
    const user = await User.findById(userid);
    if (!user) {
      return res.status(404).json({ success: false, message: "User not found" });
    }

    // If user has no bank account associated, create one
    if (!user.bankAccount) {
      const bankAccount = await BankAccount.create({
        userid,
        name,
        accountNumber,
        addressLine1,
        addressLine2,
        city,
        province,
        postalCode,
        receivingBank,
        routingNumber,
        swiftCode,
        intermediaryBankName,
        internationalBankName,
        referenceInformation,
        purposeOfPayment
      });

      // Link the bank account to the user
      user.bankAccount = bankAccount._id;
      await user.save();
    } else {
      // Fetch the existing bank account
      const bankAccount = await BankAccount.findById(user.bankAccount);
      if (!bankAccount) {
        return res.status(400).json({ success: false, message: "Unable to fetch bank account" });
      }

      // Update the existing bank account
      bankAccount.name = name;
      bankAccount.accountNumber = accountNumber;
      bankAccount.addressLine1 = addressLine1;
      bankAccount.addressLine2 = addressLine2;
      bankAccount.city = city;
      bankAccount.province = province;
      bankAccount.postalCode = postalCode;
      bankAccount.receivingBank = receivingBank;
      bankAccount.routingNumber = routingNumber;
      bankAccount.swiftCode = swiftCode;
      bankAccount.intermediaryBankName = intermediaryBankName;
      bankAccount.internationalBankName = internationalBankName;
      bankAccount.referenceInformation = referenceInformation;
      bankAccount.purposeOfPayment = purposeOfPayment;

      await bankAccount.save();
    }

    // Send a success response
    res.status(200).json({
      success: true,
      message: "Bank account updated successfully",
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateUserPaypal = async (req, res) => {
  try {
    const { 
      userid,
      name,
      email
    } = req.body;
    var user = await User.findById(userid);
    if (!user) {
      throw Error("User not found");
    }
    if(!user.paypalAccount){
      var paypalAccount = await PaypalAccount.create({
        userid,
        name,
        email
      });

      await user.updateOne({
        paypalAccount: paypalAccount._id
      })
    }else{
      var paypalAccount = await PaypalAccount.findById(user.paypalAccount);
      if(!paypalAccount){
        res.status(400).json({
          success: false,
          message: "unable to fetch paypalAccount"
        })
      }
      await paypalAccount.updateOne({
        userid,
        name,
        email
      });
    }
    res.status(200).json({
      messge: "paypal account created",
    });
  } catch (error) {
    res.status(400).json(error);
  }
};

const deleteUserByUsername = async (req, res) => {
  try {
    var { username } = req.query;
    var user = await User.findOne({
      username,
    });
    if (user) {
      var userid = user._id.toString();
      // var deleted = [];
      await user.deleteOne();
      var models = [
        Post,
        Reel,
        Story,
        Activity,
        Stream,
        Wallet,
        Comment,
        ReelComment,
      ];
      await Promise.all(
        models.map(async (model) => {
          var modelDatas = await model.find({
            $or: [{ userid: userid }, { otheruserid: userid }],
          });

          // var deletedModelData = [];
          await Promise.all(
            modelDatas.map(async (modelData) => {
              // deletedModelData.push(modelData)
              await modelData.deleteOne();
            })
          );
          // deleted.push({
          //   model,
          //   data: deletedModelData
          // })
        })
      );
      // var deletedFollowers = [];
      var us = await User.find({});
      await Promise.all(
        us.map(async (u) => {
          var useridobject = userid.toString();
          await u.updateOne({ $pull: { following: useridobject } });
          await u.updateOne({ $pull: { followers: useridobject } });
          // deletedFollowers.push(u);
        })
      );
      // deleted.push({
      //   model: "followers and followings",
      //   data: deletedFollowers
      // })

      res.status(200).json({
        message: "User deleted successfully!",
      });
    } else {
      res.status(200).json({
        error: "Please enter correct username",
        username,
      });
    }
    // }else{
    //   throw Error("User not found!")
    // }
  } catch (err) {
    res.status(200).json({
      message: "There was some error deleting user",
      error: err.message,
    });
  }

  
};

const getUserSubscription = async(req, res)=>{
  const {userid} = req.params;
  var user = await User.findById(userid);
  if(!user){
    res.status(400).json({
      message: "User not found"
    })
    return;
  }

  var subscribedProducts = user.subscribedProducts;
  res.status(200).json({subscribedProducts})
}

const getUserVerifiedStatus = async(req, res)=>{
  const {userid} = req.params;
  var user = await User.findById(userid);
  if(!user){
    res.status(400).json({
      message: "User not found"
    })
    return;
  }

  const currentDate = new Date();
  var verified = false;
  if(currentDate <= user.verifiedExpiration && user.lemVerified){
    verified = true;
  }
  await user.updateOne({
    isVerified: verified
  })
  res.status(200).json({isVerified: verified})
}

const getUserLemVerified = async(req, res)=>{
  const {userid} = req.params;
  var user = await User.findById(userid);
  if(!user){
    res.status(400).json({
      message: "User not found"
    })
    return;
  }

  res.status(200).json({lemVerified: user.lemVerified})
}

const updateUserVerifiedAccountSubscription = async(req, res)=>{
  const {userid, type} = req.body;
  var user = await User.findById(userid);
  if(!user){
    res.status(400).json({
      message: "User not found"
    })
    return;
  }

  if(!user.lemVerified){
    res.status(400).json({
      message: "Please verify your identity first"
    })
    return;
  }
  const currentDate = new Date(); // Get today's date
  let expirationDate;

  // Add months or years based on the type
  if (type === "month") {
    expirationDate = new Date(currentDate.setMonth(currentDate.getMonth() + 1));
  } else if (type === "year") {
    expirationDate = new Date(currentDate.setFullYear(currentDate.getFullYear() + 1));
  } else {
    res.status(400).json({
      message: "Invalid type please give month or year"
    })
    return;
  }
  
  await user.updateOne({
    verifiedExpiration: expirationDate
  })
  res.status(200).json({
    success: true,
    message: "updated the verification status"
  })
}

const strikeUser = async(req, res)=>{
  const {userid, reason} = req.body;
  var user = await User.findById(userid);
  if(!user){
    res.status(400).json({
      message: "User not found"
    })
    return;
  }

  if(user.underStrike){
    res.status(400).json({
      message: "User is already under strike"
    })
    return;
  }
 
  await user.updateOne({
    $set: {
      underStrike: true
    },
    $push:{
      strikeHistory: {
        reason,
        startDate: Date.now(),
        status: "active"
      }
    }
  })

  await sendCustomNotification(userid, "Account Striked", "You have got a strike on your account");
  await createActivity(
    userid.toString(),
    undefined,
    `You have got a strike on your account`,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "strike",
    {reason}
  );
  res.status(200).json({
    success: true,
    message: "User striked"
  })
}

const liftStrike = async(req, res)=>{
  const {userid} = req.body;
  var user = await User.findById(userid);
  if(!user){
    res.status(400).json({
      message: "User not found"
    })
    return;
  }

  if(!user.underStrike){
    res.status(400).json({
      message: "User is not under strike"
    })
    return;
  }
 
  
  var updatedStrikeHistory = []
  user.strikeHistory.map(strike =>{
    strike = strike.toObject()
    if(strike.status == "active"){
      strike.status = "lifted"
      strike.endDate = Date.now()
    }
    updatedStrikeHistory.push(strike)
  })
  
  await user.updateOne({
      underStrike: false,
      strikeHistory: updatedStrikeHistory
  })

  await sendCustomNotification(userid, "Account Strike Lifted", "Your account strike has been lifted");
  await createActivity(
    userid.toString(),
    undefined,
    `Your account strike has been lifted`,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "strike",
    ""
  );
  res.status(200).json({
    success: true,
    message: "User strike lifted"
  })
}

var adminPanel = "https://frenzone-admin.netlify.app/frenzone"
const supportEmailTemplate = (name, email, userid, message, imagesUrls)=>{
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Support Ticket Notification</title>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
<!-- Preheader : shows in inbox preview -->
<div style="display:none;max-height:0px;overflow:hidden;color:#fff;opacity:0;">New support ticket from ${name} — UserId #${userid}</div>

<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr>
<td align="center" style="padding:24px 12px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.06);">

<!-- Header -->
<tr>
<td style="background:#0b74de;padding:18px 24px;color:#ffffff;">
<h1 style="margin:0;font-size:20px;letter-spacing:0.2px;">Support Ticket Received</h1>
<p style="margin:6px 0 0;font-size:13px;opacity:0.95;">UserId #<strong>${userid}</strong></p>
</td>
</tr>

<!-- Body -->
<tr>
<td style="padding:20px 24px;color:#111827;">
<p style="margin:0 0 12px;font-size:15px;">Hello,</p>

<p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#374151;">You have received a new support ticket. Below are the details:</p>

<!-- Ticket details -->
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-collapse:separate;">
<tr>
<td style="padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #eef2f6;font-size:14px;">
<strong>Username:</strong> ${name}<br>
<strong>Email:</strong> <a href="mailto:${email}" style="color:#0b74de;text-decoration:none;">${email}</a><br>
<strong>User ID:</strong> ${userid}<br>
</td>
</tr>
</table>

<!-- Message -->
<div style="margin-top:16px;padding:14px;border-radius:6px;background:#ffffff;border:1px solid #e6eef9;font-size:14px;color:#111827;">
<strong style="display:block;margin-bottom:8px;color:#111827;">Message:</strong>
<div style="white-space:pre-wrap;line-height:1.6;color:#374151;">${message}</div>
</div>

<!-- Images Grid (NEW SECTION - RESPONSIVE) -->
${imagesUrls && imagesUrls.length > 0 ? `
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:24px;">
<tr>
<td>
<strong style="display:block;margin-bottom:12px;font-size:15px;color:#111827;">Attached Images:</strong>
</td>
</tr>
<tr>
<td>
<table role="presentation" cellpadding="0" cellspacing="0" width="100%">
<tr>
${imagesUrls.map(url => `
<td align="center" valign="top" width="50%" style="padding:6px;">
<table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="border-radius:8px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.1);">
<tr>
<td>
<img src="${url}" alt="Support ticket attachment" width="100%" style="display:block;border:0;border-radius:8px;max-width:280px;" />
</td>
</tr>
</table>
</td>
`).join('')}
</tr>
</table>
</td>
</tr>
</table>
` : ''}

</td>
</tr>
</table>
</td>
</tr>
</table>
</body>
</html>`
}

const reportEmailTemplate = (name, email, userid, message, postid, reportid, reportedUsername, type)=>{
  return `<!doctype html>
    <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width,initial-scale=1">
        <title>Support Ticket Notification</title>
      </head>
      <body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
        <!-- Preheader : shows in inbox preview -->
        <div style="display:none;max-height:0px;overflow:hidden;color:#fff;opacity:0;">New support ticket from ${name}</div>


        <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
          <tr>
            <td align="center" style="padding:24px 12px;">
              <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;background:#ffffff;border-radius:8px;overflow:hidden;box-shadow:0 4px 14px rgba(0,0,0,0.06);">


                <!-- Header -->
                <tr>
                  <td style="background:#0b74de;padding:18px 24px;color:#ffffff;">
                    <h1 style="margin:0;font-size:20px;letter-spacing:0.2px;">Support Ticket Received</h1>
                    <p style="margin:6px 0 0;font-size:13px;opacity:0.95;">User #<strong>${name}</strong></p>
                  </td>
                </tr>


                <!-- Body -->
                <tr>
                  <td style="padding:20px 24px;color:#111827;">
                    <p style="margin:0 0 12px;font-size:15px;">Hello,</p>


                    <p style="margin:0 0 12px;font-size:14px;line-height:1.5;color:#374151;">You have received a new support ticket. Below are the details:</p>


                    <!-- Ticket details -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:12px;border-collapse:separate;">
                      <tr>
                        <td style="padding:10px;background:#f8fafc;border-radius:6px;border:1px solid #eef2f6;font-size:14px;">
                          <strong>Reporter username:</strong> ${name}<br>
                          <strong>Reported username:</strong> ${reportedUsername}<br>
                          <strong>Report type:</strong> ${type}<br>
                          <strong>Email:</strong> <a href="mailto:${email}" style="color:#0b74de;text-decoration:none;">${email}</a><br>
                          <strong>User ID:</strong> ${userid}<br>
                          <strong>Report:</strong> ${adminPanel}/report/${reportid}<br>
                        </td>
                      </tr>
                    </table>


                    <!-- Message -->
                    <div style="margin-top:16px;padding:14px;border-radius:6px;background:#ffffff;border:1px solid #e6eef9;font-size:14px;color:#111827;">
                      <strong style="display:block;margin-bottom:8px;color:#111827;">Message:</strong>
                      <div style="white-space:pre-wrap;line-height:1.6;color:#374151;">${message}</div>
                    </div>


                    <!-- Actions -->
                    <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin-top:18px;">
                    </table>

                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </body>
    </html>`
}

const userReportEmailTemplate = (
  reason,
  reporterUsername,
  reporterProfilePicUrl,
  reportedUsername,
  reportedProfilePicUrl,
  reportId,
  adminPanelUrl = "https://youradminpanel.com"
) => {
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>User Report Notification</title>
  <style>
    body { margin:0; padding:0; background:#f4f6f8; font-family:Arial,Helvetica,sans-serif; }
    a { color:#0b74de; text-decoration:none; }
  </style>
</head>
<body style="margin:0;padding:0;background-color:#f4f6f8;font-family:Arial,Helvetica,sans-serif;">
  <!-- Preheader -->
  <div style="display:none;max-height:0;overflow:hidden;color:#fff;opacity:0;">
    New user report: ${reporterUsername} reported ${reportedUsername}
  </div>

  <table role="presentation" cellpadding="0" cellspacing="0" width="100%">
    <tr>
      <td align="center" style="padding:32px 16px;">
        <table role="presentation" cellpadding="0" cellspacing="0" width="620" style="max-width:620px;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 8px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:linear-gradient(135deg,#0b74de,#1e40af);padding:28px 32px;text-align:center;color:#ffffff;">
              <h1 style="margin:0;font-size:24px;font-weight:600;letter-spacing:0.3px;">
                User Report Received
              </h1>
              <p style="margin:8px 0 0;font-size:15px;opacity:0.95;">
                A user has been reported on the platform
              </p>
            </td>
          </tr>

          <!-- Main Content -->
          <tr>
            <td style="padding:32px;color:#1f2937;">

              <p style="margin:0 0 24px;font-size:16px;color:#374151;">
                Hello Admin,
              </p>
              <p style="margin:0 0 20px;font-size:15px;line-height:1.6;color:#4b5563;">
                A new user report has been submitted. Please review the details below:
              </p>

              <!-- Reason of Report -->
              <div style="background:#f1f5f9;padding:16px 20px;border-radius:8px;border-left:4px solid #0b74de;margin-bottom:28px;">
                <strong style="color:#0b74de;font-size:15px;">Reason for Report:</strong>
                <p style="margin:8px 0 0;font-size:15px;color:#1e293b;line-height:1.6;">
                  ${reason || "No reason provided"}
                </p>
              </div>

              <!-- Reporter & Reported User Cards -->
              <table role="presentation" cellpadding="0" cellspacing="0" width="100%" style="margin:28px 0;">
                <tr>
                  <!-- Reporter -->
                  <td width="50%" style="padding-right:12px;">
                    <div style="background:#fff;border:1px solid #e2e8f0;border-radius:10px;padding:18px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                      <p style="margin:0 0 12px;color:#64748b;font-size:13px;text-transform:uppercase;letter-spacing:0.8px;">
                        Reporter
                      </p>
                      <img src="${reporterProfilePicUrl || 'https://via.placeholder.com/80?text=User'}" 
                           alt="${reporterUsername}" 
                           width="80" height="80" 
                           style="border-radius:50%;object-fit:cover;border:3px solid #e0e7ff;margin-bottom:12px;">
                      </img>
                      <p style="margin:0;font-size:17px;font-weight:600;color:#1e293b;">
                        @${reporterUsername}
                      </p>
                    </div>
                  </td>

                  <!-- Reported User -->
                  <td width="50%" style="padding-left:12px;">
                    <div style="background:#fff;border:1px solid #fecaca;border-radius:10px;padding:18px;text-align:center;box-shadow:0 2px 8px rgba(0,0,0,0.05);">
                      <p style="margin:0 0 12px;color:#ef4444;font-size:13px;text-transform:uppercase;letter-spacing:0.8px;">
                        Reported User
                      </p>
                      <img src="${reportedProfilePicUrl || 'https://via.placeholder.com/80?text=User'}" 
                           alt="${reportedUsername}" 
                           width="80" height="80" 
                           style="border-radius:50%;object-fit:cover;border:3px solid #fee2e2;margin-bottom:12px;">
                      </img>
                      <p style="margin:0;font-size:17px;font-weight:600;color:#991b1b;">
                        @${reportedUsername}
                      </p>
                    </div>
                  </td>
                </tr>
              </table>

              <!-- Action Button -->
              <div style="text-align:center;margin:32px 0;">
                <a href="${adminPanelUrl}" 
                   style="background:#0b74de;color:#ffffff;font-size:15px;font-weight:600;padding:14px 32px;border-radius:8px;display:inline-block;text-decoration:none;box-shadow:0 4px 12px rgba(11,116,222,0.3);">
                   Review Report in Admin Panel
                </a>
              </div>

              <hr style="border:none;border-top:1px solid #e5e7eb;margin:32px 0;">

              <p style="margin:0;font-size:13px;color:#6b7280;text-align:center;">
                Report ID: <strong>${reportId}</strong><br>
                This is an automated notification from the reporting system.
              </p>

            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#f8fafc;padding:20px;text-align:center;font-size:13px;color:#9ca3af;">
              <p style="margin:0;">
                © ${new Date().getFullYear()} Frenzone. All rights reserved.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
};

const sendSupportTicket = async (req, res) => {
  try {
    const { userid, message } = req.body;
    const user = await User.findById(userid);

    if (!user) {
      res.json({
        success: false,
        message: "User not found"
      }).status(400);
      return;
    }

    console.log("user: ", user._id)

    const images = req.files || []; // This will be [] if no files
    const imagesUrls = [];

    console.log(`Received ${images.length} images`);
    await Promise.all(
      images.map(async (file) => {
        imagesUrls.push(await aws.getLinkFromAWS(await aws.uploadToAWS(file)))
      })
    )

    console.log("urls: ", imagesUrls)

    var email = "support@frenzonelive.zohodesk.ca"
    // var email = "khawarsaleem7865@gmail.com"
    await sendCustomMail("New Support Ticket", email, supportEmailTemplate(user.username, user.email, user._id.toString(), message, imagesUrls))

    res.status(200).json({
      success: true,
      message: "Support message sent",
    });
  } catch (error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const sendReport = async (req, res) => {
  try {
    const { userid, message, postid, type } = req.body;
    const user = await User.findById(userid);

    if(!["nudity", "harmful"].includes(type)){
      res.json({
        success: false,
        message: "Please provide valid 'type' which could be either 'nudity' or 'harmful'"
      }).status(400);

      return;
    }

    if (!user) {
      res.json({
        success: false,
        message: "User not found"
      }).status(400);

      return;
    }
    
    const post = await Post.findById(postid).populate("userid");

    if (!post) {
      res.json({
        success: false,
        message: "post not found"
      }).status(400);

      return;
    }

    var email = "report@frenzonelive.zohodesk.ca"
    // var email = "khawarsaleem7865@gmail.com"
    var postReport = await postReportModel.create({
      userid,
      message,
      postid,
      reported: post.userid._id,
      type
    })

    if(postReport){
      await sendCustomMail("New Report Submission", email, reportEmailTemplate(user.username, user.email, user._id.toString(), message, post._id.toString(), postReport._id, post.userid.username, type ))
    }else{
      res.json({
        success: false,
        message: "Unable to send report"
      }).status(400);

      return;
    }

    res.status(200).json({
      success: true,
      message: "Report message sent",
    });
  }catch(error) {
    res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getAllReports = async (req, res) => {
  try {
    console.log("gojasldfjk")
    let apiFeature = new ApiFeatures(postReportModel.find({}).populate({
        path: 'userid',
        select: 'username firstname lastname profilePicture email ipAddress address'
      }).populate({
        path: 'reported',
        select: 'username firstname lastname profilePicture email ipAddress address'
      }).lean(), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (report) => {
        if(report?.userid?._id){
          report.userid.profilePicUrl = await getPicUrl(report.userid._id);
          report.userid.username = report.userid.username
        }
        // else{
        //   report.userid.profilePicUrl = ""
        // }
        if(report?.reported?._id){
          report.reported.profilePicUrl = await getPicUrl(report.reported._id);
        }
        // else{
        //   report.reported.profilePicUrl = ""
        // }
        report.postid = await getPostReport(report.postid)
        return report;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, reports: result });
  }catch (error) {
    console.log("error: ", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

const getReportById = async (req, res) => {
  try {
    const reportid = req.params.reportid;
    let report = await postReportModel.findById(reportid).populate("userid").lean()
    if (!report) {
      throw Error("report Not Found");
    }

    report.userid.profilePictureUrl = await getPicUrl(report.userid._id);
    report.postid = await getPostReport(report.postid)
    res.status(200).json({
      report,
    });
  }catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const SUMSUB_BASE_URL = 'https://api.sumsub.com';

// Keep Sumsub signing scoped to this client. A global Axios interceptor would
// also sign unrelated requests made by this controller/module.
const sumsubClient = axios.create({
  baseURL: SUMSUB_BASE_URL,
});

sumsubClient.interceptors.request.use(createSignature, function (error) {
  return Promise.reject(error);
});

// Function to create signature for the request
function createSignature(config) {
  const ts = Math.floor(Date.now() / 1000).toString();
  const signature = crypto.createHmac('sha256', process.env.SUMSUB_APP_SECRET);
  signature.update(ts + config.method.toUpperCase() + config.url);

  if (config.data instanceof FormData) {
    signature.update(config.data.getBuffer());
  } else if (config.data) {
    // Axios sends string data verbatim. Sign those exact bytes; stringifying
    // it again would add quotes and produce a signature mismatch.
    signature.update(
      typeof config.data === 'string' ? config.data : JSON.stringify(config.data)
    );
  }

  config.headers = config.headers || {};
  config.headers['X-App-Token'] = process.env.SUMSUB_APP_TOKEN;
  config.headers['X-App-Access-Ts'] = ts;
  config.headers['X-App-Access-Sig'] = signature.digest('hex');

  return config;
}

// function createSignature(config) {
//   console.log('Creating signature for request...');

//   const ts = Math.floor(Date.now() / 1000).toString(); // better as string from the beginning

//   let stringToSign = ts + config.method.toUpperCase() + config.url;

//   // Add body exactly as it will be sent (very important!)
//   if (config.data) {
//     if (config.data instanceof FormData) {
//       // Very rare case — usually not needed for /accessTokens/sdk
//       stringToSign += config.data.getBuffer ? config.data.getBuffer() : '';
//     } else if (typeof config.data === 'string') {
//       stringToSign += config.data;           // ← JSON string is fine
//     } else {
//       stringToSign += JSON.stringify(config.data); // ← fallback
//     }
//   }

//   console.log('String to sign (debug):', stringToSign);

//   const signature = crypto
//     .createHmac('sha256', process.env.SUMSUB_APP_SECRET)
//     .update(stringToSign)
//     .digest('hex');   // ← lowercase hex — Sumsub requires it

//   config.headers = config.headers || {};
//   config.headers['X-App-Access-Ts']  = ts;
//   config.headers['X-App-Access-Sig'] = signature;

//   return config;
// }

// Function to configure the access token request
// function createAccessToken(userId, levelName = 'frenzone-production-verification', ttlInSecs = 600) {
//   console.log("Creating an access token for initializing SDK...");

//   var body = {
//     userId: userId,
//     levelName: levelName,
//     ttlInSecs: ttlInSecs,
//   };

//   var method = 'POST';
//   var url = '/resources/accessTokens/sdk';

//   var headers = {
//     Accept: 'application/json',
//     'Content-Type': 'application/json',
//     'X-App-Token': process.env.SUMSUB_APP_TOKEN,
//   };

//   config.method = method;
//   config.url = url;
//   config.headers = headers;
//   config.data = JSON.stringify(body); // Stringify the body to match the signature requirement

//   console.log("config access token: ", config)
//   return config;
// }

function createAccessToken(userId, levelName = 'frenzone-production-verification', ttlInSecs = 600) {
  const body = {
    userId: userId,
    levelName: levelName,
    ttlInSecs: ttlInSecs,
  };

  return {
    method: 'POST',
    url: '/resources/accessTokens/sdk',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      'X-App-Token': process.env.SUMSUB_APP_TOKEN,
    },
    // Sign the exact JSON bytes Axios sends to Sumsub.
    data: JSON.stringify(body),
  };
}

// Route handler to get Sumsub access token
const getSumsubAccessToken = async (req, res) => {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId);

    if (!user) {
      return res.status(400).json({
        success: false,
        message: "User not found",
      });
    }

    if(["pending", "permanent_rejected", "approved"].includes(user.identifyApprovalStatus)){
      return res.status(400).json({
        success: false,
        message: "You can't start ID Verification as your application is either already under review, rejected or approved"
      });
    }

    // Use the createAccessToken function to prepare the config
    const requestConfig = createAccessToken(userId, process.env.LEVEL_NAME, 600);

    // Make the request using Axios with the configured interceptor
    const response = await sumsubClient(requestConfig);

    return res.status(200).json({
      success: true,
      result: response.data, // Return the response data
    });
  } catch (error) {
    const upstreamStatus = error.response?.status;
    const upstreamMessage = error.response?.data?.description ||
      error.response?.data?.message ||
      error.response?.data?.error ||
      error.message;

    console.error("Sumsub access-token request failed", {
      status: upstreamStatus,
      message: upstreamMessage,
      code: error.code,
    });

    return res.status(upstreamStatus && upstreamStatus >= 400 && upstreamStatus < 500 ? upstreamStatus : 502).json({
      success: false,
      message: upstreamMessage,
    });
  }
};

const sumsubWebhook = async (req, res) => {
  try {
    console.log("webhook data: ", req.body)
    var webhookData = req.body;
    
    var user = await User.findById(webhookData.externalUserId);
    if(!user){
      return res.status(400).json({
        success: false,
        message: "Invalid externalUserId",
      });
    }
    var userUpdate = {};

    var notificationTitle = "";
    var notificationSubtitle = ""
    var applicationStatus = ""

    if(webhookData.type == "applicantPending" && webhookData.reviewStatus == "pending"){
      notificationTitle = "ID Verification Update";
      notificationSubtitle = "Your ID Verification is under review";
      userUpdate["identifyApprovalStatus"] = "pending";
      applicationStatus = "pending";
    }else if(webhookData.type == "applicantReviewed" && webhookData.reviewStatus == "completed"){
      if(webhookData.reviewResult.reviewAnswer == "RED"){
        if(webhookData.reviewResult.reviewRejectType == "RETRY"){
          userUpdate["identifyApprovalStatus"] = "temporary_rejected";
          applicationStatus = "temporary_rejected";
          userUpdate["identifyApprovalMessage"] = webhookData.reviewResult.clientComment;
          notificationTitle = "ID Verification Update";
          notificationSubtitle = "Your ID Verification has some action to perform";
        }else{
          userUpdate["identifyApprovalStatus"] = "permanent_rejected";
          applicationStatus = "permanent_rejected";
          userUpdate["identifyApprovalMessage"] = webhookData.reviewResult.clientComment;
          notificationTitle = "ID Verification Update";
          notificationSubtitle = "Your ID Verification has been rejected";
        }
      }else if(webhookData.reviewResult.reviewAnswer == "GREEN"){
        userUpdate["identifyApprovalStatus"] = "approved";
        applicationStatus = "approved";
        userUpdate["identityVerified"] = true;
        notificationTitle = "ID Verification Update";
        notificationSubtitle = "Congratulations! Your ID Verification is approved";
      }
    }else{
      return res.status(200).json({
        success: true
      });
    }

    await user.updateOne(userUpdate)
    
    await sendCustomNotification(user._id.toString(), notificationTitle, notificationSubtitle);
    await createActivity(
      user._id.toString(),
      undefined,
      notificationSubtitle,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "id-verification",
      {status: applicationStatus}
    );

    return res.status(200).json({
      success: true,
      body: req.body 
    });
  } catch (error) {
    console.log("Error:", error);
    return res.status(400).json({
      success: false,
      message: error.message,
    });
  }
};

const getIdVerificationStatus = async (req, res) => {
  try {
    const userid = req.params.userid;
    let user = await User.findById(userid)
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "user Not Found"
      })
    }

    res.status(200).json({
      success: true,
      identityVerified: user.identityVerified,
      identifyApprovalStatus: user.identifyApprovalStatus,
      identifyApprovalMessage: user.identifyApprovalMessage
    })
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const DIDIT_BASE_URL = "https://verification.didit.me";

const createDiditSession = async (req, res) => {
  try {
    const { userId } = req.params;
    if (req.userId && req.userId.toString() !== userId.toString()) return res.status(403).json({ success: false, message: "Not allowed" });
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (["pending", "approved"].includes(user.identifyApprovalStatus)) return res.status(400).json({ success: false, message: "Verification is already in progress or complete" });
    if (!process.env.DIDIT_API_KEY || !process.env.DIDIT_WORKFLOW_ID) return res.status(503).json({ success: false, message: "Didit verification is not configured" });
    // Keep this payload aligned with the minimal request verified against Didit.
    // Optional profile fields are deliberately omitted because legacy Frenzone
    // DOB/phone values are not guaranteed to use Didit's validation formats.
    const response = await axios.post(`${DIDIT_BASE_URL}/v3/session/`, {
      workflow_id: process.env.DIDIT_WORKFLOW_ID,
      vendor_data: user._id.toString(),
      callback: process.env.DIDIT_CALLBACK_URL || "frenzone://verification/callback",
      callback_method: "both",
    }, { headers: { "x-api-key": process.env.DIDIT_API_KEY, "Content-Type": "application/json" } });
    await user.updateOne({ diditSessionId: response.data.session_id, identifyApprovalStatus: "none", identifyApprovalMessage: "" });
    return res.status(200).json({ success: true, url: response.data.url, sessionId: response.data.session_id });
  } catch (error) {
    const status = error.response?.status;
    const message = error.response?.data?.detail || error.response?.data?.message || (typeof error.response?.data === "string" ? error.response.data : error.message);
    console.error("Didit session creation failed", { status, message, response: error.response?.data });
    return res.status(status >= 400 && status < 500 ? status : 502).json({ success: false, message });
  }
};

const sortDiditKeys = (value) => {
  if (Array.isArray(value)) return value.map(sortDiditKeys);
  if (value && typeof value === "object") return Object.keys(value).sort().reduce((result, key) => { result[key] = sortDiditKeys(value[key]); return result; }, {});
  if (typeof value === "number" && !Number.isInteger(value) && value % 1 === 0) return Math.trunc(value);
  return value;
};

const safeDiditSignature = (expected, received) => {
  if (!received || !/^[a-f0-9]{64}$/i.test(received)) return false;
  const a = Buffer.from(expected, "utf8"); const b = Buffer.from(received, "utf8");
  return a.length === b.length && crypto.timingSafeEqual(a, b);
};

const diditWebhook = async (req, res) => {
  try {
    const secret = process.env.DIDIT_WEBHOOK_SECRET;
    const timestamp = req.get("X-Timestamp");
    const body = req.body;
    if (!secret || !timestamp || Math.abs(Math.floor(Date.now() / 1000) - Number(timestamp)) > 300) return res.status(401).json({ success: false, message: "Invalid webhook timestamp" });
    const canonical = JSON.stringify(sortDiditKeys(body));
    const v2 = crypto.createHmac("sha256", secret).update(canonical, "utf8").digest("hex");
    const simple = [body.timestamp ?? "", body.session_id ?? "", body.status ?? "", body.webhook_type ?? ""].join(":");
    const simpleSignature = crypto.createHmac("sha256", secret).update(simple).digest("hex");
    if (!safeDiditSignature(v2, req.get("X-Signature-V2")) && !safeDiditSignature(simpleSignature, req.get("X-Signature-Simple"))) return res.status(401).json({ success: false, message: "Invalid webhook signature" });
    if (!body.session_id || !["status.updated", "data.updated"].includes(body.webhook_type)) return res.sendStatus(200);
    const user = await User.findOne({ $or: [{ diditSessionId: body.session_id }, { _id: body.vendor_data }] });
    if (!user || (body.event_id && user.diditLastEventId === body.event_id) || Number(body.timestamp || 0) < Number(user.diditLastEventTimestamp || 0)) return res.sendStatus(200);
    const status = body.status;
    const update = { diditLastEventId: body.event_id || "", diditLastEventTimestamp: Number(body.timestamp || 0), diditSessionId: body.session_id };
    if (status === "Approved") { update.identityVerified = true; update.identifyApprovalStatus = "approved"; update.identifyApprovalMessage = ""; }
    else if (["In Review", "In Progress", "Awaiting User"].includes(status)) update.identifyApprovalStatus = "pending";
    else if (["Declined", "Abandoned", "Expired", "Kyc Expired"].includes(status)) { update.identityVerified = false; update.identifyApprovalStatus = "temporary_rejected"; update.identifyApprovalMessage = "Please retry identity verification."; }
    else if (status === "Resubmitted") update.identifyApprovalStatus = "none";
    else return res.sendStatus(200);
    await user.updateOne(update);
    return res.sendStatus(200);
  } catch (error) {
    console.error("Didit webhook failed", error);
    return res.status(500).json({ success: false, message: "Webhook processing failed" });
  }
};

const isUserIdVerified = async (req, res) => {
  try {
    const userid = req.params.userid;
    let user = await User.findById(userid)
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "user Not Found"
      })
    }

    res.status(200).json({
      success: true,
      identityVerified: user.identityVerified
    })
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const makeUserVerified = async (req, res) => {
  try {
    const userid = req.params.userid;
    let user = await User.findById(userid)
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "user Not Found"
      })
    }

    if(!user.identityVerified){
      return res.status(400).json({
        success: false,
        error: "User is not verified!"
      })
    }

    await user.updateOne({
      isVerified: true,
      liveAccess: true
    })

    res.status(200).json({
      success: true,
      identityVerified: true
    })
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const reportUser = async (req, res) => {
  try {
    const {userid, reporterid, reason} = req.body;
    let user = await User.findById(userid)
    if (!user) {
      return res.status(400).json({
        success: false,
        error: "user Not Found"
      })
    }

    let reporter = await User.findById(reporterid)
    if (!reporter) {
      return res.status(400).json({
        success: false,
        error: "reporter Not Found"
      })
    }

    let userReport = await userReports.findOne({userid})
    if (!userReport) {
      await userReports.create({
        userid,
        totalReports: 1,
        reports: [{
          reason: reason,
          reportedOn: Date.now(),
          reportedBy: reporterid
        }]
      })
    }else{
      await userReport.updateOne({
        $inc: {
          totalReports: 1
        },
        $push: {
          reports: {
            reason: reason,
            reportedOn: Date.now(),
            reportedBy: reporterid
          }
        }
      })
    }

    var email = "report@frenzonelive.zohodesk.ca"
    // var email = "khawarsaleem7865@gmail.com"
    await sendCustomMail(
      "New User Reported", 
      email, 
      userReportEmailTemplate(
        reason,
        reporter.username,
        reporter.profilePicture ? await aws.getLinkFromAWS(reporter.profilePicture) : "https://e7.pngegg.com/pngimages/84/165/png-clipart-united-states-avatar-organization-information-user-avatar-service-computer-wallpaper-thumbnail.png",
        user.username,
        user.profilePicture ? await aws.getLinkFromAWS(user.profilePicture) : "https://e7.pngegg.com/pngimages/84/165/png-clipart-united-states-avatar-organization-information-user-avatar-service-computer-wallpaper-thumbnail.png",
        user._id,
        `https://frenzone-admin.netlify.app/frenzone/user/reports/${user._id.toString()}`
      )
    )

    res.status(200).json({
      success: true,
      message: "user reproted"
    })
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllUsersReports = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(userReports.find({}).populate({
      path: 'userid',
      select: 'username firstname lastname profilePicture systemBlocked underStrike email ipAddress address'
    }).populate({
      path: 'reports.reportedBy',   // This populates reportedBy in each report
      select: 'username firstname lastname profilePicture email ipAddress address',
    }).lean(), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (reportDoc) => {
        // Main user (being reported)
        if (reportDoc.userid?._id) {
          reportDoc.userid.profilePicUrl = await getPicUrl(reportDoc.userid._id);
        }

        // Each reporter in the reports array
        if (reportDoc.reports && reportDoc.reports.length > 0) {
          reportDoc.reports = await Promise.all(
            reportDoc.reports.map(async (r) => {
              if (r.reportedBy?._id) {
                r.reportedBy.profilePicUrl = await getPicUrl(r.reportedBy._id);
              }
              return r;
            })
          );
        }

        return reportDoc;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, reports: result });
  } catch (error) {
    console.log("error: ", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

const getUserReports = async (req, res) => {
  try {
    var {userid} = req.params;
    var report = await userReports.findOne({userid}).populate({
      path: 'reports.reportedBy',   // This populates reportedBy in each report
      select: 'username firstname lastname profilePicture email ipAddress address',
    }).lean();
    if (!report) {
      res.status(200).json({
        success: true,
        reports: {
          userid,
          totalReports: 0,
          reports: []
        }
      })
      return;
    }

    if (report.reports && report.reports.length > 0) {
      report.reports = await Promise.all(
        report.reports.map(async (r) => {
          if (r.reportedBy?._id) {
            r.reportedBy.profilePicture = await getPicUrl(r.reportedBy._id);
          }
          return r;
        })
      );
    }

    res.status(200).json({ success: true, report });
  } catch (error) {
    console.log("error: ", error)
    res.status(400).json({
      error: error.message,
    });
  }
};


const updateVerifiedUsers = async (req, res) => { 
  try { 
    var {userids} = req.body; 
 
    if(!userids || userids.length != 5){ 
      return res.status(400).json({
            success: false,
            message: "please provide ids of 5 verifeid users"
          })
    }

    await Promise.all(
      userids.map(async (userid)=>{
        var user = await User.findById(userid);
        if(!user || !user.isVerified){
          return res.status(400).json({
            success: false,
            message: "some of the verified userids are wrong"
          })
        }
      })
    )

    var business = await Business.findOne({});
    if(!business){
      business = await Business.create({version: "1"})
    }
    await business.updateOne({
      mustSubscribeUsers: userids
    })

    res.status(200).json({ success: true, message: "users updated" });
  } catch (error) {
    console.log("error: ", error)
    res.status(400).json({
      error: error.message,
    });
  } 
}; 

const trackAppMinute = async (req, res) => {
  try {
    const userId = req.userId || req.authUserId || req.user?._id || req.authUser?._id;
    if (!userId) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    const now = new Date();
    const threshold = new Date(Date.now() - 55 * 1000);

    const updatedUser = await User.findOneAndUpdate(
      {
        _id: userId,
        $or: [
          { lastAppMinutePingAt: { $exists: false } },
          { lastAppMinutePingAt: null },
          { lastAppMinutePingAt: { $lte: threshold } },
        ],
      },
      {
        $inc: { minutesSpentInApp: 1 },
        $set: { lastAppMinutePingAt: now },
      },
      { new: true, projection: { minutesSpentInApp: 1, lastAppMinutePingAt: 1 } },
    );

    if (!updatedUser) {
      const user = await User.findById(userId).select("minutesSpentInApp lastAppMinutePingAt");
      return res.status(200).json({
        success: true,
        counted: false,
        minutesSpentInApp: user?.minutesSpentInApp || 0,
        lastAppMinutePingAt: user?.lastAppMinutePingAt || null,
      });
    }

    await updateRankingPointsForUser(userId);

    res.status(200).json({
      success: true,
      counted: true,
      minutesSpentInApp: updatedUser.minutesSpentInApp,
      lastAppMinutePingAt: updatedUser.lastAppMinutePingAt,
    });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({
      error: error.message,
    });
  }
};

const recalculateRankingPointsAllUsers = async (req, res) => {
  try {
    const users = await User.find({}).select("_id").lean();
    for (const u of users) {
      // sequential to avoid overloading DB; can be optimized later if needed
      await updateRankingPointsForUser(u._id);
    }
    res.status(200).json({ success: true, count: users.length, message: "Ranking points recalculated" });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({
      error: error.message,
    });
  }
};

const getCreatorBadges = async (badgeIds) => {
  const ids = (badgeIds || []).map((id) => id.toString());
  if (ids.length === 0) return [];

  const badges = await Badge.find({ _id: { $in: ids } }).select("title text image").lean();
  const byId = new Map(badges.map((b) => [b._id.toString(), b]));

  return Promise.all(
    ids
      .filter((id) => byId.has(id))
      .map(async (id) => {
        const b = byId.get(id);
        return {
          _id: b._id,
          title: b.title,
          text: b.text,
          imageUrl: await getBadgeImageUrl(b.image),
        };
      }),
  );
};

const getTopCreators = async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page || "1", 10));
    const limit = Math.min(50, Math.max(1, parseInt(req.query.limit || "10", 10)));
    const skip = (page - 1) * limit;

    const total = await User.countDocuments({});
    let creators = await User.find({})
      .sort({ rankingPoints: -1 })
      .skip(skip)
      .limit(limit)
      .select("firstname lastname username followers following rankingPoints badges profilePicture")
      .lean();

    creators = await Promise.all(
      creators.map(async (u) => ({
        _id: u._id,
        firstname: u.firstname || "",
        lastname: u.lastname || "",
        username: u.username,
        profilePicture: await getPicUrl(u._id),
        totalFollowers: Array.isArray(u.followers) ? u.followers.length : 0,
        totalFollowings: Array.isArray(u.following) ? u.following.length : 0,
        rankingPoints: u.rankingPoints || 0,
        badges: await getCreatorBadges(u.badges),
      })),
    );

    res.status(200).json({ success: true, page, limit, total, creators });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({ error: error.message });
  }
};

const getAllCreators = getTopCreators;

const assignBadgeToCreator = async (req, res) => {
  try {
    const { creatorId, badgeId } = req.body;
    if (!creatorId || !badgeId) {
      return res.status(400).json({ success: false, message: "creatorId and badgeId are required" });
    }

    const creator = await User.findById(creatorId);
    if (!creator) return res.status(404).json({ success: false, message: "Creator not found" });

    const badge = await Badge.findById(badgeId);
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });

    const hasBadge = (creator.badges || []).some((b) => b.toString() === badgeId.toString());
    if (hasBadge) {
      await creator.updateOne({ $pull: { badges: badgeId } });
      return res.status(200).json({ success: true, message: "Badge removed" });
    }

    await creator.updateOne({ $addToSet: { badges: badgeId } });
    res.status(200).json({ success: true, message: "Badge assigned" });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({ error: error.message });
  }
};

const toggleHideFollowersFollowing = async (req, res) => {
  try {
    const userid = req.body.userid || req.userId || req.authUserId;
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const newValue = !user.hideFollowersFollowing;
    await user.updateOne({ hideFollowersFollowing: newValue });

    res.status(200).json({ success: true, hideFollowersFollowing: newValue });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const togglePrivateAccount = async (req, res) => {
  try {
    const userid = req.body.userid || req.userId || req.authUserId;
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const newValue = !user.isPrivate;
    await user.updateOne({ isPrivate: newValue });

    res.status(200).json({ success: true, isPrivate: newValue });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updatePrivacy = async (req, res) => {
  try {
    const userid = req.userId || req.authUserId;
    if (req.body.userid &&
        req.body.userid.toString() !== userid?.toString()) {
      return res.status(403).json({
        success: false,
        message: "Cannot update another user's privacy",
      });
    }
    if (typeof req.body.isPrivate !== "boolean") {
      return res.status(400).json({
        success: false,
        message: "isPrivate must be a boolean",
      });
    }

    const user = await User.findByIdAndUpdate(
      userid,
      { isPrivate: req.body.isPrivate },
      { new: true },
    ).select("_id isPrivate");
    if (!user) throw Error("User Not Found");

    res.status(200).json({ success: true, isPrivate: user.isPrivate });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const toggleAcceptMessages = async (req, res) => {
  try {
    const userid = req.body.userid || req.userId || req.authUserId;
    const user = await User.findById(userid);
    if (!user) throw Error("User Not Found");

    const newValue = !user.acceptMessages;
    await user.updateOne({ acceptMessages: newValue });

    res.status(200).json({ success: true, acceptMessages: newValue });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const updateAccountSettings = async (req, res) => {
  try {
    const userid = req.userId || req.authUserId;
    const update = {};
    const mapping = {
      isPrivate: "isPrivate",
      acceptMessages: "acceptMessages",
      showFollowersFollowing: "hideFollowersFollowing",
    };

    for (const [input, stored] of Object.entries(mapping)) {
      if (!Object.prototype.hasOwnProperty.call(req.body, input)) continue;
      if (typeof req.body[input] !== "boolean") {
        return res.status(400).json({
          success: false,
          message: `${input} must be a boolean`,
        });
      }
      update[stored] =
        input === "showFollowersFollowing" ? !req.body[input] : req.body[input];
    }

    if (!Object.keys(update).length) {
      return res.status(400).json({
        success: false,
        message: "No valid account setting supplied",
      });
    }

    const user = await User.findByIdAndUpdate(userid, update, { new: true })
      .select("_id isPrivate hideFollowersFollowing acceptMessages");
    if (!user) throw Error("User Not Found");

    res.status(200).json({
      success: true,
      isPrivate: !!user.isPrivate,
      showFollowersFollowing: !user.hideFollowersFollowing,
      acceptMessages: user.acceptMessages !== false,
    });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getFollowRequests = async (req, res) => {
  try {
    const userId = req.userId || req.authUserId;
    const user = await User.findById(userId).select("followRequests").lean();
    if (!user) throw Error("User Not Found");

    const requests = await Promise.all(
      (user.followRequests || []).map(async (r) => {
        const u = await User.findById(r.from).select("firstname lastname username profilePicture").lean();
        if (!u) return null;
        return {
          from: u._id,
          firstname: u.firstname || "",
          lastname: u.lastname || "",
          username: u.username,
          profilePicture: await getPicUrl(u._id),
          createdAt: r.createdAt,
        };
      }),
    );

    res.status(200).json({ success: true, requests: requests.filter(Boolean) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const respondFollowRequest = async (req, res) => {
  try {
    const userId = req.userId || req.authUserId;
    const { requesterId, action } = req.body;
    if (!requesterId || !["accept", "reject"].includes(action)) {
      return res.status(400).json({ success: false, message: "requesterId and valid action are required" });
    }

    const currentUser = await User.findById(userId);
    const requester = await User.findById(requesterId);
    if (!currentUser || !requester) throw Error("User Not Found");

    // Remove request in both cases
    await currentUser.updateOne({ $pull: { followRequests: { from: requester._id } } });

    if (action === "reject") {
      (global.onlineSockets?.get(requester._id.toString()) || []).forEach(
        socket => socket?.emit("followRequestRejected", {
          targetUserId: currentUser._id.toString(),
        }),
      );
      return res.status(200).json({ success: true, message: "Request rejected" });
    }

    const alreadyFollowing = (requester.following || []).some((id) => id.toString() === currentUser._id.toString());
    if (!alreadyFollowing) {
      await requester.updateOne({ $addToSet: { following: currentUser._id } });
    }

    const alreadyFollower = (currentUser.followers || []).some((id) => id.toString() === requester._id.toString());
    if (!alreadyFollower) {
      await currentUser.updateOne({ $addToSet: { followers: requester._id } });
    }

    await updateRankingPointsForUser(currentUser._id);
    await sendCustomNotification(requester._id, "Follow request accepted", `${currentUser.username} accepted your request.`);
    const followerCount = await User.countDocuments({
      _id: { $in: currentUser.followers.concat(requester._id) },
    });
    (global.onlineSockets?.get(requester._id.toString()) || []).forEach(
      socket => socket?.emit("followRequestAccepted", {
        targetUserId: currentUser._id.toString(),
        followerCount,
        followingCount: currentUser.following.length,
      }),
    );
    res.status(200).json({ success: true, message: "Request accepted" });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const cancelFollowRequest = async (req, res) => {
  try {
    const requesterId = req.userId || req.authUserId;
    const targetUserId = req.body.targetUserId;
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: "targetUserId is required",
      });
    }

    const target = await User.findById(targetUserId).select("_id followRequests");
    if (!target) throw Error("User Not Found");

    await target.updateOne({
      $pull: { followRequests: { from: requesterId } },
    });

    res.status(200).json({
      success: true,
      requested: false,
      message: "Follow request cancelled",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getFollowStatus = async (req, res) => {
  try {
    const requesterId = req.userId || req.authUserId;
    const target = await User.findById(req.params.targetUserId)
      .select("followers following followRequests")
      .lean();
    if (!target) throw Error("User Not Found");

    const following = (target.followers || []).some(
      id => id.toString() === requesterId.toString(),
    );
    const requested = !following && (target.followRequests || []).some(
      request => request.from?.toString() === requesterId.toString(),
    );
    res.status(200).json({
      success: true,
      following,
      requested,
      followerCount: target.followers?.length || 0,
      followingCount: target.following?.length || 0,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getUserToggles = async (req, res) => {
  try {
    const userid = req.params.userid || req.body.userid;
    if (!userid) return res.status(400).json({ success: false, message: "userid is required" });

    const user = await User.findById(userid).select("hideFollowersFollowing isPrivate acceptMessages").lean();
    if (!user) throw Error("User Not Found");

    res.status(200).json({
      success: true,
      hideFollowersFollowing: !!user.hideFollowersFollowing,
      isPrivate: !!user.isPrivate,
      acceptMessages: user.acceptMessages !== false,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getInfluencerSummaries = async (userIds, { randomize = false, limit = null } = {}) => {
  const normalized = (userIds || []).map((id) => id.toString());
  const unique = [...new Set(normalized)];

  let idsToUse = unique;
  if (randomize) {
    for (let i = idsToUse.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [idsToUse[i], idsToUse[j]] = [idsToUse[j], idsToUse[i]];
    }
  }
  if (limit != null) idsToUse = idsToUse.slice(0, limit);

  const users = await User.find({ _id: { $in: idsToUse.map((id) => new mongoose.Types.ObjectId(id)) } })
    .select("firstname lastname username followers following profilePicture")
    .lean();

  const byId = new Map(users.map((u) => [u._id.toString(), u]));
  const ordered = randomize ? idsToUse : unique;

  const summaries = await Promise.all(
    ordered
      .filter((id) => byId.has(id))
      .map(async (id) => {
        const user = byId.get(id);
        return {
          firstname: user.firstname || "",
          lastname: user.lastname || "",
          username: user.username,
          profilePicture: await getPicUrl(user._id),
          totalFollowers: Array.isArray(user.followers) ? user.followers.length : 0,
          totalFollowings: Array.isArray(user.following) ? user.following.length : 0,
        };
      }),
  );

  return summaries;
};

const setTopInfluencers = async (req, res) => {
  try {
    const influencerIds = req.body.influencerIds || req.body.userids || [];
    if (!Array.isArray(influencerIds)) {
      return res.status(400).json({ success: false, message: "influencerIds must be an array" });
    }

    const normalized = influencerIds.map((id) => id?.toString?.() || String(id));
    const unique = [...new Set(normalized)];

    if (unique.length !== 15) {
      return res.status(400).json({ success: false, message: "Please provide exactly 15 unique influencer ids" });
    }

    const invalid = unique.find((id) => !mongoose.Types.ObjectId.isValid(id));
    if (invalid) {
      return res.status(400).json({ success: false, message: `Invalid user id: ${invalid}` });
    }

    const foundCount = await User.countDocuments({ _id: { $in: unique } });
    if (foundCount !== unique.length) {
      return res.status(400).json({ success: false, message: "One or more influencer ids do not exist" });
    }

    let business = await Business.findOne({});
    if (!business) {
      business = await Business.create({ version: "1" });
    }

    await business.updateOne({ topInfluencers: unique });

    res.status(200).json({ success: true, message: "Top influencers updated", count: unique.length });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({
      error: error.message,
    });
  }
};

const getTopInfluencers = async (req, res) => {
  try {
    const business = await Business.findOne({}).select("topInfluencers").lean();
    const influencerIds = business?.topInfluencers || [];

    const influencers = await getInfluencerSummaries(influencerIds);
    res.status(200).json({ success: true, count: influencers.length, influencers });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({
      error: error.message,
    });
  }
};

const getRandomTopInfluencers = async (req, res) => {
  try {
    const business = await Business.findOne({}).select("topInfluencers").lean();
    const influencerIds = business?.topInfluencers || [];

    const influencers = await getInfluencerSummaries(influencerIds, { randomize: true, limit: 5 });
    res.status(200).json({ success: true, count: influencers.length, influencers });
  } catch (error) {
    console.log("error: ", error);
    res.status(400).json({
      error: error.message,
    });
  }
};
 
module.exports = { 
  getUserById, 
  getAllFollowersAndFollowing, 
  getUserProfile, 
  followUser,
  blockUser,
  searchUsers,
  getAllFollowers,
  getAllFollowing,
  getBlocked,
  setProfilePic,
  getProfilePic,
  deleteProfilePic,
  changePassword,
  editProfile,
  getPicUrl,
  getAllUsers,
  resetPasswordRequest,
  verifyPasswordOtp,
  newPassword,
  setVerified,
  getVideos,
  getUserReels,
  getImages,
  deleteUser,
  deleteUserByUsername,
  generateShareableProfileLink,
  setUserRemoteId,
  getUserByRemoteId,
  updateUserBank,
  updateUserPaypal,
  getUserSubscription,
  updateUserVerifiedAccountSubscription,
  getUserVerifiedStatus,
  getUserLemVerified,
  getRandomUsers,
  getRandomVerified,
  getTagUsers,
  getTagUsersUpdated,
  searchUsersUpdated,
  sendSupportTicket,
  sendReport,
  getSumsubAccessToken,
  sumsubWebhook,
  getAllReports,
  getReportById,
  isUserIdVerified,
  makeUserVerified,
  strikeUser,
  liftStrike,
  getUsersUnderStrike,
  getStrikeStatus,
  reportUser,
  getUserReports,
  getAllUsersReports,
  getIdVerificationStatus,
  createDiditSession,
  diditWebhook,
  unBlockUser,
  searchUsersUpdatedBlocked,
  getRestrictedIds,
  getUserFollowerFollowingCount,
  blockUserInSystem,
  getNewUserOnboarding,
  activateNewUserOnboarding,
  getAllVerifiedUsers, 
  updateVerifiedUsers, 
  getVideosFast, 
  editProfileInitial, 
  searchClubUsersUpdatedBlocked,
  trackAppMinute,
  setTopInfluencers,
  getTopInfluencers,
  getRandomTopInfluencers,
  recalculateRankingPointsAllUsers,
  getTopCreators,
  getAllCreators,
  assignBadgeToCreator,
  toggleHideFollowersFollowing,
  togglePrivateAccount,
  updatePrivacy,
  updateAccountSettings,
  toggleAcceptMessages,
  getFollowRequests,
  respondFollowRequest,
  cancelFollowRequest,
  getFollowStatus,
  getUserToggles
};
