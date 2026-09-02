const Reel = require("../models/reelModel");
const ReelComment = require("../models/reelCommentModel");
const ReelReply = require("../models/reelReplyModel");
const User = require("../models/userModel");
const axios = require("axios");
const FormData = require("form-data");
const { sendNotification } = require("./notificationController");
const { createActivity } = require("./activityController");
const Activity = require("../models/activityModel");
const { markOnboardingTask } = require("../helpers/newUserOnboardingHelper");
const ffmpeg = require('fluent-ffmpeg');
const fs = require('fs/promises');
const os = require('os');
const path = require('path');
const { fileOps } = require("../helpers/otherHelpers");

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
const { NodeHttpHandler } = require("@smithy/node-http-handler");
const https = require("https");

require("dotenv").config();

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

// Optimized HTTPS Agent for high concurrency streaming
const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 1000,
  maxSockets: 500, // Increased from default 50
  maxFreeSockets: 256,
  timeout: 60000,
});

// Optimized HTTP handler for streaming with increased socket capacity
const httpHandler = new NodeHttpHandler({
  httpsAgent: httpsAgent,
  requestTimeout: 60000,
  connectionTimeout: 10000,
  socketAcquisitionTimeout: 60000,
  socketAcquisitionWarningTimeout: 10000, // Suppress warnings longer (10 seconds)
});

// Optimized S3 client for streaming with connection pooling
const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
  requestHandler: httpHandler,
  maxAttempts: 3,
});
const acceptReel = async (req, res) => {
  try {
    const { reelId } = req.body;
    if (!reelId) {
      return res.status(400).json({ error: "Reel ID is required" });
    }

    const reel = await Reel.findById(reelId);
    if (!reel) {
      return res.status(404).json({ error: "Reel not found" });
    }
    // reel.sightengineResults = reel.sightengineResults.filter(
    //   (result) => result !== "nudity"
    // );

    // await reel.save();
    
    await reel.updateOne({
      sightengineResults: null
    })
    res.status(200).json({ message: "Reel updated successfully", reel });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while updating the reel" });
  }
};
const getTotalReels = async (req, res) => {
  try {
    const reels = await Reel.find({}).sort({ createdAt: -1 });

    const detailedReels = await Promise.all(
      reels.map(async (reel) => {
        let videoUrl = "";
        let thumbnailUrl = "";

        if (reel.video !== "") {
          const getObjectParams = {
            Bucket: bucketName,
            Key: reel.video,
          };
          const command = new GetObjectCommand(getObjectParams);
          videoUrl = await getSignedUrl(s3, command, { expiresIn: "604800" });
        }

        if (reel.thumbnail !== "") {
          const getObjectParams = {
            Bucket: bucketName,
            Key: reel.thumbnail,
          };
          const command = new GetObjectCommand(getObjectParams);
          thumbnailUrl = await getSignedUrl(s3, command, {
            expiresIn: "604800",
          });
        }

        const user = await User.findById(reel.userid);

        return {
          ...reel.toObject(),
          username: user.username,
          profilePictureUrl: await getPicUrl(reel.userid),
          videoUrl: videoUrl,
          thumbnailUrl: thumbnailUrl,
          isVerified: user.isVerified,
        };
      })
    );

    res.status(200).json({ reels: detailedReels });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const getReelById = async (req, res) => {
  try {
    var {reelid} = req.params;
    const reel = await Reel.findById(reelid).select("_id");
    var reelNow = await getReel(reel._id);
    const userid = reelNow.userid;
    const user = await User.findById(userid);
    reelNow.isVerified = user.isVerified;
    res.status(200).json({ reel: reelNow });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
const getAllPostedReels = async (req, res) => {
  try {
    const reelids = await Reel.find({}).sort({ createdAt: -1 }).select("_id");

    var reels = await Promise.all(
      reelids.map(async (id) => {
        var reelNow = await getReel(id);
        const userid = reelNow.userid;
        const user = await User.findById(userid);
        console.log(userid);
        // postNow = postNow.toObject();
        reelNow.isVerified = user.isVerified;
        return reelNow;
      })
    );

    function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    reels = shuffleArray(reels);

    res.status(200).json({ reels });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllNudityReels = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(Reel.find({ sightengineResults: { $exists: true, $ne: null,  $not: { $size: 0 } } }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort({ createdAt: -1 })
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    var reels = [];
    result = await Promise.all(
      result.map(async (reel) => {
        reel = reel.toObject();
        reels.push(await getReel(reel._id))
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, reels });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const upgradedGetAllPostedReels = async (req, res) => {
  try {
    var {pageNo,perPage} = req.params;
    var userid = req.params.userid?.trim();
    var user = null
    
    if(userid){
      user = await User.findById(userid);
      if(!user){
        return res.status(400).json({ success: false, message: 'User not found' });
      }
    }

    const reelids = await Reel.find({}).sort({ createdAt: -1 })
    .skip((pageNo - 1) * perPage)
    .limit(perPage)
    .sort({ createdAt: -1 })
    .select("_id");

    var reels = [];
    await Promise.all(
      reelids.map(async (id) => {
        var reelNow = await getReel(id);
        const userReel = await User.findById(reelNow.userid);
        reelNow.isVerified = userReel.isVerified;
        if(user){
          var restrictedIds = [...userReel.blocked.map(i => i.toString()), ...userReel.blockedBy.map(i => i.toString())];
          if(restrictedIds.includes(userid)){
            return;
          }
        }
        // return reelNow;
        reels.push(reelNow)
      })
    );

    function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    reels = shuffleArray(reels);

    res.status(200).json({ reels });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getReel = async (reelid) => {
  try {
    let reel = await Reel.findById(reelid);
    let videoUrl = "";
    let thumbnailUrl = "";

    if (!reel) {
      throw Error("Blink Not Found");
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
const videoModels = [
  "nudity-2.0",
  "wad",
  "gore",
  // "tobacco",
  "gambling",
  "offensive",
  "text-content",
  "qr-content",
];
// const postReel = async (req, res) => {
//   const { userid, description, commentsAllowed, location } = req.body;
//   try {
//     if(!commentsAllowed){
//       commentsAllowed = true;
//     }
//     const user = await User.findById(userid);
//     if (!user) {
//       await sendNotification(userid, "Error creating post", "User not found");
//       throw Error("User Not Found");
//     }

//     const sightengineResponse = await checkVideoWithSightengine(
//       req.files["video"][0].buffer,
//       videoModels
//     );

//     let isExplicitContent = false;
//     let sightengineResults = [];
//     var explicityRatio = 0.5
//     var nudityRatio = 0.85

//     for (const model of videoModels) {
//       if (model === "qr-content") {
//         const qr = sightengineResponse.data.frames[0].qr;
//         if (
//           qr.personal.length > 0 ||
//           qr.link.length > 0 ||
//           qr.social.length > 0 ||
//           qr.spam.length > 0 ||
//           qr.profanity.length > 0 ||
//           qr.blacklist.length > 0
//         ) {
//           sightengineResults.push("qr-content");
//         }
//       } else if (model === "text-content") {
//         const text = sightengineResponse.data.frames[0].text;
//         if (
//           text.profanity.length > 0 ||
//           text.personal.length > 0 ||
//           text.link.length > 0 ||
//           text.social.length > 0 ||
//           text.extremism.length > 0 ||
//           text.medical.length > 0 ||
//           text.drug.length > 0 ||
//           text.weapon.length > 0
//         ) {
//           sightengineResults.push("text-content");
//         }
//       } else if (model === "nudity-2.0") {
//         const nuditySubModels = [
//           "sexual_activity",
//           "sexual_display",
//           "erotica",
//           "sextoy",
//         ];
//         let hasNudity = false;
//         for (const subModel of nuditySubModels) {
//           if (sightengineResponse.data.frames[0].nudity[subModel] > nudityRatio) {
//             hasNudity = true;
//             break;
//           }
//         }
//         if (hasNudity) {
//           sightengineResults.push("nudity");
//           isExplicitContent = true;
//         }
//       } else if (model === "wad") {
//         const wadValues = [
//           sightengineResponse.data.frames[0].weapon || 0,
//           sightengineResponse.data.frames[0].weapon_firearm || 0,
//           sightengineResponse.data.frames[0].weapon_knife || 0,
//           sightengineResponse.data.frames[0].alcohol || 0,
//           sightengineResponse.data.frames[0].drugs || 0,
//           sightengineResponse.data.frames[0].medical_drugs || 0,
//           sightengineResponse.data.frames[0].recreational_drugs || 0,
//         ];
//         if (Math.max(...wadValues) > explicityRatio) {
//           sightengineResults.push("wad");
//           isExplicitContent = true;
//         }
//       } else if (
//         model === "gore" &&
//         sightengineResponse.data.frames[0].gore.prob > explicityRatio
//       ) {
//         sightengineResults.push("gore");
//         isExplicitContent = true;
//       } else if (
//         model === "gambling" &&
//         sightengineResponse.data.frames[0].gambling.prob > explicityRatio
//       ) {
//         sightengineResults.push("gambling");
//         isExplicitContent = true;
//       } else if (model === "offensive") {
//         const frame = sightengineResponse.data.frames[0];
//         const offensive = Math.max(
//           frame.offensive.prob || 0,
//           frame.offensive.nazi || 0,
//           frame.offensive.confederate || 0,
//           frame.offensive.supremacist || 0,
//           frame.offensive.terrorist || 0,
//           frame.offensive.middle_finger || 0
//         );
//         if (offensive > explicityRatio) {
//           sightengineResults.push("offensive");
//           isExplicitContent = true;
//         }
//       }
//     }

//     if (isExplicitContent) {
//       // var reelEplicit = await Reel.create({
//       //   userid,
//       //   description,
//       //   video: "explicit content detected",
//       //   thumbnail: "explicit content detected",
//       // });
//       // await user.updateOne({
//       //   $push: {
//       //     reels: reelEplicit._id
//       //   }
//       // })
//       await sendNotification(
//         userid,
//         "Reel removed by Frenzone",
//         "Reel contain content against frenzone policy"
//       );

//       res.status(200).json({
//         status: "Reel contain content against frenzone policy",
//         sightengineResponse: sightengineResponse,
//         sightengineResults: [], // Empty array for explicit content
//       });
//       return;
//     }

//     const videoName = randomName();
//     const videoParams = {
//       Bucket: bucketName,
//       Key: videoName,
//       Body: req.files["video"][0].buffer,
//       ContentType: req.files["video"][0].mimetype,
//     };

//     const thumbnailName = randomName();
//     const thumbnailParams = {
//       Bucket: bucketName,
//       Key: thumbnailName,
//       Body: req.files["thumbnail"][0].buffer,
//       ContentType: req.files["thumbnail"][0].mimetype,
//     };

//     const videoCommand = new PutObjectCommand(videoParams);
//     await s3.send(videoCommand);

//     const thumbnailCommand = new PutObjectCommand(thumbnailParams);
//     await s3.send(thumbnailCommand);

//     const reel = await Reel.create({
//       userid,
//       description,
//       video: videoName,
//       thumbnail: thumbnailName,
//       sightengineResults,
//       commentsAllowed,
//       location
//     });

//     await user.updateOne({
//       $push: {
//         reels: reel._id,
//       },
//     });

//     // await sendNotification(
//     //   userid,
//     //   "Reel",
//     //   "Reel Created",
//     //   "reel",
//     //   reel._id
//     // );

//     let tags = [];
//     let taggedUsers = [];
//     if (description && description.trim() != "") {
//       // Given string
//       let inputString = description;

//       // Define the regular expression pattern
//       let pattern = /[@#]\w+/g;

//       // Find all occurrences of the pattern
//       let matches = inputString.match(pattern);

//       if (matches) {
//         // Remove the "@" from each matched username
//         tags = matches.map((tag) => tag.substring(1));

//         // Print the extracted tags
//         await Promise.all(
//           tags.map(async tag => {
//             var taggedUser = await User.findOne({tag})
//             if(taggedUser){
//               taggedUsers.push(taggedUser._id);
//             }
//           })
//         )
//       }
//     }

//     await reel.updateOne({
//       taggedUsers
//     })

//     await Promise.all(
//       user.followers.map(async (followerid) => {
//         if (followerid != userid) {
//           var follower = await User.findById(followerid);
//           if(follower){
//           var notificationTitle = "New Blink";
//           var notificationBody = `has posted a New Blink`;
//           if (tags.includes(follower.tag)) {
//             notificationTitle = "Tagged in blink";
//             notificationBody = `has tagged you in a Blink`;
//           }

//           await sendNotification(
//             followerid,
//             notificationTitle,
//             `${user.firstname + " " + user.lastname} ${notificationBody}`,
//             "reel",
//             reel._id,
//             null,
//             null,
//             userid
//           );
//           await createActivity(
//             followerid,
//             user._id,
//             notificationBody,
//             undefined,
//             null,
//             null,
//             null,
//             null,
//             null,
//             reel._id
//           );

//           tags.pop(follower.tag)
//         }
//         }
//       })
//     );

//     await Promise.all(
//       tags.map(async tag=>{
//         var follower = await User.findOne({tag});
//         if(follower){
//           var notificationTitle = "Tagged in blink";
//           var notificationBody = `has tagged you in a Blink`;
  
//           await sendNotification(
//             follower._id,
//             notificationTitle,
//             `${user.firstname + " " + user.lastname} ${notificationBody}`,
//             "reel",
//             reel._id,
//             null,
//             null,
//             userid
//           );
//           await createActivity(
//             follower._id,
//             user._id,
//             notificationBody,
//             undefined,
//             null,
//             null,
//             null,
//             null,
//             null,
//             reel._id
//           );
//         }
//       })
//     )

//     res.status(200).json({
//       status: "Blink Posted",
//       sightengineResponse: sightengineResponse,
//       sightengineResults,
//     });
//   } catch (error) {
//     console.error("Error:", error.message);
//     await sendNotification(userid, "Error creating post", error.message);
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };
const editReel = async (req, res) => {
  const {reelid, description, commentsAllowed, location } = req.body;

  var reel = await Reel.findById(reelid);
  if(!reel){
    res.status(400).json("unable to file reel");
    return;
  };

  await reel.updateOne({
    description: description || reel.description,
    commentsAllowed: commentsAllowed || reel.commentsAllowed,
    location: location || reel.location
  })

  res.status(200).json({
    message: "reel edited"
  })
}
async function checkVideoWithSightengine(videoBuffer, models) {
  try {
    const data = new FormData();
    data.append("media", videoBuffer, { filename: "video.mp4" });
    data.append("models", models.join(","));
    data.append("api_user", process.env.SIGHTENGINE_API_USER);
    data.append("api_secret", process.env.SIGHTENGINE_API_SECRET);

    const response = await axios({
      method: "post",
      url: "https://api.sightengine.com/1.0/video/check-sync.json",
      data: data,
      headers: data.getHeaders(),
    });

    return {success: true, body: response.data}
  } catch (error) {
    // console.error("Sightengine API error:", error.message);
    return {success: false, body: error}
  }
}
const deleteReel = async (req, res) => {
  try {
    const reelid = req.body.reelid;
    const reel = await Reel.findById(reelid);
    if (!reel) {
      throw Error("Blink Not Found");
    }
    const userid = reel.userid;

    if (reel.video != "") {
      let params = {
        Bucket: bucketName,
        Key: reel.video,
      };
      let command = new DeleteObjectCommand(params);
      await s3.send(command);
    }

    if (reel.thumbnail != "") {
      params = {
        Bucket: bucketName,
        Key: reel.thumbnail,
      };
      command = new DeleteObjectCommand(params);
      await s3.send(command);
    }

    await User.findByIdAndUpdate(userid, {
      $pull: { reels: reelid },
    });
    await Reel.findByIdAndDelete(reelid);

    await Activity.deleteMany({ reelid });

    res.status(200).json({
      status: "Blink Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
// const likeReel = async (req, res) => {
//   try {
//     const reel = await Reel.findById(req.body.reelid);
//     var userid = req.body.userid;
//     var user = await User.findById(userid);

//     if (reel.likes.includes(req.body.userid)) {
//       await reel.updateOne({ $pull: { likes: req.body.userid } });
//       res.status(200).json({
//         message: "Blink Unliked",
//       });
//     } else if (!reel.likes.includes(req.body.userid)) {
//       await reel.updateOne({ $push: { likes: req.body.userid } });
//       if (userid != reel.userid) {
//         await sendNotification(
//           reel.userid,
//           "Blink Liked",
//           `${user.firstname + " " + user.lastname} liked your Blink`,
//           "reel",
//           reel._id
//         );

//         await Activity.deleteMany({
//           otheruserid: userid,
//           reelid: reel._id,
//         });
//         await createActivity(
//           reel.userid,
//           userid,
//           "liked your blink",
//           undefined,
//           null,
//           null,
//           null,
//           null,
//           null,
//           reel._id
//         );
//       }
//       res.status(200).json({
//         message: "Blink Liked",
//       });
//     }
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };
const getUserReels = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User not Found");
    }

    const reels = await Promise.all(
      user.reels.map((id) => {
        return getReel(id);
      })
    );

    res.status(200).json({ reels });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
// const makeComment = async (req, res) => {
//   try {
//     const { userid, reelid, description } = req.body;

//     const reel = await Reel.findById(reelid);
//     if (!reel) {
//       throw Error("Blink Not Found");
//     }

//     const reelComment = await ReelComment.create({
//       userid,
//       reelid,
//       description,
//     });

//     await reel.updateOne({ $push: { comments: reelComment._id } });
//     var user = await User.findById(userid);
//     if (userid != reel.userid) {
//       await sendNotification(
//         reel.userid,
//         "Blink Comment",
//         `${user.firstname + " " + user.lastname} commented on your Blink`,
//         "reel",
//         reel._id,
//         null,
//         null, 
//         userid
//       );

//       await Activity.deleteMany({
//         otheruserid: userid,
//         reelid: reel._id,
//       });
//       await createActivity(
//         reel.userid,
//         userid,
//         "made a new comment",
//         undefined,
//         null,
//         null,
//         null,
//         null,
//         null,
//         reel._id
//       );
//     }

//     let tags = [];
//     if (description && description.trim() != "") {
//       // Given string
//       let inputString = description;

//       // Define the regular expression pattern
//       let pattern = /[@#]\w+/g;

//       // Find all occurrences of the pattern
//       let matches = inputString.match(pattern);

//       if (matches) {
//         // Remove the "@" from each matched username
//         tags = matches.map((tag) => tag.substring(1));

//         // Print the extracted tags
//         // await Promise.all(
//         //   tags.map(async tag => {
//         //     var taggedUser = await User.findOne({tag})
//         //     await sendNotification(
//         //       taggedUser._id,
//         //       "Tagged in blink",
//         //       `${user.firstname + " " + user.lastname} has tagged you in a blink`,
//         //       "reel",
//         //       reel._id,
//         //       null,
//         //       null,
//         //       userid
//         //     );

//         //   })
//         // )
//       }
//     }

//     console.log("tags: ", tags)
//     await Promise.all(
//       tags.map(async tag=>{
//         var follower = await User.findOne({tag});
//         if(follower){
//           var notificationTitle = "Tagged you in a comment";
//           var notificationBody = `has tagged you in a comment`;
//           console.log("sent ", follower._id.toString())
//           await sendNotification(
//             follower._id.toString(),
//             notificationTitle,
//             `${user.firstname + " " + user.lastname} ${notificationBody}`,
//             "reel",
//             reel._id,
//             null,
//             null
//           );
//           await createActivity(
//             follower._id,
//             user._id,
//             notificationBody,
//             undefined,
//             null,
//             null,
//             null,
//             null,
//             null,
//             reel._id
//           );
//         }
//       })
//     )

//     res.status(200).json({
//       message: "Comment Posted",
//       commentId: reelComment._id
//     });
//   } catch (error) {
//     res.status(400).json({ error: error.message });
//   }
// };
const getComments = async (req, res) => {
  try {
    const reelid = req.params.reelid;

    const reel = await Reel.findById(reelid);

    if (!reel) {
      throw Error("Blink Not Found");
    }

    let reelComments = await ReelComment.find({ reelid }).sort({
      createdAt: "desc",
    });

    let comments = await Promise.all(
      reelComments.map(async (reelComment) => {
        const userid = reelComment.userid;
        const user = await User.findById(userid);
        reelComment = reelComment.toObject();
        reelComment.username = user.username;
        reelComment.profilePictureUrl = await getPicUrl(userid);
        reelComment.isVerified = user.isVerified;
        return reelComment;
      })
    );

    res.status(200).json({
      comments,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const likeComment = async (req, res) => {
  try {
    const reelComment = await ReelComment.findById(req.body.commentid);
    if(!reelComment){
      res.status(400).json({
        success: false,
        message: "Invalid reel comment"
      })
    }
    
    var user = await User.findById(req.body.userid);
    if(!user){
      res.status(400).json({
        success: false,
        message: "Invalid user"
      })
    }

    if (reelComment.likes.includes(req.body.userid)) {
      await reelComment.updateOne({ $pull: { likes: req.body.userid } });
      res.status(200).json({
        message: "Comment Unliked",
      });
    } else if (!reelComment.likes.includes(req.body.userid)) {
      await reelComment.updateOne({ $push: { likes: req.body.userid } });
      res.status(200).json({
        message: "Comment Liked",
      });
    }

    if(req.body.userid != reelComment.userid.toString()){
      await sendNotification(
        reelComment.userid,
        "Comment Liked",
        `${user.firstname + " " + user.lastname} liked your blink comment`,
        "reel",
        reelComment.reelid,
        "commentLiked",
        reelComment._id,
        null,
        null,
        null,
        'true'
      );
  
      await createActivity(
        reelComment.userid,
        user._id,
        `${user.firstname + " " + user.lastname} liked your blink comment`,
        undefined,   // streamid
        undefined,    // postid
        undefined,   // channel
        undefined,   // token
        null,        // voicemeetid
        false,       // walletNotify
        reelComment.reelid,   // reelid
        "comment-liked",          // activityType
        { reelid: reelComment.reelid, commentid: reelComment._id }, // data
        true         // isComment
      );
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const deleteComment = async (req, res) => {
  try {
    const commentid = req.body.commentid;
    const reelComment = await ReelComment.findById(commentid);
    if (!reelComment) {
      throw Error("Comment Not Found");
    }

    const reelid = reelComment.reelid;

    const reel = await Reel.findById(reelid);
    if (!reel) {
      throw Erro("Blink Not Found");
    }

    await reel.updateOne({
      $pull: { comments: reelComment._id },
    });

    await reelComment.deleteOne();

    res.status(200).json({
      status: "Comment Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const makeReply = async (req, res) => {
  try {
    const { userid, commentid, description } = req.body;

        
    const reelComment = await ReelComment.findById(req.body.commentid);
    if(!reelComment){
      res.status(400).json({
        success: false,
        message: "Invalid reelComment"
      })
    }

    const user = await User.findById(req.body.userid);
    if(!user){
      res.status(400).json({
        success: false,
        message: "Invalid user"
      })
    }
    

    const reply = await ReelReply.create({
      userid,
      commentid,
      description,
    });

    await ReelComment.findByIdAndUpdate(commentid, {
      $push: { replies: reply._id },
    });
    
        let taggedUsers = [];
        if (description && description.trim() != "") {
          // Given string
          let inputString = description;
    
          // Define the regular expression pattern
          let pattern = /[@#]\w+/g;
    
          // Find all occurrences of the pattern
          let matches = inputString.match(pattern);
    
          if (matches) {
            // Remove the "@" from each matched username
            let tags = matches.map((tag) => tag.substring(1));
    
            // Print the extracted tags
            await Promise.all(
              tags.map(async (tag) => {
                var taggedUser = await User.findOne({ tag });
                if(taggedUser){
                  taggedUsers.push(taggedUser._id);
                }
                await sendNotification(
                  taggedUser._id,
                  "Tagged in comment",
                  `${
                    user.firstname + " " + user.lastname
                  } has tagged you in a blink comment`,
                  "reel",
                  reelComment.reelid,
                  "tagCommentReply",
                  reelComment._id,
                  userid,
                  null,
                  null,
                  'true'
                );
    
                await createActivity(
                  taggedUser._id,
                  user._id,
                  `${
                    user.firstname + " " + user.lastname
                  } has tagged you in a blink comment`,
                  undefined,   // streamid
                  undefined,    // postid
                  undefined,   // channel
                  undefined,   // token
                  null,        // voicemeetid
                  false,       // walletNotify
                  reelComment.reelid,   // reelid
                  "tag-comment-reply",          // activityType
                  { reelid: reelComment.reelid, commentid: reelComment._id }, // data
                  'true'         // isComment
                );
              })
            );
          }
        }
    
        await reply.updateOne({
          taggedUsers
        })

    
    if(req.body.userid != reelComment.userid.toString()){
      await sendNotification(
        reelComment.userid,
        "Comment Replied",
        `${user.firstname + " " + user.lastname} replied your blink comment`,
        "reel",
        reelComment.reelid,
        "commentReplied",
        reelComment._id,
        null,
        null,
        null,
        'true'
      );
  
      await createActivity(
        reelComment.userid,
        user._id,
        `${user.firstname + " " + user.lastname} replied your blink comment`,
        undefined,   // streamid
        undefined,    // postid
        undefined,   // channel
        undefined,   // token
        null,        // voicemeetid
        false,       // walletNotify
        reelComment.reelid,   // reelid
        "comment-replied",          // activityType
        { reelid: reelComment.reelid, commentid: reelComment._id }, // data
        true         // isComment
      );
    }

    res.status(200).json({
      message: "Reply Posted",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const getReplies = async (req, res) => {
  try {
    const commentid = req.params.commentid;

    const comment = await ReelComment.findById(commentid);

    const replies = await Promise.all(
      comment.replies.map(async (id) => {
        let reply = await ReelReply.findById(id);
        const userid = reply.userid;
        const user = await User.findById(userid);
        reply = reply.toObject();
        reply.username = user.username;
        reply.profilePictureUrl = await getPicUrl(userid);
        return reply;
      })
    );

    res.status(200).json({
      replies,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const likeReply = async (req, res) => {
  try {
    const reply = await ReelReply.findById(req.body.replyid);

    if (reply.likes.includes(req.body.userid)) {
      await reply.updateOne({ $pull: { likes: req.body.userid } });
      res.status(200).json({
        message: "Reply Unliked",
      });
    } else if (!reply.likes.includes(req.body.userid)) {
      await reply.updateOne({ $push: { likes: req.body.userid } });
      res.status(200).json({
        message: "Reply Liked",
      });
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const deleteReply = async (req, res) => {
  try {
    const replyid = req.body.replyid;
    const reply = await ReelReply.findById(replyid);
    if (!reply) {
      throw Error("Reply Not Found");
    }

    const commentid = reply.commentid;

    await ReelComment.findByIdAndUpdate(commentid, {
      $pull: { replies: reply._id },
    });
    await ReelReply.findByIdAndDelete(replyid);

    res.status(200).json({
      status: "Reply Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
// const viewReel = async (req, res) => {
//   try {
//     const { userid, reelid } = req.body;
//     const reel = await Reel.findById(reelid);
//     const user = await User.findById(userid);
//     if (!reel) {
//       throw Error("Blink Not Found");
//     }
//     if (!user) {
//       throw Error("User Not Found");
//     }

//     if (!reel.viewedBy.includes(userid)) {
//       await Reel.findByIdAndUpdate(reelid, {
//         $push: { viewedBy: userid },
//       });
//     }

//     res.status(200).json({
//       status: "Viewed",
//     });
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };
const { getPicUrl } = require("./userController");
const { ApiFeatures } = require("../helpers/ApiFeatures");
const { sendMessageCustomShare } = require("../helpers/otherHelpers");


const postReel = async (req, res) => {
  const { userid, description, commentsAllowed, location } = req.body;
  try {
    if (!commentsAllowed) {
      commentsAllowed = true;
    }
    const user = await User.findById(userid);
    if (!user) {
      await sendNotification(userid, "Error creating post", "User not found");
      throw Error("User Not Found");
    }

    console.log("video: ", req.files["video"][0])
    
    console.log("video buffer: ", req.files["video"][0].buffer)

    const videoFile = req.files["video"]?.[0];

    if (!videoFile) {
      return res.status(400).json({
        success: false,
        message: "Video file is required"
      });
    }

    const videoPath = videoFile; // multer diskStorage path

    const duration = await fileOps.getVideoDuration(videoPath);

    console.log("Video duration:", duration);

    if (duration > 59) {
      return res.status(400).json({
        success: false,
        message: "Long video not allowed. Maximum duration is 1 minute."
      });
    }

    var sightengineResponse = await checkVideoWithSightengine(
      req.files["video"][0].buffer,
      videoModels
    );
    if(!sightengineResponse.success){
      console.log("sight engine error:", sightengineResponse.body)
      await sendNotification(userid, "Error creating post", sightengineResponse.body.message);
      res.status(400).json({
        error: sightengineResponse.body.message,
      });
      return;
    }else{
      sightengineResponse = sightengineResponse.body
    }
    let isExplicitContent = false;
    let sightengineResults = [];
    var explicityRatio = 0.5;
    var nudityRatio = 0.85;

    for (const model of videoModels) {
      if (model === "qr-content") {
        const qr = sightengineResponse.data.frames[0].qr;
        if (
          qr.personal.length > 0 ||
          qr.link.length > 0 ||
          qr.social.length > 0 ||
          qr.spam.length > 0 ||
          qr.profanity.length > 0 ||
          qr.blacklist.length > 0
        ) {
          sightengineResults.push("qr-content");
        }
      } else if (model === "text-content") {
        const text = sightengineResponse.data.frames[0].text;
        if (
          text.profanity.length > 0 ||
          text.personal.length > 0 ||
          text.link.length > 0 ||
          text.social.length > 0 ||
          text.extremism.length > 0 ||
          text.medical.length > 0 ||
          text.drug.length > 0 ||
          text.weapon.length > 0
        ) {
          sightengineResults.push("text-content");
        }
      } else if (model === "nudity-2.0") {
        const nuditySubModels = [
          "sexual_activity",
          "sexual_display",
          "erotica",
          "sextoy",
        ];
        let hasNudity = false;
        for (const subModel of nuditySubModels) {
          if (sightengineResponse.data.frames[0].nudity[subModel] > nudityRatio) {
            hasNudity = true;
            break;
          }
        }
        if (hasNudity) {
          sightengineResults.push("nudity");
          isExplicitContent = true;
        }
      } else if (model === "wad") {
        const wadValues = [
          sightengineResponse.data.frames[0].weapon || 0,
          sightengineResponse.data.frames[0].weapon_firearm || 0,
          sightengineResponse.data.frames[0].weapon_knife || 0,
          sightengineResponse.data.frames[0].alcohol || 0,
          sightengineResponse.data.frames[0].drugs || 0,
          sightengineResponse.data.frames[0].medical_drugs || 0,
          sightengineResponse.data.frames[0].recreational_drugs || 0,
        ];
        if (Math.max(...wadValues) > explicityRatio) {
          sightengineResults.push("wad");
          isExplicitContent = true;
        }
      } else if (
        model === "gore" &&
        sightengineResponse.data.frames[0].gore.prob > explicityRatio
      ) {
        sightengineResults.push("gore");
        isExplicitContent = true;
      } else if (
        model === "gambling" &&
        sightengineResponse.data.frames[0].gambling.prob > explicityRatio
      ) {
        sightengineResults.push("gambling");
        isExplicitContent = true;
      } else if (model === "offensive") {
        const frame = sightengineResponse.data.frames[0];
        const offensive = Math.max(
          frame.offensive.prob || 0,
          frame.offensive.nazi || 0,
          frame.offensive.confederate || 0,
          frame.offensive.supremacist || 0,
          frame.offensive.terrorist || 0,
          frame.offensive.middle_finger || 0
        );
        if (offensive > explicityRatio) {
          sightengineResults.push("offensive");
          isExplicitContent = true;
        }
      }
    }

    if (isExplicitContent) {
      await sendNotification(
        userid,
        "Reel removed by Frenzone",
        "Reel contain content against frenzone policy"
      );

      res.status(200).json({
        status: "Reel contain content against frenzone policy",
        sightengineResponse: sightengineResponse,
        sightengineResults: [],
      });
      return;
    }

    const videoName = randomName();
    const videoParams = {
      Bucket: bucketName,
      Key: videoName,
      Body: req.files["video"][0].buffer,
      ContentType: req.files["video"][0].mimetype,
    };

    const thumbnailName = randomName();
    const thumbnailParams = {
      Bucket: bucketName,
      Key: thumbnailName,
      Body: req.files["thumbnail"][0].buffer,
      ContentType: req.files["thumbnail"][0].mimetype,
    };

    const videoCommand = new PutObjectCommand(videoParams);
    await s3.send(videoCommand);

    const thumbnailCommand = new PutObjectCommand(thumbnailParams);
    await s3.send(thumbnailCommand);

    let tags = [];
    let taggedUsers = [];
    if (description && description.trim() !== "") {
      let pattern = /[@#]\w+/g;
      let matches = description.match(pattern);
      if (matches) {
        tags = matches.map((tag) => tag.substring(1));

        tags.map(tag => {
          taggedUsers.push("")
        })
        await Promise.all(
          tags.map(async (tag, i) => {
            var taggedUser = await User.findOne({ tag });
            if (taggedUser) {
              // taggedUsers.push(taggedUser._id);

              taggedUsers[i] = taggedUser._id;
            }
          })
        );

        
        taggedUsers = taggedUsers.filter(tag => tag !== "");
      }
    }

    const reel = await Reel.create({
      userid,
      description,
      video: videoName,
      thumbnail: thumbnailName,
      sightengineResults,
      commentsAllowed,
      location,
      tags,
      interactionScore: 0,
    });

    await user.updateOne({
      $push: { reels: reel._id },
    });

    await reel.updateOne({ taggedUsers });

    await Promise.all(
      user.followers.map(async (followerid) => {
        if (followerid != userid) {
          var follower = await User.findById(followerid);
          if (follower) {
            var notificationTitle = "New Blink";
            var notificationBody = `has posted a New Blink`;
            if (tags.includes(follower.tag)) {
              notificationTitle = "Tagged in blink";
              notificationBody = `has tagged you in a Blink`;
              tags = tags.filter(tag => tag !== follower.tag);
            }

            await sendNotification(
              followerid,
              notificationTitle,
              `${user.firstname + " " + user.lastname} ${notificationBody}`,
              "reel",
              reel._id,
              null,
              null,
              userid
            );
            await createActivity(
              followerid,
              user._id,
              notificationBody,
              undefined,
              null,
              null,
              null,
              null,
              null,
              reel._id
            );
          }
        }
      })
    );

    await Promise.all(
      tags.map(async (tag) => {
        var tagUser = await User.findOne({ tag });
        if (tagUser) {
          var notificationTitle = "Tagged in blink";
          var notificationBody = `has tagged you in a Blink`;

          await sendNotification(
            tagUser._id,
            notificationTitle,
            `${user.firstname + " " + user.lastname} ${notificationBody}`,
            "reel",
            reel._id,
            null,
            null,
            userid
          );
          await createActivity(
            tagUser._id,
            user._id,
            notificationBody,
            undefined,
            null,
            null,
            null,
            null,
            null,
            reel._id
          );
        }
      })
    );

    res.status(200).json({
      status: "Blink Posted",
      sightengineResponse: sightengineResponse,
      sightengineResults,
    });
  } catch (error) {
    console.error("Error:", error);
    await sendNotification(userid, "Error creating post", error.message);
    res.status(400).json({
      error: error.message,
    });
  }
};


// Update interactionScore on like
const likeReel = async (req, res) => {
  try {
    const reel = await Reel.findById(req.body.reelid);
    if(!reel){
      res.status(400).json({
        success: false,
        error: "Reel not found",
      });
    }
    var userid = req.body.userid;
    var user = await User.findById(userid);

    var action = "liked"
    var likes = reel.likes.map(like => { return like.toString() })
    if (likes.includes(userid)) {
      await reel.updateOne({ $pull: { likes: req.body.userid } });
      await reel.updateOne({ $inc: { interactionScore: -2 } }); // Decrease score
      await User.findByIdAndUpdate(userid, {
        $pull: { interactedReels: { reelId: req.body.reelid, interactionType: "like" } },
      });
      res.status(200).json({
        message: "Blink Unliked",
      });
    } else {
      await reel.updateOne({ $push: { likes: req.body.userid } });
      await reel.updateOne({ $inc: { interactionScore: 2 } }); // Increase score
      await User.findByIdAndUpdate(userid, {
        $push: { interactedReels: { reelId: req.body.reelid, interactionType: "like", timestamp: Date.now() } },
      });
      await markOnboardingTask(userid, "like");
      if (userid != reel.userid) {
        await sendNotification(
          reel.userid,
          "Blink Liked",
          `${user.firstname + " " + user.lastname} liked your Blink`,
          "reel",
          reel._id
        );

        await Activity.deleteMany({
          otheruserid: userid,
          reelid: reel._id,
        });
        await createActivity(
          reel.userid,
          userid,
          "liked your blink",
          undefined,
          null,
          null,
          null,
          null,
          null,
          reel._id
        );
        res.status(200).json({
          message: "Blink Liked",
        });
      }
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Update interactionScore on comment
const makeComment = async (req, res) => {
  try {
    const { userid, reelid, description } = req.body;

    const reel = await Reel.findById(reelid);
    if (!reel) {
      throw Error("Blink Not Found");
    }

    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }

    let tags = [];
    let taggedUsers = [];
    if (description && description.trim() !== "") {
      let pattern = /[@#]\w+/g;
      let matches = description.match(pattern);
      if (matches) {
        tags = matches.map((tag) => tag.substring(1));
        
        tags.map(tag => {
          taggedUsers.push("")
        })
      }
    }
    
    const reelComment = await ReelComment.create({
      userid,
      reelid,
      description,
    });

    console.log("tags: ", tags)
    await Promise.all(
      tags.map(async (tag, i) => {
        var follower = await User.findOne({ tag });
        
        if(follower){
          // taggedUsers.push(follower._id);
          
              taggedUsers[i] = taggedUser._id;
        }
        if (follower) {
          console.log("follower id: ", follower._id)
          var notificationTitle = "Tagged you in a comment";
          var notificationBody = `has tagged you in a comment`;
          await sendNotification(
            follower._id.toString(),
            notificationTitle,
            `${user.firstname + " " + user.lastname} ${notificationBody}`,
            "reel",
            reel._id,
            "tagComment",
            reelComment._id,
            null,
            null,
            null,
            'true'
          );
          await createActivity(
            follower._id,
            user._id,
            notificationBody,
            undefined,   // streamid
            undefined,    // postid
            undefined,   // channel
            undefined,   // token
            null,        // voicemeetid
            false,       // walletNotify
            reel._id,   // reelid
            "tag-comment",          // activityType
            { reelid: reel._id, commentid: reelComment._id }, // data
            true         // isComment
          );
        }
      })
    );

    
        taggedUsers = taggedUsers.filter(tag => tag !== "");

    
    await reelComment.updateOne({
      taggedUsers
    })

    await reel.updateOne({ $push: { comments: reelComment._id } });
    await reel.updateOne({ $inc: { interactionScore: 3 } }); // Increase score for comment
    await User.findByIdAndUpdate(userid, {
      $push: { interactedReels: { reelId: reelid, interactionType: "comment", timestamp: Date.now() } },
    });
    if (userid != reel.userid) {
      await sendNotification(
        reel.userid,
        "Blink Comment",
        `${user.firstname + " " + user.lastname} commented on your Blink`,
        "reel",
        reel._id,
        "blinkComment",
        reelComment._id,
        userid,
        null,
        null,
        'true'
      );

      await Activity.deleteMany({
        otheruserid: userid,
        reelid: reel._id,
      });
      await createActivity(
        reel.userid,
        userid,
        `${user.firstname + " " + user.lastname} commented on your Blink`,
        undefined,   // streamid
        undefined,    // postid
        undefined,   // channel
        undefined,   // token
        null,        // voicemeetid
        false,       // walletNotify
        reel._id,   // reelid
        "comment-reel",          // activityType
        { reelid: reel._id, commentid: reelComment._id }, // data
        true         // isComment
      );
    }

    res.status(200).json({
      message: "Comment Posted",
      commentId: reelComment._id,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// Update interactionScore on view
const viewReel = async (req, res) => {
  try {
    const { userid, reelid } = req.body;
    const reel = await Reel.findById(reelid);
    const user = await User.findById(userid);
    if (!reel) {
      throw Error("Blink Not Found");
    }
    if (!user) {
      throw Error("User Not Found");
    }

    if (!reel.viewedBy.includes(userid)) {
      await Reel.findByIdAndUpdate(reelid, {
        $push: { viewedBy: userid },
        $inc: { interactionScore: 1 }, // Increase score for view
      });
      await User.findByIdAndUpdate(userid, {
        $push: { interactedReels: { reelId: reelid, interactionType: "view", timestamp: Date.now() } },
      });
    }

    res.status(200).json({
      status: "Viewed",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// New API for For You and Trending Reels
const getRecommendedReels = async (req, res) => {
  try {
    const { type, pageNo = 1, perPage = 10 } = req.query;
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User not found");
    }

    let reelids = [];
    if (type === "foryou") {
      // For You: Prioritize reels based on user interactions
      const interactedReels = user.interactedReels.map((interaction) => interaction.reelId);
      const followedUsers = user.following;
      const userTags = user.tag ? [user.tag] : [];

      // Find reels from followed users, liked/commented reels' creators, and matching tags
      const followedReels = await Reel.find({
        userid: { $in: followedUsers },
        // _id: { $nin: user.interactedReels.map((i) => i.reelId) }, // Exclude viewed reels
        // createdAt: { $gte: new Date(Date.now() - 60 * 24 * 60 * 60 * 1000) }, // Last 30 days
      }).select("_id");

      const tagMatchedReels = await Reel.find({
        tags: { $in: userTags },
        _id: { $nin: user.interactedReels.map((i) => i.reelId) },
        createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
      }).select("_id");

      // Combine and deduplicate
      reelids = [...new Set([...followedReels, ...tagMatchedReels].map((reel) => reel._id))];

      // If not enough reels, fill with recent reels
      if (reelids.length < perPage) {
        const additionalReels = await Reel.find({
          _id: { $nin: [...reelids, ...user.interactedReels.map((i) => i.reelId)] },
          createdAt: { $gte: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) },
        })
          .sort({ interactionScore: -1 })
          .limit(perPage - reelids.length)
          .select("_id");
        reelids = [...reelids, ...additionalReels.map((reel) => reel._id)];
      }
    } else if (type === "trending") {
      // Trending: Based on interactionScore and recent activity
      reelids = await Reel.find({
        _id: { $nin: user.interactedReels.map((i) => i.reelId) }, // Exclude viewed reels
        createdAt: { $gte: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) }, // Last 7 days
      })
        .sort({ interactionScore: -1, createdAt: -1 })
        .limit(perPage)
        .select("_id");
    } else {
      throw Error("Invalid type parameter. Use 'foryou' or 'trending'");
    }

    // Paginate results
    const start = (pageNo - 1) * perPage;
    const paginatedReelIds = reelids.slice(start, start + perPage);

    // Fetch detailed reel data
    const reels = await Promise.all(
      paginatedReelIds.map(async (id) => {
        const reelNow = await getReel(id);
        const reelUser = await User.findById(reelNow.userid);
        reelNow.isVerified = reelUser.isVerified;
        return reelNow;
      })
    );

    // Shuffle to add some randomness (optional)
    function shuffleArray(array) {
      for (let i = array.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
      }
      return array;
    }

    res.status(200).json({ reels: shuffleArray(reels) });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const shareReel = async (req, res) => {
  try {
    var {reelid, senderid, receiverid } = req.body
    const reel = await Reel.findById(reelid).lean();

    if (!reel) {
      throw Error("reel Not Found");
    }

    const sender = await User.findById(senderid);
    const receiver = await User.findById(receiverid);
    if (!sender) {
      throw Error("Sender Not Found");
    }
    if (!receiver) {
      throw Error("Receiver Not Found");
    }

    await sendMessageCustomShare(senderid, receiverid, "reel", reelid )

    res.status(200).json({
      message: "reel shared",
    });
  } catch (error) {
    console.log("error", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

// Simple in-memory cache for video metadata (5 minute TTL)
const videoMetadataCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

const getVideoMetadata = async (videoKey) => {
  const cached = videoMetadataCache.get(videoKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    return cached.data;
  }

  try {
    const headParams = {
      Bucket: bucketName,
      Key: videoKey,
    };
    
    const headCommand = new HeadObjectCommand(headParams);
    const headObject = await s3.send(headCommand);
    
    const metadata = {
      fileSize: headObject.ContentLength,
      contentType: headObject.ContentType || "video/mp4",
      acceptRanges: headObject.AcceptRanges || "bytes",
      lastModified: headObject.LastModified,
      etag: headObject.ETag,
    };

    // Cache the metadata
    videoMetadataCache.set(videoKey, {
      data: metadata,
      timestamp: Date.now(),
    });

    // Cleanup old cache entries periodically
    if (videoMetadataCache.size > 1000) {
      const now = Date.now();
      for (const [key, value] of videoMetadataCache.entries()) {
        if (now - value.timestamp > CACHE_TTL) {
          videoMetadataCache.delete(key);
        }
      }
    }

    return metadata;
  } catch (error) {
    console.error("Error fetching video metadata:", error);
    throw error;
  }
};

// Video Streaming API - Supports HTTP Range requests for chunked video delivery
const streamReelVideo = async (req, res) => {
  let s3Stream = null;
  
  try {
    const { reelid } = req.params;
    
    // Find the reel (use lean for better performance)
    const reel = await Reel.findById(reelid).lean().select("video");
    if (!reel) {
      if (!res.headersSent) {
        return res.status(404).json({ error: "Reel not found" });
      }
      return;
    }

    if (!reel.video || reel.video === "") {
      if (!res.headersSent) {
        return res.status(404).json({ error: "Video not found for this reel" });
      }
      return;
    }

    // Get video metadata (with caching)
    const metadata = await getVideoMetadata(reel.video);
    const { fileSize, contentType, acceptRanges, lastModified, etag } = metadata;

    // Parse Range header from request
    const range = req.headers.range;
    
    if (!range) {
      // If no range header, return full video (for initial request or non-range clients)
      const getObjectParams = {
        Bucket: bucketName,
        Key: reel.video,
      };
      const command = new GetObjectCommand(getObjectParams);
      s3Stream = await s3.send(command);
      
      // Set headers for full content
      res.setHeader("Content-Type", contentType);
      res.setHeader("Content-Length", fileSize);
      res.setHeader("Accept-Ranges", acceptRanges);
      res.setHeader("Last-Modified", lastModified);
      res.setHeader("ETag", etag);
      res.setHeader("Cache-Control", "public, max-age=3600");
      res.setHeader("Connection", "keep-alive");
      
      // Stream the full video with error handling
      s3Stream.Body.on('error', (error) => {
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming video" });
        } else {
          res.destroy();
        }
      });

      s3Stream.Body.pipe(res);
      return;
    }

    // Parse range header (format: "bytes=start-end")
    const parts = range.replace(/bytes=/, "").split("-");
    const start = parseInt(parts[0], 10);
    const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
    
    // Validate range
    if (isNaN(start) || isNaN(end) || start >= fileSize || end >= fileSize || start > end || start < 0) {
      if (!res.headersSent) {
        res.status(416).setHeader("Content-Range", `bytes */${fileSize}`);
        return res.end();
      }
      return;
    }

    const chunkSize = end - start + 1;

    // Get object with range
    const getObjectParams = {
      Bucket: bucketName,
      Key: reel.video,
      Range: `bytes=${start}-${end}`,
    };
    
    const command = new GetObjectCommand(getObjectParams);
    s3Stream = await s3.send(command);

    // Set headers for partial content (HTTP 206)
    res.status(206); // Partial Content
    res.setHeader("Content-Range", `bytes ${start}-${end}/${fileSize}`);
    res.setHeader("Accept-Ranges", acceptRanges);
    res.setHeader("Content-Length", chunkSize);
    res.setHeader("Content-Type", contentType);
    res.setHeader("Last-Modified", lastModified);
    res.setHeader("ETag", etag);
    res.setHeader("Cache-Control", "public, max-age=3600");
    res.setHeader("Connection", "keep-alive");

    // Handle stream errors
    s3Stream.Body.on('error', (error) => {
      if (!res.headersSent) {
        res.status(500).json({ error: "Error streaming video" });
      } else {
        res.destroy();
      }
    });

    // Handle client disconnect
    req.on('close', () => {
      if (s3Stream && s3Stream.Body) {
        s3Stream.Body.destroy();
      }
    });

    // Stream the chunk
    s3Stream.Body.pipe(res);
  } catch (error) {
    console.error("Streaming error:", error);
    if (!res.headersSent) {
      res.status(500).json({ error: "Error streaming video" });
    } else {
      res.destroy();
    }
    
    // Clean up stream on error
    if (s3Stream && s3Stream.Body) {
      s3Stream.Body.destroy();
    }
  }
};

module.exports = {
  postReel,
  deleteReel,
  likeReel,
  getUserReels,
  getAllPostedReels,
  viewReel,
  makeComment,
  getComments,
  likeComment,
  deleteComment,
  makeReply,
  getReplies,
  likeReply,
  deleteReply,
  getTotalReels,
  acceptReel,
  upgradedGetAllPostedReels,
  editReel,
  getReelById,
  getRecommendedReels,
  getAllNudityReels,
  shareReel,
  streamReelVideo
};



