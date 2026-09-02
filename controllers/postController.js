const User = require("../models/userModel");
const Post = require("../models/postModel");
const Activity = require("../models/activityModel");
const Comment = require("../models/commentModel");
const Reply = require("../models/replyModel");
const Wallet = require("../models/walletModel");
const axios = require("axios");
const Admin = require("../models/adminModel")
const FormData = require("form-data");
const { createTransaction } = require('./globalTransactionController');
const fs = require("fs");
const { fileOps } = require("../helpers/otherHelpers");

// Helper: Get video duration using ffmpeg (you already have similar logic elsewhere)
const ffmpeg = require('fluent-ffmpeg'); // make sure it's installed & required at top

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

const { getPicUrl } = require("../controllers/userController");
const { updateRankingPointsForUser } = require("../helpers/rankingPoints");
const Badge = require("../models/badgeModel");
const { getBadgeImageUrl } = require("./badgeController");

require("dotenv").config();

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const { sendNotification } = require("./notificationController");
const { createActivity } = require("./activityController");
const { ApiFeatures } = require("../helpers/ApiFeatures");
const { sendMessageCustomShare } = require("../helpers/otherHelpers");
const { markOnboardingTask } = require("../helpers/newUserOnboardingHelper");
const transactionHistoryModel = require("../models/transactionHistoryModel");

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const acceptPost = async (req, res) => {
  try {
    const { postId } = req.body;
    if (!postId) {
      return res.status(400).json({ error: "Post ID is required" });
    }
    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ error: "Post not found" });
    }
    // post.sigthengineResults = post.sigthengineResults.filter(
    //   (result) => result !== "nudity"
    // );
    // await post.save();
    await post.updateOne({
      sigthengineResults: null,
      restrictedContent: false,
      abusiveText: false
    })
    res.status(200).json({ message: "Post updated successfully", post });
  } catch (error) {
    console.error(error);
    res
      .status(500)
      .json({ error: "An error occurred while updating the post" });
  }
};
const getTotalPosts = async (req, res) => {
  try {
    const postIds = await Post.find({}).select("_id");
    if (!Array.isArray(postIds) || postIds.length === 0) {
      return res.status(200).json({ posts: [] });
    }
    const posts = await Promise.all(
      postIds.map(async (doc) => {
        if (!doc || !doc._id) {
          return null;
        }
        const postId = doc._id.toString();
        const post = await Post.findById(postId);
        if (!post) {
          return null;
        }
        const user = await User.findById(post.userid);
        if (!user) {
          return null;
        }
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
              expiresIn: 604800,
            });
            const contentType = object.ContentType;
            return {
              contentType,
              objectUrl,
            };
          })
        );
        let thumbnailArray = [];
        let count = 0;
        if (post.thumbnails && post.thumbnails.length > 0) {
          thumbnailArray = await Promise.all(
            post.thumbnails.map(async (thumbnail, index) => {
              let getObjectParams = {
                Bucket: bucketName,
                Key: thumbnail,
              };
              let command = new GetObjectCommand(getObjectParams);
              let command2 = new HeadObjectCommand(getObjectParams);
              const object = await s3.send(command2);
              const objectUrl = await getSignedUrl(s3, command, {
                expiresIn: 604800,
              });
              return {
                contentType: object.ContentType,
                objectUrl,
                index,
              };
            })
          );
        }
        contentArray = await Promise.all(
          contentArray.map((object) => {
            const type = object.contentType.split("/")[0];
            if (type === "video") {
              const thumbnail = thumbnailArray.find(
                (thumbnail) => thumbnail.index === count
              );
              if (thumbnail) {
                object.thumbnail = thumbnail.objectUrl;
                count++;
              }
            } else if (type === "image") {
              object.thumbnail = object.objectUrl;
            }
            return object;
          })
        );
        let postObj = post.toObject();
        postObj.contentArray = contentArray;
        postObj.username = user.username;
        postObj.profilePictureUrl = url;
        postObj.isTextPost = !(
          post.contents.length > 0 ||
          (post.description && post.description !== "")
        );
        return postObj;
      })
    );
    const filteredPosts = posts.filter((post) => post !== null);
    res.status(200).json({ posts: filteredPosts });
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error);
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
    let count = 0; // Initialize count variable
    if (post.thumbnails.length != 0) {
      thumbnailArray = await Promise.all(
        post.thumbnails.map(async (thumbnail, index) => {
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
            index,
          };
        })
      );
    }

    contentArray = await Promise.all(
      contentArray.map((object) => {
        const type = object.contentType.split("/")[0];

        if (type == "video") {
          const thumbnail = thumbnailArray.find(
            (thumbnail) => thumbnail.index === count
          );
          if (thumbnail) {
            object.thumbnail = thumbnail.objectUrl;
            count++;
          }
        } else if (type == "image") {
          object.thumbnail = object.objectUrl;
        }

        return object;
      })
    );

    post = post.toObject();
    post.contentArray = contentArray;
    post.username = user.username;
    post.profilePictureUrl = url;

    if (
      post.contents.length == 0 &&
      post.description &&
      post.description != ""
    ) {
      post.isTextPost = true;
    } else {
      post.isTextPost = false;
    }
    return post;
  } catch (error) {
    throw new Error(error.message);
  }
};
const getAllposts = async (req, res) => {
  try {
    const userid = req.params.userid;
    const pageNo = req.params.pageNo;
    const perPage = req.params.perPage;
    console.log("userid", userid);

    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const following = user.following;
    following.push(userid);

    const postids = await Post.find({ userid: { $in: following } })
      .skip((pageNo - 1) * perPage)
      .limit(perPage)
      .sort({ createdAt: -1 })
      .select("_id");

    const posts = await Promise.all(
      postids.map(async (id) => {
        var postNow = await getPost(id);
        const userid = postNow.userid;
        const user = await User.findById(userid);
        // postNow = postNow.toObject();
        postNow.isVerified = user.isVerified;
        return postNow;
      })
    );

    console.log();

    res.status(200).json({ posts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllPostsLatest = async (req, res) => {
  try {
    const userid = req.params.userid;
    const pageNo = req.params.pageNo;
    const perPage = req.params.perPage;

    const trendingPostsCountRaw = Number(req.query.trendingPostsCount);
    const topCreatorsCountRaw = Number(req.query.topCreatorsCount);
    const trendingPostsCount =
      Number.isFinite(trendingPostsCountRaw) && trendingPostsCountRaw > 0
        ? Math.min(Math.trunc(trendingPostsCountRaw), 50)
        : 10;
    const topCreatorsCount =
      Number.isFinite(topCreatorsCountRaw) && topCreatorsCountRaw > 0
        ? Math.min(Math.trunc(topCreatorsCountRaw), 50)
        : 10;

    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const following = user.following;
    following.push(userid);

    const postids = await Post.find({ userid: { $in: following } })
      .skip((pageNo - 1) * perPage)
      .limit(perPage)
      .sort({ createdAt: -1 })
      .select("_id");

    const posts = await Promise.all(
      postids.map(async (id) => {
        var postNow = await getPost(id);
        const postUserId = postNow.userid;
        const postUser = await User.findById(postUserId);
        postNow.isVerified = postUser?.isVerified || false;
        return postNow;
      }),
    );

    const trendingSampleSize = Math.min(200, Math.max(trendingPostsCount * 3, trendingPostsCount));
    const trendingPostIds = await Post.aggregate([
      { $match: { $expr: { $gt: [{ $size: { $ifNull: ["$likes", []] } }, 4] } } },
      { $sample: { size: trendingSampleSize } },
      { $project: { _id: 1, userid: 1 } },
    ]);

    const trendingPostsFiltered = [];
    for (const p of trendingPostIds) {
      if (trendingPostsFiltered.length >= trendingPostsCount) break;
      const postUser = await User.findById(p.userid).select("isPrivate followers isVerified").lean();
      if (!postUser) continue;

      const isSelf = postUser._id.toString() === userid.toString();
      const requesterIsFollower = Array.isArray(postUser.followers)
        ? postUser.followers.some((f) => f.toString() === userid.toString())
        : false;

      if (postUser.isPrivate && !isSelf && !requesterIsFollower) continue;

      const postNow = await getPost(p._id);
      postNow.isVerified = postUser.isVerified || false;
      trendingPostsFiltered.push(postNow);
    }

    const trendingPosts = trendingPostsFiltered;

    let topCreators = await User.find({})
      .sort({ rankingPoints: -1 })
      .limit(topCreatorsCount)
      .select("firstname lastname username followers following rankingPoints badges profilePicture")
      .lean();

    topCreators = await Promise.all(
      topCreators.map(async (u) => ({
        _id: u._id,
        firstname: u.firstname || "",
        lastname: u.lastname || "",
        username: u.username,
        profilePicture: await getPicUrl(u._id),
        totalFollowers: Array.isArray(u.followers) ? u.followers.length : 0,
        totalFollowings: Array.isArray(u.following) ? u.following.length : 0,
        rankingPoints: u.rankingPoints || 0,
        badges: await (async () => {
          const ids = (u.badges || []).map((id) => id.toString());
          if (ids.length === 0) return [];
          const badges = await Badge.find({ _id: { $in: ids } }).select("title text image").lean();
          const byId = new Map(badges.map((b) => [b._id.toString(), b]));
          return Promise.all(
            ids
              .filter((id) => byId.has(id))
              .map(async (id) => {
                const b = byId.get(id);
                return { _id: b._id, title: b.title, text: b.text, imageUrl: await getBadgeImageUrl(b.image) };
              }),
          );
        })(),
      })),
    );

    res.status(200).json({ posts, trendingPosts, topCreators });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const getAllNudityPosts = async (req, res) => {
  try {
    // let apiFeature = new ApiFeatures(Post.find({ sigthengineResults: { $exists: true, $not: { $size: 0 } } }), req.query)
    let apiFeature = new ApiFeatures(Post.find({ sigthengineResults: { $exists: true, $ne: null, $not: { $size: 0 } } }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort({ createdAt: -1 })
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    var posts = [];
    result = await Promise.all(
      result.map(async (post) => {
        post = post.toObject();
        posts.push(await getPost(post._id))
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, posts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

// const createPost = async (req, res) => {
//   let { userid, description, postType, price, commentsAllowed, location } = req.body;
//   try {
//     price = parseInt(price, 10);

//     if(!commentsAllowed){
//       commentsAllowed = true;
//     }
//     var post;

//     const user = await User.findById(userid);

//     if (!user) {
//       // await sendNotification(userid, "Error creating post", "User not found");
//       // throw Error("User Not Found");
//       return req.status(400).json({ error: "User Not Found" });
//     }

//     const contentsResponse = [];
//     const imageModels = [
//       "nudity-2.1",
//       "weapon",
//       "alcohol",
//       "recreational_drug",
//       "medical",
//       "properties",
//       "type",
//       "quality",
//       "offensive-2.0",
//       "faces",
//       "people-counting",
//       "text-content",
//       "face-age",
//       "gore-2.0",
//       "text",
//       "qr-content",
//       "tobacco",
//       "genai",
//       "violence",
//       "self-harm",
//       "money",
//       "gambling"
//     ];
//     const videoModels = [
//       "nudity-2.1",
//       "weapon",
//       "alcohol",
//       "recreational_drug",
//       "medical",
//       "properties",
//       "type",
//       "quality",
//       "offensive-2.0",
//       "faces",
//       "people-counting",
//       "text-content",
//       "face-age",
//       "gore-2.0",
//       "text",
//       "qr-content",
//       "tobacco",
//       "genai",
//       "violence",
//       "self-harm",
//       "money",
//       "gambling"
//     ];
//     let sigthengineResults = [];
//     let allModels = [];
//     let imageModelResults = [];

//     var explicityRatio = 0.5;
//     var nudityRatio = 0.5;

//     var contentNames = [];

//     if (req.files["contents"]) {
//       for (const content of req.files["contents"]) {
//         const contentName = randomName();
//         const params = {
//           Bucket: bucketName,
//           Key: contentName,
//           Body: content.buffer,
//           ContentType: content.mimetype,
//         };
//         const command = new PutObjectCommand(params);
//         await s3.send(command);

//         if (content.mimetype.startsWith("image")) {
//           const sightengineResponse = await checkImageWithSightengine(
//             content.buffer,
//             imageModels
//           );
//           contentsResponse.push(sightengineResponse);

//           // Handle response structure - can be direct or nested in data
//           const responseData = sightengineResponse.data || sightengineResponse;
//           const frame = responseData.frames?.[0] || responseData;

//           if (responseData && (responseData.frames || responseData.nudity)) {
//             // Check for abusive text in image
//             if (
//               frame.text &&
//               (frame.text.profanity?.length > 0 ||
//                 frame.text.personal?.length > 0 ||
//                 frame.text.extremism?.length > 0 ||
//                 frame.text.violence?.length > 0 ||
//                 frame.text.self_harm?.length > 0)
//             ) {
//               imageModelResults.push("profanity-text");
//             }

//             // Check for QR content
//             if (
//               frame.qr &&
//               (frame.qr.personal?.length > 0 ||
//                 frame.qr.link?.length > 0 ||
//                 frame.qr.social?.length > 0 ||
//                 frame.qr.spam?.length > 0 ||
//                 frame.qr.profanity?.length > 0 ||
//                 frame.qr.blacklist?.length > 0)
//             ) {
//               imageModelResults.push("qr-content");
//             }

//             // Check for nudity (nudity-2.1 model)
//             if (frame.nudity) {
//             const nuditySubModels = [
//               "sexual_activity",
//               "sexual_display",
//               "erotica",
//               "sextoy",
//             ];
//             let hasNudity = false;
//             for (const subModel of nuditySubModels) {
//                 if (frame.nudity[subModel] > nudityRatio) {
//                 hasNudity = true;
//                 break;
//               }
//             }
//             if (hasNudity) {
//               imageModelResults.push("nudity");
//             }

//               // Check for exposed body (chest, most of body visible)
//               if (frame.nudity.suggestive_classes) {
//                 const suggestive = frame.nudity.suggestive_classes;
//                 // Check for bikini (restrict bikini images)
//                 if (suggestive.bikini > 0.5) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for swimwear (male or one-piece)
//                 if (
//                   suggestive.swimwear_male > 0.5 ||
//                   suggestive.swimwear_one_piece > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for male chest with very revealing or revealing
//                 if (
//                   (suggestive.male_chest > 0.5 &&
//                    suggestive.male_chest_categories &&
//                    (suggestive.male_chest_categories.very_revealing > 0.5 ||
//                     suggestive.male_chest_categories.revealing > 0.5)) ||
//                   // Check for visibly undressed
//                   suggestive.visibly_undressed > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for female chest/cleavage
//                 if (
//                   suggestive.cleavage > 0.5 &&
//                   suggestive.cleavage_categories &&
//                   (suggestive.cleavage_categories.very_revealing > 0.5 ||
//                     suggestive.cleavage_categories.revealing > 0.5)
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for underwear visible (male underwear)
//                 if (
//                   suggestive.male_underwear > 0.5 ||
//                   suggestive.lingerie > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for suggestive poses or focus
//                 if (
//                   suggestive.suggestive_pose > 0.5 ||
//                   suggestive.suggestive_focus > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // High suggestive overall (most of body visible)
//                 // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
//                 if (
//                   frame.nudity.suggestive > 0.7 ||
//                   frame.nudity.very_suggestive > 0.5 ||
//                   frame.nudity.mildly_suggestive > 0.7
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//               }
//             }

//             // Check for weapons - handle nested structure
//             if (frame.weapon) {
//               // Check if weapon is a number (old format) or object (new format)
//               if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//                 imageModelResults.push("weapon");
//               } else if (frame.weapon.classes) {
//                 // New nested structure: weapon.classes.firearm, weapon.classes.knife, etc.
//                 const weaponClasses = frame.weapon.classes;
//                 if (
//                   weaponClasses.firearm > explicityRatio ||
//                   weaponClasses.firearm_gesture > explicityRatio ||
//                   weaponClasses.knife > explicityRatio ||
//                   weaponClasses.firearm_toy > explicityRatio
//                 ) {
//                   imageModelResults.push("weapon");
//                 }
//               }
//               // Also check old format fields
//               if (
//                 frame.weapon_firearm > explicityRatio ||
//                 frame.weapon_knife > explicityRatio
//               ) {
//                 imageModelResults.push("weapon");
//               }
//             }

//             // Check for alcohol
//             if (frame.alcohol) {
//               if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//                 imageModelResults.push("alcohol");
//               } else if (frame.alcohol.prob > explicityRatio) {
//                 imageModelResults.push("alcohol");
//               }
//             }

//             // Check for drugs - handle nested structure
//             if (frame.recreational_drug) {
//               if (frame.recreational_drug.prob > explicityRatio) {
//                 imageModelResults.push("drugs");
//               } else if (frame.recreational_drug.classes) {
//                 const drugClasses = frame.recreational_drug.classes;
//                 if (
//                   drugClasses.cannabis > explicityRatio ||
//                   drugClasses.cannabis_drug > explicityRatio ||
//                   drugClasses.cannabis_plant > explicityRatio ||
//                   drugClasses.recreational_drugs_not_cannabis > explicityRatio
//                 ) {
//                   imageModelResults.push("drugs");
//                 }
//               }
//             }
//             // Check medical drugs
//             if (frame.medical) {
//               if (frame.medical.prob > explicityRatio) {
//                 imageModelResults.push("drugs");
//               } else if (frame.medical.classes) {
//                 const medicalClasses = frame.medical.classes;
//                 if (
//                   medicalClasses.pills > explicityRatio ||
//                   medicalClasses.paraphernalia > explicityRatio
//                 ) {
//                   imageModelResults.push("drugs");
//                 }
//               }
//             }
//             // Also check old format fields
//             if (
//               frame.drugs > explicityRatio ||
//               frame.medical_drugs > explicityRatio ||
//               frame.recreational_drugs > explicityRatio
//             ) {
//               imageModelResults.push("drugs");
//             }

//             // Check for gore/blood (gore-2.0 model)
//             if (
//               frame.gore?.prob > explicityRatio ||
//               frame["gore-2.0"]?.prob > explicityRatio
//             ) {
//               imageModelResults.push("gore");
//             }

//             // Check for violence
//             if (frame.violence?.prob > explicityRatio) {
//               imageModelResults.push("violence");
//             }

//             // Check for self-harm
//             if (frame["self-harm"]?.prob > explicityRatio) {
//               imageModelResults.push("self-harm");
//             }

//             // Check for tobacco
//             if (frame.tobacco?.prob > explicityRatio) {
//               imageModelResults.push("tobacco");
//             }

//             // Check for gambling
//             if (frame.gambling?.prob > explicityRatio) {
//               imageModelResults.push("gambling");
//             }

//             // Check for offensive content (offensive-2.0 model) - flags, ISIS, etc.
//             if (frame.offensive || frame["offensive-2.0"]) {
//               const offensive = frame.offensive || frame["offensive-2.0"];
//               const offensiveScore = Math.max(
//                 offensive.prob || 0,
//                 offensive.nazi || 0,
//                 offensive.asian_swastika || 0,
//                 offensive.confederate || 0,
//                 offensive.supremacist || 0,
//                 offensive.terrorist || 0,
//                 offensive.middle_finger || 0,
//                 offensive.flag || 0
//               );
//               // Lower threshold for flags and terrorist symbols
//               if (offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1) {
//               imageModelResults.push("offensive");
//               }
//             }

//             // Check for masked men (faces with masks)
//             if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
//               const hasMaskedFace = frame.faces.some(face => 
//                 face.attributes && (
//                   face.attributes.mask > 0.5 ||
//                   face.attributes.face_mask > 0.5 ||
//                   face.attributes.medical_mask > 0.5
//                 )
//               );
//               if (hasMaskedFace) {
//                 imageModelResults.push("masked-men");
//               }
//             }

//             // Check for money
//             if (frame.money?.prob > explicityRatio) {
//               imageModelResults.push("money");
//             }

//             imageModelResults.forEach((model) => {
//               if (!sigthengineResults.includes(model)) {
//                 sigthengineResults.push(model);
//               }
//             });
//           }
//         } else if (content.mimetype.startsWith("video")) {
//           const sightengineResponse = await checkVideoWithSightengine(
//             content.buffer,
//             videoModels
//           );
//           contentsResponse.push(sightengineResponse);

//           // Handle response structure - can be direct or nested in data
//           const responseData = sightengineResponse.data || sightengineResponse;
//           const frame = responseData.frames?.[0] || responseData;

//           if (responseData && (responseData.frames || responseData.nudity)) {
//             // Check for abusive text in video
//             if (
//               frame.text &&
//               (frame.text.profanity?.length > 0 ||
//                 frame.text.personal?.length > 0 ||
//                 frame.text.extremism?.length > 0 ||
//                 frame.text.violence?.length > 0 ||
//                 frame.text.self_harm?.length > 0)
//             ) {
//               allModels.push("profanity-text");
//             }

//             // Check for QR content
//             if (frame.qr) {
//               const qrContentValues = Object.values(frame.qr);
//               if (
//                 qrContentValues.some(
//                   (value) => Array.isArray(value) && value.length > 0
//                 )
//               ) {
//                 allModels.push("qr-content");
//               }
//             }

//             // Check for nudity (nudity-2.1 model)
//             if (frame.nudity) {
//             const nuditySubModels = [
//               "sexual_activity",
//               "sexual_display",
//               "erotica",
//               "sextoy",
//             ];
//             let hasNudity = false;
//             for (const subModel of nuditySubModels) {
//                 if (frame.nudity[subModel] > nudityRatio) {
//                 hasNudity = true;
//                 break;
//               }
//             }
//             if (hasNudity) {
//               allModels.push("nudity");
//             }

//               // Check for exposed body (chest, most of body visible)
//               if (frame.nudity.suggestive_classes) {
//                 const suggestive = frame.nudity.suggestive_classes;
//                 // Check for bikini (restrict bikini images)
//                 if (suggestive.bikini > 0.5) {
//                   allModels.push("nudity");
//                 }
//                 // Check for swimwear (male or one-piece)
//                 if (
//                   suggestive.swimwear_male > 0.5 ||
//                   suggestive.swimwear_one_piece > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for male chest with very revealing or revealing
//                 if (
//                   (suggestive.male_chest > 0.5 &&
//                    suggestive.male_chest_categories &&
//                    (suggestive.male_chest_categories.very_revealing > 0.5 ||
//                     suggestive.male_chest_categories.revealing > 0.5)) ||
//                   // Check for visibly undressed
//                   suggestive.visibly_undressed > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for female chest/cleavage
//                 if (
//                   suggestive.cleavage > 0.5 &&
//                   suggestive.cleavage_categories &&
//                   (suggestive.cleavage_categories.very_revealing > 0.5 ||
//                     suggestive.cleavage_categories.revealing > 0.5)
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for underwear visible (male underwear)
//                 if (
//                   suggestive.male_underwear > 0.5 ||
//                   suggestive.lingerie > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for suggestive poses or focus
//                 if (
//                   suggestive.suggestive_pose > 0.5 ||
//                   suggestive.suggestive_focus > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // High suggestive overall (most of body visible)
//                 // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
//                 if (
//                   frame.nudity.suggestive > 0.7 ||
//                   frame.nudity.very_suggestive > 0.5 ||
//                   frame.nudity.mildly_suggestive > 0.7
//                 ) {
//                   allModels.push("nudity");
//                 }
//               }
//             }

//             // Check for weapons - handle nested structure
//             if (frame.weapon) {
//               // Check if weapon is a number (old format) or object (new format)
//               if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//                 allModels.push("weapon");
//               } else if (frame.weapon.classes) {
//                 // New nested structure: weapon.classes.firearm, weapon.classes.knife, etc.
//                 const weaponClasses = frame.weapon.classes;
//                 if (
//                   weaponClasses.firearm > explicityRatio ||
//                   weaponClasses.firearm_gesture > explicityRatio ||
//                   weaponClasses.knife > explicityRatio ||
//                   weaponClasses.firearm_toy > explicityRatio
//                 ) {
//                   allModels.push("weapon");
//                 }
//               }
//               // Also check old format fields
//               if (
//                 frame.weapon_firearm > explicityRatio ||
//                 frame.weapon_knife > explicityRatio
//               ) {
//                 allModels.push("weapon");
//               }
//             }

//             // Check for alcohol
//             if (frame.alcohol) {
//               if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//                 allModels.push("alcohol");
//               } else if (frame.alcohol.prob > explicityRatio) {
//                 allModels.push("alcohol");
//               }
//             }

//             // Check for drugs - handle nested structure
//             if (frame.recreational_drug) {
//               if (frame.recreational_drug.prob > explicityRatio) {
//                 allModels.push("drugs");
//               } else if (frame.recreational_drug.classes) {
//                 const drugClasses = frame.recreational_drug.classes;
//                 if (
//                   drugClasses.cannabis > explicityRatio ||
//                   drugClasses.cannabis_drug > explicityRatio ||
//                   drugClasses.cannabis_plant > explicityRatio ||
//                   drugClasses.recreational_drugs_not_cannabis > explicityRatio
//                 ) {
//                   allModels.push("drugs");
//                 }
//               }
//             }
//             // Check medical drugs
//             if (frame.medical) {
//               if (frame.medical.prob > explicityRatio) {
//                 allModels.push("drugs");
//               } else if (frame.medical.classes) {
//                 const medicalClasses = frame.medical.classes;
//                 if (
//                   medicalClasses.pills > explicityRatio ||
//                   medicalClasses.paraphernalia > explicityRatio
//                 ) {
//                   allModels.push("drugs");
//                 }
//               }
//             }
//             // Also check old format fields
//             if (
//               frame.drugs > explicityRatio ||
//               frame.medical_drugs > explicityRatio ||
//               frame.recreational_drugs > explicityRatio
//             ) {
//               allModels.push("drugs");
//             }

//             // Check for gore/blood (gore-2.0 model)
//             if (
//               frame.gore?.prob > explicityRatio ||
//               frame["gore-2.0"]?.prob > explicityRatio
//             ) {
//               allModels.push("gore");
//             }

//             // Check for violence
//             if (frame.violence?.prob > explicityRatio) {
//               allModels.push("violence");
//             }

//             // Check for self-harm
//             if (frame["self-harm"]?.prob > explicityRatio) {
//               allModels.push("self-harm");
//             }

//             // Check for tobacco
//             if (frame.tobacco?.prob > explicityRatio) {
//               allModels.push("tobacco");
//             }

//             // Check for gambling
//             if (frame.gambling?.prob > explicityRatio) {
//             allModels.push("gambling");
//           }

//             // Check for offensive content (offensive-2.0 model) - flags, ISIS, etc.
//             if (frame.offensive || frame["offensive-2.0"]) {
//               const offensive = frame.offensive || frame["offensive-2.0"];
//               const offensiveScore = Math.max(
//                 offensive.prob || 0,
//                 offensive.nazi || 0,
//                 offensive.asian_swastika || 0,
//                 offensive.confederate || 0,
//                 offensive.supremacist || 0,
//                 offensive.terrorist || 0,
//                 offensive.middle_finger || 0,
//                 offensive.flag || 0
//               );
//               // Lower threshold for flags and terrorist symbols
//               if (offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1) {
//             allModels.push("offensive");
//           }
//             }

//             // Check for masked men (faces with masks)
//             if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
//               const hasMaskedFace = frame.faces.some(face => 
//                 face.attributes && (
//                   face.attributes.mask > 0.5 ||
//                   face.attributes.face_mask > 0.5 ||
//                   face.attributes.medical_mask > 0.5
//                 )
//               );
//               if (hasMaskedFace) {
//                 allModels.push("masked-men");
//               }
//             }

//             // Check for money
//             if (frame.money?.prob > explicityRatio) {
//               allModels.push("money");
//           }

//           allModels.forEach((model) => {
//             if (!sigthengineResults.includes(model)) {
//               sigthengineResults.push(model);
//             }
//           });
//           }
//         }

//         contentNames.push(contentName);
//       }
//     }



//     // Check description text for abusive content
//     let descriptionTextResult = null;
//     let hasAbusiveDescription = false;
//     if (description && description.trim() !== "") {
//       try {
//         descriptionTextResult = await checkTextSightengine(description);
        
//         // Handle response structure - can be direct or nested
//         const textResult = descriptionTextResult.data || descriptionTextResult;
        
//         // Check if description contains abusive content
//         // Sightengine returns arrays for each category
//         hasAbusiveDescription = 
//           (textResult.profanity && Array.isArray(textResult.profanity) && textResult.profanity.length > 0) ||
//           (textResult.extremism && Array.isArray(textResult.extremism) && textResult.extremism.length > 0) ||
//           (textResult.violence && Array.isArray(textResult.violence) && textResult.violence.length > 0) ||
//           (textResult.self_harm && Array.isArray(textResult.self_harm) && textResult.self_harm.length > 0) ||
//           (textResult.drug && Array.isArray(textResult.drug) && textResult.drug.length > 0) ||
//           (textResult.weapon && Array.isArray(textResult.weapon) && textResult.weapon.length > 0) ||
//           (textResult.personal && Array.isArray(textResult.personal) && textResult.personal.length > 0) ||
//           (textResult.link && Array.isArray(textResult.link) && textResult.link.length > 0) ||
//           (textResult.spam && Array.isArray(textResult.spam) && textResult.spam.length > 0);
        
//         // Debug logging (can be removed in production)
//         if (hasAbusiveDescription) {
//           console.log("Abusive text detected in description:", textResult);
//           sigthengineResults.push("profanity-text");
//         }
//       } catch (error) {
//         console.error("Error checking description text:", error);
//         // If text moderation fails, we should still check for common profanity patterns as fallback
//         const commonProfanity = /\b(fuck|shit|damn|bitch|asshole|piss|hell|crap)\b/gi;
//         if (commonProfanity.test(description)) {
//           hasAbusiveDescription = true;
//           sigthengineResults.push("profanity-text");
//         }
//       }
//     }

//     const includeTextContent = contentsResponse.some(
//       (response) => {
//         const responseData = response.data || response;
//         const frame = responseData.frames?.[0] || responseData;
//         return frame.text && (
//           frame.text.profanity?.length > 0 ||
//           frame.text.personal?.length > 0 ||
//           frame.text.extremism?.length > 0 ||
//           frame.text.violence?.length > 0 ||
//           frame.text.self_harm?.length > 0
//         );
//       }
//     );

//     const includeQRContent = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return frame.qr && (
//         (frame.qr.personal && frame.qr.personal.length > 0) ||
//         (frame.qr.link && frame.qr.link.length > 0) ||
//         (frame.qr.social && frame.qr.social.length > 0) ||
//         (frame.qr.spam && frame.qr.spam.length > 0) ||
//         (frame.qr.profanity && frame.qr.profanity.length > 0) ||
//         (frame.qr.blacklist && frame.qr.blacklist.length > 0)
//       );
//     });

//     const includeNudity = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return frame.nudity && (
//         frame.nudity.sexual_activity > nudityRatio ||
//         frame.nudity.sexual_display > nudityRatio ||
//         frame.nudity.erotica > nudityRatio ||
//         frame.nudity.sextoy > nudityRatio
//       );
//     });

//     const includeWad = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
      
//       // Check weapons
//       let hasWeapon = false;
//       if (frame.weapon) {
//         if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//           hasWeapon = true;
//         } else if (frame.weapon.classes) {
//           const weaponClasses = frame.weapon.classes;
//           hasWeapon = (
//             weaponClasses.firearm > explicityRatio ||
//             weaponClasses.firearm_gesture > explicityRatio ||
//             weaponClasses.knife > explicityRatio
//           );
//         }
//       }
//       if (!hasWeapon && (
//         frame.weapon_firearm > explicityRatio ||
//         frame.weapon_knife > explicityRatio
//       )) {
//         hasWeapon = true;
//       }

//       // Check alcohol
//       let hasAlcohol = false;
//       if (frame.alcohol) {
//         if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//           hasAlcohol = true;
//         } else if (frame.alcohol.prob > explicityRatio) {
//           hasAlcohol = true;
//         }
//       }

//       // Check drugs
//       let hasDrugs = false;
//       if (frame.recreational_drug) {
//         if (frame.recreational_drug.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.recreational_drug.classes) {
//           const drugClasses = frame.recreational_drug.classes;
//           hasDrugs = (
//             drugClasses.cannabis > explicityRatio ||
//             drugClasses.cannabis_drug > explicityRatio ||
//             drugClasses.recreational_drugs_not_cannabis > explicityRatio
//           );
//         }
//       }
      
//       if (!hasDrugs && frame.medical) {
//         if (frame.medical.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.medical.classes) {
//           hasDrugs = (
//             frame.medical.classes.pills > explicityRatio ||
//             frame.medical.classes.paraphernalia > explicityRatio
//           );
//         }
//       }
//       if (!hasDrugs && (
//         frame.drugs > explicityRatio ||
//         frame.medical_drugs > explicityRatio ||
//         frame.recreational_drugs > explicityRatio
//       )) {
//         hasDrugs = true;
//       }

//       return hasWeapon || hasAlcohol || hasDrugs;
//     });

//     const includeGore = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return (frame.gore?.prob > explicityRatio) || 
//              (frame["gore-2.0"]?.prob > explicityRatio);
//     });

//     const includeGambling = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return frame.gambling?.prob > explicityRatio;
//     });

//     const includeOffensive = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       const offensive = frame.offensive || frame["offensive-2.0"];
//       if (!offensive) return false;
//       const offensiveScore = Math.max(
//         offensive.prob || 0,
//         offensive.nazi || 0,
//         offensive.asian_swastika || 0,
//         offensive.confederate || 0,
//         offensive.supremacist || 0,
//         offensive.terrorist || 0,
//         offensive.middle_finger || 0,
//         offensive.flag || 0
//       );
//       // Lower threshold for flags and terrorist symbols (ISIS flag, etc.)
//       return offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1;
//     });

//     if (includeTextContent) {
//       sigthengineResults.push("profinity-text");
//     }
//     if (includeQRContent) {
//       sigthengineResults.push("qr-content");
//     }
//     // if (includeScamContent) {
//     //   sigthengineResults.push("scam");
//     // }
//     // if (includeMinor) {
//     //   sigthengineResults.push("minor");
//     // }
//     if (includeNudity) {
//       sigthengineResults.push("nudity-2.0");
//     }
//     if (includeWad) {
//       sigthengineResults.push("wad");
//     }
//     if (includeGore) {
//       sigthengineResults.push("horror");
//     }
//     // if (includeTobacco) {
//     //   sigthengineResults.push("tobacco");
//     // }
//     if (includeGambling) {
//       sigthengineResults.push("gambling");
//     }
//     if (includeOffensive) {
//       sigthengineResults.push("offensive");
//     }

//     // Check for explicit content that should block post creation
//     // These categories should prevent post creation: nudity, killing (violence/gore), shooting (weapon), isis flag (terrorist), flags (offensive)
//     const explicitBlockingCategories = ["nudity", "violence", "gore", "weapon", "offensive"];
//     const hasExplicitBlockingContent = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
      
//       if (!frame) return false;
      
//       // Check for nudity (sexual content)
//       const hasNudity = frame.nudity && (
//         frame.nudity.sexual_activity > nudityRatio ||
//         frame.nudity.sexual_display > nudityRatio ||
//         frame.nudity.erotica > nudityRatio ||
//         frame.nudity.sextoy > nudityRatio
//       );
      
//       // Check for exposed body (chest, most of body visible)
//       const hasExposedBody = frame.nudity && frame.nudity.suggestive_classes && (
//         frame.nudity.suggestive_classes.bikini > 0.5 ||
//         frame.nudity.suggestive_classes.swimwear_male > 0.5 ||
//         frame.nudity.suggestive_classes.swimwear_one_piece > 0.5 ||
//         (frame.nudity.suggestive_classes.male_chest > 0.5 && 
//          frame.nudity.suggestive_classes.male_chest_categories &&
//          (frame.nudity.suggestive_classes.male_chest_categories.very_revealing > 0.5 ||
//           frame.nudity.suggestive_classes.male_chest_categories.revealing > 0.5)) ||
//         (frame.nudity.suggestive_classes.cleavage > 0.5 &&
//          frame.nudity.suggestive_classes.cleavage_categories &&
//          (frame.nudity.suggestive_classes.cleavage_categories.very_revealing > 0.5 ||
//           frame.nudity.suggestive_classes.cleavage_categories.revealing > 0.5)) ||
//         frame.nudity.suggestive_classes.male_underwear > 0.5 ||
//         frame.nudity.suggestive_classes.lingerie > 0.5 ||
//         frame.nudity.suggestive_classes.visibly_undressed > 0.5 ||
//         frame.nudity.suggestive_classes.suggestive_pose > 0.5 ||
//         frame.nudity.suggestive_classes.suggestive_focus > 0.5 ||
//         frame.nudity.suggestive > 0.7 ||
//         frame.nudity.very_suggestive > 0.5 ||
//         frame.nudity.mildly_suggestive > 0.7
//       );
      
//       return hasNudity || hasExposedBody;
//     });
    
//     // Block post creation if explicit blocking content is found
//     if (hasExplicitBlockingContent) {      
//       // await sendNotification(
//       //   userid,
//       //   "Post Creation Failed",
//       //   "Your post contains explicit content and cannot be created"
//       // );
//       return res.status(400).json({
//         error: "Your post contains explicit content. Posts with nudity or too exposed body cannot be created.",
//         sigthengineResults: sigthengineResults,
//       });
//     }

//     // Compute restrictedContent and abusiveText flags based on actual Sightengine response
//     const hasRestrictedContent = contentsResponse.some((response) => {
//       // Handle response structure - can be direct or nested in data
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;

//       if (!frame) return false;

//       // Check for nudity (sexual content) - nude women, nude men, sex
//       const hasNudity = frame.nudity && (
//         frame.nudity.sexual_activity > nudityRatio ||
//         frame.nudity.sexual_display > nudityRatio ||
//         frame.nudity.erotica > nudityRatio ||
//         frame.nudity.sextoy > nudityRatio
//       );

//       // Check for chest or most of body visible (lots of human body exposed)
//       const hasExposedBody = frame.nudity && frame.nudity.suggestive_classes && (
//         // Bikini (restrict bikini images)
//         frame.nudity.suggestive_classes.bikini > 0.5 ||
//         // Swimwear (male or one-piece)
//         frame.nudity.suggestive_classes.swimwear_male > 0.5 ||
//         frame.nudity.suggestive_classes.swimwear_one_piece > 0.5 ||
//         // Male chest with very revealing or revealing
//         (frame.nudity.suggestive_classes.male_chest > 0.5 && 
//          frame.nudity.suggestive_classes.male_chest_categories &&
//          (frame.nudity.suggestive_classes.male_chest_categories.very_revealing > 0.5 ||
//           frame.nudity.suggestive_classes.male_chest_categories.revealing > 0.5)) ||
//         // Female chest/cleavage with very revealing or revealing
//         (frame.nudity.suggestive_classes.cleavage > 0.5 &&
//          frame.nudity.suggestive_classes.cleavage_categories &&
//          (frame.nudity.suggestive_classes.cleavage_categories.very_revealing > 0.5 ||
//           frame.nudity.suggestive_classes.cleavage_categories.revealing > 0.5)) ||
//         // Underwear visible (male underwear)
//         frame.nudity.suggestive_classes.male_underwear > 0.5 ||
//         frame.nudity.suggestive_classes.lingerie > 0.5 ||
//         // Visibly undressed
//         frame.nudity.suggestive_classes.visibly_undressed > 0.5 ||
//         // Suggestive poses or focus
//         frame.nudity.suggestive_classes.suggestive_pose > 0.5 ||
//         frame.nudity.suggestive_classes.suggestive_focus > 0.5 ||
//         // High suggestive probability overall (most of body visible)
//         // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
//         frame.nudity.suggestive > 0.7 ||
//         frame.nudity.very_suggestive > 0.5 ||
//         frame.nudity.mildly_suggestive > 0.7
//       );

//       // Check for weapons - handle nested structure
//       let hasWeapons = false;
//       if (frame.weapon) {
//         if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//           hasWeapons = true;
//         } else if (frame.weapon.classes) {
//           const weaponClasses = frame.weapon.classes;
//           hasWeapons = (
//             weaponClasses.firearm > explicityRatio ||
//             weaponClasses.firearm_gesture > explicityRatio ||
//             weaponClasses.knife > explicityRatio ||
//             weaponClasses.firearm_toy > explicityRatio
//           );
//         }
//       }
//       // Also check old format
//       if (!hasWeapons && (
//         frame.weapon_firearm > explicityRatio ||
//         frame.weapon_knife > explicityRatio
//       )) {
//         hasWeapons = true;
//       }

//       // Check for alcohol
//       let hasAlcohol = false;
//       if (frame.alcohol) {
//         if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//           hasAlcohol = true;
//         } else if (frame.alcohol.prob > explicityRatio) {
//           hasAlcohol = true;
//         }
//       }

//       // Check for drugs - handle nested structure
//       let hasDrugs = false;
//       if (frame.recreational_drug) {
//         if (frame.recreational_drug.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.recreational_drug.classes) {
//           const drugClasses = frame.recreational_drug.classes;
//           hasDrugs = (
//             drugClasses.cannabis > explicityRatio ||
//             drugClasses.cannabis_drug > explicityRatio ||
//             drugClasses.cannabis_plant > explicityRatio ||
//             drugClasses.recreational_drugs_not_cannabis > explicityRatio
//           );
//         }
//       }
//       // Check medical drugs
//       if (!hasDrugs && frame.medical) {
//         if (frame.medical.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.medical.classes) {
//           const medicalClasses = frame.medical.classes;
//           hasDrugs = (
//             medicalClasses.pills > explicityRatio ||
//             medicalClasses.paraphernalia > explicityRatio
//           );
//         }
//       }
//       // Also check old format
//       if (!hasDrugs && (
//         frame.drugs > explicityRatio ||
//         frame.medical_drugs > explicityRatio ||
//         frame.recreational_drugs > explicityRatio
//       )) {
//         hasDrugs = true;
//       }

//       // Check for gore/blood (gore-2.0 model)
//       var hasGore = 
//         (frame.gore && frame.gore.prob > explicityRatio) ||
//         (frame["gore-2.0"] && frame["gore-2.0"].prob > explicityRatio);

//       // Check for violence (fight, rape, etc.)
//       var hasViolence = frame.violence && frame.violence.prob > explicityRatio;

//       // Check for self-harm
//       const hasSelfHarm = frame["self-harm"] && frame["self-harm"].prob > explicityRatio;

//       // Check for tobacco
//       const hasTobacco = frame.tobacco && frame.tobacco.prob > explicityRatio;

//       // Check for gambling
//       const hasGambling = frame.gambling && frame.gambling.prob > explicityRatio;

//       // Check for offensive content - flags, ISIS flag, etc. (offensive-2.0 model)
//       var hasOffensive = false;
//       if (frame.offensive || frame["offensive-2.0"]) {
//         const offensive = frame.offensive || frame["offensive-2.0"];
//         const offensiveScore = Math.max(
//           offensive.prob || 0,
//           offensive.nazi || 0,
//           offensive.asian_swastika || 0,
//           offensive.confederate || 0,
//           offensive.supremacist || 0,
//           offensive.terrorist || 0,
//           offensive.middle_finger || 0,
//           offensive.flag || 0
//         );
//         // Lower threshold for flags and terrorist symbols (ISIS flag, etc.)
//         hasOffensive = offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1;
//       }

//       // Check for masked men
//       let hasMaskedMen = false;
//       if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
//         hasMaskedMen = frame.faces.some(face => 
//           face.attributes && (
//             face.attributes.mask > 0.5 ||
//             face.attributes.face_mask > 0.5 ||
//             face.attributes.medical_mask > 0.5
//           )
//         );
//       }

//       // Check for money
//       const hasMoney = frame.money && frame.money.prob > explicityRatio;
      
//       // Check for gore/blood (killing)
//       var hasGore = 
//         (frame.gore && frame.gore.prob > explicityRatio) ||
//         (frame["gore-2.0"] && frame["gore-2.0"].prob > explicityRatio);
      
//       // Check for violence (killing)
//       var hasViolence = frame.violence && frame.violence.prob > explicityRatio;

//       // For restrictedContent, exclude explicit blocking categories (nudity, violence, gore, weapon, offensive)
//       // These are already handled above and will block post creation
//       // Only include other restrictions like alcohol, drugs, tobacco, gambling, money, masked men
//       return hasAlcohol || hasDrugs || hasTobacco || hasGambling || hasMoney || hasMaskedMen || hasWeapons || hasGore || hasViolence || hasOffensive;
//     });

//     // Check for abusive text in images/videos and description
//     const hasAbusiveTextInMedia = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
      
//       if (!frame) return false;

//       // Check for profanity in text within images/videos
//       const hasTextProfanity = frame.text && (
//         (frame.text.profanity && frame.text.profanity.length > 0) ||
//         (frame.text.extremism && frame.text.extremism.length > 0) ||
//         (frame.text.violence && frame.text.violence.length > 0) ||
//         (frame.text.self_harm && frame.text.self_harm.length > 0)
//       );

//       // Check for profanity in QR codes
//       const hasQRProfanity = frame.qr && 
//         frame.qr.profanity && 
//         frame.qr.profanity.length > 0;

//       return hasTextProfanity || hasQRProfanity;
//     });

//     // Combine media text abuse check with description text abuse check
//     const hasAbusiveText = hasAbusiveTextInMedia || hasAbusiveDescription;




//     if (req.files["contents"]) {
//       if (!post) {
//         post = await Post.create({
//           userid,
//           description,
//           postType,
//           commentsAllowed,
//           location
//         });

//         if (postType == "paid") {
//           await post.updateOne({
//             price,
//           });
//         } else if (postType == "public") {
//           await post.updateOne({
//             price: 0,
//           });
//         }
//       }

//       await Post.findByIdAndUpdate(post._id, {
//         $push: { contents: contentNames },
//       });

//       if(hasRestrictedContent){
//         await post.updateOne({ 
//           sigthengineResults,
//           restrictedContent: hasRestrictedContent,
//           // abusiveText: hasAbusiveText
//         });
//       }
//     }
//     if (!post && description) {
//       post = await Post.create({
//         userid,
//         description,
//         postType,
//         commentsAllowed,
//         textPost: true,
//         location
//       });

//       if (postType == "paid") {
//         await post.updateOne({
//           price,
//         });
//       } else if (postType == "public") {
//         await post.updateOne({
//           price: 0,
//         });
//       }
//     }

//     if (!post) {
//       // await sendNotification(
//       //   userid,
//       //   "Error creating post",
//       //   `Please provide content`
//       // );
//       // throw Error("Please provide content");
//       res.status(400).json({
//         error: "Please provide content"
//       });
//     }
//     // else {
//     //   // var sockets = global.onlineSockets.get(userid);
//     //   // if (sockets) {
//     //   //   for (const socket of sockets) {
//     //   //     if (socket) {
//     //   //       socket.emit("errorCreatingPost", {
//     //   //         error: "Please provide content"
//     //   //       });
//     //   //     }
//     //   //   }
//     //   // }
//     //   await sendNotification(
//     //     userid,
//     //     "Error creating post",
//     //     `Please provide content`
//     //   );
//     //   throw Error("Please provide content");
//     // }

//     if (req.files["thumbnails"]) {
//       for (const thumbnail of req.files["thumbnails"]) {
//         const thumbnailName = randomName();
//         const params = {
//           Bucket: bucketName,
//           Key: thumbnailName,
//           Body: thumbnail.buffer,
//           ContentType: thumbnail.mimetype,
//         };
//         const command = new PutObjectCommand(params);
//         await s3.send(command);
//         console.log("post: ", post);
//         await Post.findByIdAndUpdate(post._id, {
//           $push: { thumbnails: thumbnailName },
//         });
//       }
//     }

//     await user.updateOne({ $push: { posts: post._id } });

//     // var sockets = global.onlineSockets.get(userid);
//     // if (sockets) {
//     //   for (const socket of sockets) {
//     //     if (socket) {
//     //       socket.emit("createdPost", {
//     //         description: truncateString(description, 30),
//     //         postid: post._id,
//     //         userid
//     //       });
//     //     }
//     //   }
//     // }
//     // await sendNotification(
//     //   userid,
//     //   "Post created",
//     //   truncateString(description, 30),
//     //   "post",
//     //   post._id
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
//         tags.map(tag => {
//           taggedUsers.push("")
//         })
        
//         // Print the extracted tags
//         await Promise.all(
//           tags.map(async (tag, i) => {
//             var taggedUser = await User.findOne({tag})
//             if(taggedUser){
//               taggedUsers[i] = taggedUser._id;
//             }
//           })
//         )

//         taggedUsers = taggedUsers.filter(tag => tag !== "");
//       }
//     }

//     await post.updateOne({
//       taggedUsers
//     })

//     console.log("tags: ", tags);
//     console.log("tagged users: ", taggedUsers)
//     await Promise.all(
//       user.followers.map(async (followerid) => {
//         if (followerid != userid) {
//           var follower = await User.findById(followerid);

//           var notificationTitle = `New ${postType == "paid" ? "paid ": ""}Post`;
//           var notificationBody = `has posted a New ${postType == "paid" ? "paid ": ""}Post`;
//           if(follower){
//             if (tags.includes(follower.tag)) {
//               notificationTitle = "Tagged in post";
//               notificationBody = `has tagged you in a post`;
//               tags = tags.filter(tag => tag !== follower.tag);
//             }
//           }
//           await sendNotification(
//             followerid,
//             notificationTitle,
//             `${user.firstname + " " + user.lastname} ${notificationBody}`,
//             "post",
//             post._id,
//             userid
//           );
//           await createActivity(
//             followerid,
//             user._id,
//             notificationBody,
//             undefined,
//             post._id,
//             null,
//             null,
//             null,
//             null,
//             null,
//             postType == "paid" ? "paidPost" : "freePost"
//           );
//         }
//       })
//     );

//     await Promise.all(
//       tags.map(async (tag) => {
//           var tagUser = await User.findOne({tag});

//           if(user){
//             var notificationTitle = "Tagged in post";
//             var notificationBody = `has tagged you in a post`;
//             await sendNotification(
//               tagUser._id,
//               notificationTitle,
//               `${user.firstname + " " + user.lastname} ${notificationBody}`,
//               "post",
//               post._id,
//               userid
//             );
//             await createActivity(
//               tagUser._id,
//               user._id,
//               "tagged you in a post",
//               undefined,
//               post._id,
//               null,
//               null,
//               null,
//               null,
//               null,
//               postType == "paid" ? "paidPost" : "freePost"
//             );
//           }
//       })
//     );

//     res.status(201).json({
//       message: "Post Posted",
//       contentsResponse,
//       sigthengineResults,
//     });
//   } catch (error) {
//     // var sockets = global.onlineSockets.get(userid);
//     //   if (sockets) {
//     //     for (const socket of sockets) {
//     //       if (socket) {
//     //         socket.emit("errorCreatingPost", {
//     //           error: error.message
//     //         });
//     //       }
//     //     }
//     //   }
//     // await sendNotification(userid, "Error creating post", error.message);
//     res.status(500).json({ error: error.message });
//     console.log("error: ", error);
//   }
// };

// const createPost = async (req, res) => {
//   let { userid, description, postType, price, commentsAllowed, location } = req.body;
//   try {
//     price = parseInt(price, 10);

//     if(!commentsAllowed){
//       commentsAllowed = true;
//     }
//     var post;

//     const user = await User.findById(userid);

//     if (!user) {
//       // await sendNotification(userid, "Error creating post", "User not found");
//       // throw Error("User Not Found");
//       return req.status(400).json({ error: "User Not Found" });
//     }

//     const contentsResponse = [];
//     const imageModels = [
//       "nudity-2.1",
//       "weapon",
//       "alcohol",
//       "recreational_drug",
//       "medical",
//       "properties",
//       "type",
//       "quality",
//       "offensive-2.0",
//       "faces",
//       "people-counting",
//       "text-content",
//       "face-age",
//       "gore-2.0",
//       "text",
//       "qr-content",
//       "tobacco",
//       "genai",
//       "violence",
//       "self-harm",
//       "money",
//       "gambling"
//     ];
//     const videoModels = [
//       "nudity-2.1",
//       "weapon",
//       "alcohol",
//       "recreational_drug",
//       "medical",
//       "properties",
//       "type",
//       "quality",
//       "offensive-2.0",
//       "faces",
//       "people-counting",
//       "text-content",
//       "face-age",
//       "gore-2.0",
//       "text",
//       "qr-content",
//       "tobacco",
//       "genai",
//       "violence",
//       "self-harm",
//       "money",
//       "gambling"
//     ];
//     let sigthengineResults = [];
//     let allModels = [];
//     let imageModelResults = [];

//     var explicityRatio = 0.5;
//     var nudityRatio = 0.5;

//     var contentNames = [];

//     if (req.files["contents"]) {
//       for (const content of req.files["contents"]) {
//         const contentName = randomName();
//         const params = {
//           Bucket: bucketName,
//           Key: contentName,
//           Body: content.buffer,
//           ContentType: content.mimetype,
//         };
//         const command = new PutObjectCommand(params);
//         await s3.send(command);

//         if (content.mimetype.startsWith("image")) {
//           const sightengineResponse = await checkImageWithSightengine(
//             content.buffer,
//             imageModels
//           );
//           contentsResponse.push(sightengineResponse);

//           // Handle response structure - can be direct or nested in data
//           const responseData = sightengineResponse.data || sightengineResponse;
//           const frame = responseData.frames?.[0] || responseData;

//           if (responseData && (responseData.frames || responseData.nudity)) {
//             // Check for abusive text in image
//             if (
//               frame.text &&
//               (frame.text.profanity?.length > 0 ||
//                 frame.text.personal?.length > 0 ||
//                 frame.text.extremism?.length > 0 ||
//                 frame.text.violence?.length > 0 ||
//                 frame.text.self_harm?.length > 0)
//             ) {
//               imageModelResults.push("profanity-text");
//             }

//             // Check for QR content
//             if (
//               frame.qr &&
//               (frame.qr.personal?.length > 0 ||
//                 frame.qr.link?.length > 0 ||
//                 frame.qr.social?.length > 0 ||
//                 frame.qr.spam?.length > 0 ||
//                 frame.qr.profanity?.length > 0 ||
//                 frame.qr.blacklist?.length > 0)
//             ) {
//               imageModelResults.push("qr-content");
//             }

//             // Check for nudity (nudity-2.1 model)
//             if (frame.nudity) {
//             const nuditySubModels = [
//               "sexual_activity",
//               "sexual_display",
//               "erotica",
//               "sextoy",
//             ];
//             let hasNudity = false;
//             for (const subModel of nuditySubModels) {
//                 if (frame.nudity[subModel] > nudityRatio) {
//                 hasNudity = true;
//                 break;
//               }
//             }
//             if (hasNudity) {
//               imageModelResults.push("nudity");
//             }

//               // Check for exposed body (chest, most of body visible)
//               if (frame.nudity.suggestive_classes) {
//                 const suggestive = frame.nudity.suggestive_classes;
//                 // Check for bikini (restrict bikini images)
//                 if (suggestive.bikini > 0.5) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for swimwear (male or one-piece)
//                 if (
//                   suggestive.swimwear_male > 0.5 ||
//                   suggestive.swimwear_one_piece > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for male chest with very revealing or revealing
//                 if (
//                   (suggestive.male_chest > 0.5 &&
//                    suggestive.male_chest_categories &&
//                    (suggestive.male_chest_categories.very_revealing > 0.5 ||
//                     suggestive.male_chest_categories.revealing > 0.5)) ||
//                   // Check for visibly undressed
//                   suggestive.visibly_undressed > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for female chest/cleavage
//                 if (
//                   suggestive.cleavage > 0.5 &&
//                   suggestive.cleavage_categories &&
//                   (suggestive.cleavage_categories.very_revealing > 0.5 ||
//                     suggestive.cleavage_categories.revealing > 0.5)
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for underwear visible (male underwear)
//                 if (
//                   suggestive.male_underwear > 0.5 ||
//                   suggestive.lingerie > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // Check for suggestive poses or focus
//                 if (
//                   suggestive.suggestive_pose > 0.5 ||
//                   suggestive.suggestive_focus > 0.5
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//                 // High suggestive overall (most of body visible)
//                 // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
//                 if (
//                   frame.nudity.suggestive > 0.7 ||
//                   frame.nudity.very_suggestive > 0.5 ||
//                   frame.nudity.mildly_suggestive > 0.7
//                 ) {
//                   imageModelResults.push("nudity");
//                 }
//               }
//             }

//             // Check for weapons - handle nested structure
//             if (frame.weapon) {
//               // Check if weapon is a number (old format) or object (new format)
//               if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//                 imageModelResults.push("weapon");
//               } else if (frame.weapon.classes) {
//                 // New nested structure: weapon.classes.firearm, weapon.classes.knife, etc.
//                 const weaponClasses = frame.weapon.classes;
//                 if (
//                   weaponClasses.firearm > explicityRatio ||
//                   weaponClasses.firearm_gesture > explicityRatio ||
//                   weaponClasses.knife > explicityRatio ||
//                   weaponClasses.firearm_toy > explicityRatio
//                 ) {
//                   imageModelResults.push("weapon");
//                 }
//               }
//               // Also check old format fields
//               if (
//                 frame.weapon_firearm > explicityRatio ||
//                 frame.weapon_knife > explicityRatio
//               ) {
//                 imageModelResults.push("weapon");
//               }
//             }

//             // Check for alcohol
//             if (frame.alcohol) {
//               if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//                 imageModelResults.push("alcohol");
//               } else if (frame.alcohol.prob > explicityRatio) {
//                 imageModelResults.push("alcohol");
//               }
//             }

//             // Check for drugs - handle nested structure
//             if (frame.recreational_drug) {
//               if (frame.recreational_drug.prob > explicityRatio) {
//                 imageModelResults.push("drugs");
//               } else if (frame.recreational_drug.classes) {
//                 const drugClasses = frame.recreational_drug.classes;
//                 if (
//                   drugClasses.cannabis > explicityRatio ||
//                   drugClasses.cannabis_drug > explicityRatio ||
//                   drugClasses.cannabis_plant > explicityRatio ||
//                   drugClasses.recreational_drugs_not_cannabis > explicityRatio
//                 ) {
//                   imageModelResults.push("drugs");
//                 }
//               }
//             }
//             // Check medical drugs
//             if (frame.medical) {
//               if (frame.medical.prob > explicityRatio) {
//                 imageModelResults.push("drugs");
//               } else if (frame.medical.classes) {
//                 const medicalClasses = frame.medical.classes;
//                 if (
//                   medicalClasses.pills > explicityRatio ||
//                   medicalClasses.paraphernalia > explicityRatio
//                 ) {
//                   imageModelResults.push("drugs");
//                 }
//               }
//             }
//             // Also check old format fields
//             if (
//               frame.drugs > explicityRatio ||
//               frame.medical_drugs > explicityRatio ||
//               frame.recreational_drugs > explicityRatio
//             ) {
//               imageModelResults.push("drugs");
//             }

//             // Check for gore/blood (gore-2.0 model)
//             if (
//               frame.gore?.prob > explicityRatio ||
//               frame["gore-2.0"]?.prob > explicityRatio
//             ) {
//               imageModelResults.push("gore");
//             }

//             // Check for violence
//             if (frame.violence?.prob > explicityRatio) {
//               imageModelResults.push("violence");
//             }

//             // Check for self-harm
//             if (frame["self-harm"]?.prob > explicityRatio) {
//               imageModelResults.push("self-harm");
//             }

//             // Check for tobacco
//             if (frame.tobacco?.prob > explicityRatio) {
//               imageModelResults.push("tobacco");
//             }

//             // Check for gambling
//             if (frame.gambling?.prob > explicityRatio) {
//               imageModelResults.push("gambling");
//             }

//             // Check for offensive content (offensive-2.0 model) - flags, ISIS, etc.
//             if (frame.offensive || frame["offensive-2.0"]) {
//               const offensive = frame.offensive || frame["offensive-2.0"];
//               const offensiveScore = Math.max(
//                 offensive.prob || 0,
//                 offensive.nazi || 0,
//                 offensive.asian_swastika || 0,
//                 offensive.confederate || 0,
//                 offensive.supremacist || 0,
//                 offensive.terrorist || 0,
//                 offensive.middle_finger || 0,
//                 offensive.flag || 0
//               );
//               // Lower threshold for flags and terrorist symbols
//               if (offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1) {
//               imageModelResults.push("offensive");
//               }
//             }

//             // Check for masked men (faces with masks)
//             if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
//               const hasMaskedFace = frame.faces.some(face => 
//                 face.attributes && (
//                   face.attributes.mask > 0.5 ||
//                   face.attributes.face_mask > 0.5 ||
//                   face.attributes.medical_mask > 0.5
//                 )
//               );
//               if (hasMaskedFace) {
//                 imageModelResults.push("masked-men");
//               }
//             }

//             // Check for money
//             if (frame.money?.prob > explicityRatio) {
//               imageModelResults.push("money");
//             }

//             imageModelResults.forEach((model) => {
//               if (!sigthengineResults.includes(model)) {
//                 sigthengineResults.push(model);
//               }
//             });
//           }
//         } else if (content.mimetype.startsWith("video")) {
//           const sightengineResponse = await checkVideoWithSightengine(
//             content.buffer,
//             videoModels
//           );
//           contentsResponse.push(sightengineResponse);

//           // Handle response structure - can be direct or nested in data
//           const responseData = sightengineResponse.data || sightengineResponse;
//           const frame = responseData.frames?.[0] || responseData;

//           if (responseData && (responseData.frames || responseData.nudity)) {
//             // Check for abusive text in video
//             if (
//               frame.text &&
//               (frame.text.profanity?.length > 0 ||
//                 frame.text.personal?.length > 0 ||
//                 frame.text.extremism?.length > 0 ||
//                 frame.text.violence?.length > 0 ||
//                 frame.text.self_harm?.length > 0)
//             ) {
//               allModels.push("profanity-text");
//             }

//             // Check for QR content
//             if (frame.qr) {
//               const qrContentValues = Object.values(frame.qr);
//               if (
//                 qrContentValues.some(
//                   (value) => Array.isArray(value) && value.length > 0
//                 )
//               ) {
//                 allModels.push("qr-content");
//               }
//             }

//             // Check for nudity (nudity-2.1 model)
//             if (frame.nudity) {
//             const nuditySubModels = [
//               "sexual_activity",
//               "sexual_display",
//               "erotica",
//               "sextoy",
//             ];
//             let hasNudity = false;
//             for (const subModel of nuditySubModels) {
//                 if (frame.nudity[subModel] > nudityRatio) {
//                 hasNudity = true;
//                 break;
//               }
//             }
//             if (hasNudity) {
//               allModels.push("nudity");
//             }

//               // Check for exposed body (chest, most of body visible)
//               if (frame.nudity.suggestive_classes) {
//                 const suggestive = frame.nudity.suggestive_classes;
//                 // Check for bikini (restrict bikini images)
//                 if (suggestive.bikini > 0.5) {
//                   allModels.push("nudity");
//                 }
//                 // Check for swimwear (male or one-piece)
//                 if (
//                   suggestive.swimwear_male > 0.5 ||
//                   suggestive.swimwear_one_piece > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for male chest with very revealing or revealing
//                 if (
//                   (suggestive.male_chest > 0.5 &&
//                    suggestive.male_chest_categories &&
//                    (suggestive.male_chest_categories.very_revealing > 0.5 ||
//                     suggestive.male_chest_categories.revealing > 0.5)) ||
//                   // Check for visibly undressed
//                   suggestive.visibly_undressed > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for female chest/cleavage
//                 if (
//                   suggestive.cleavage > 0.5 &&
//                   suggestive.cleavage_categories &&
//                   (suggestive.cleavage_categories.very_revealing > 0.5 ||
//                     suggestive.cleavage_categories.revealing > 0.5)
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for underwear visible (male underwear)
//                 if (
//                   suggestive.male_underwear > 0.5 ||
//                   suggestive.lingerie > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // Check for suggestive poses or focus
//                 if (
//                   suggestive.suggestive_pose > 0.5 ||
//                   suggestive.suggestive_focus > 0.5
//                 ) {
//                   allModels.push("nudity");
//                 }
//                 // High suggestive overall (most of body visible)
//                 // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
//                 if (
//                   frame.nudity.suggestive > 0.7 ||
//                   frame.nudity.very_suggestive > 0.5 ||
//                   frame.nudity.mildly_suggestive > 0.7
//                 ) {
//                   allModels.push("nudity");
//                 }
//               }
//             }

//             // Check for weapons - handle nested structure
//             if (frame.weapon) {
//               // Check if weapon is a number (old format) or object (new format)
//               if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//                 allModels.push("weapon");
//               } else if (frame.weapon.classes) {
//                 // New nested structure: weapon.classes.firearm, weapon.classes.knife, etc.
//                 const weaponClasses = frame.weapon.classes;
//                 if (
//                   weaponClasses.firearm > explicityRatio ||
//                   weaponClasses.firearm_gesture > explicityRatio ||
//                   weaponClasses.knife > explicityRatio ||
//                   weaponClasses.firearm_toy > explicityRatio
//                 ) {
//                   allModels.push("weapon");
//                 }
//               }
//               // Also check old format fields
//               if (
//                 frame.weapon_firearm > explicityRatio ||
//                 frame.weapon_knife > explicityRatio
//               ) {
//                 allModels.push("weapon");
//               }
//             }

//             // Check for alcohol
//             if (frame.alcohol) {
//               if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//                 allModels.push("alcohol");
//               } else if (frame.alcohol.prob > explicityRatio) {
//                 allModels.push("alcohol");
//               }
//             }

//             // Check for drugs - handle nested structure
//             if (frame.recreational_drug) {
//               if (frame.recreational_drug.prob > explicityRatio) {
//                 allModels.push("drugs");
//               } else if (frame.recreational_drug.classes) {
//                 const drugClasses = frame.recreational_drug.classes;
//                 if (
//                   drugClasses.cannabis > explicityRatio ||
//                   drugClasses.cannabis_drug > explicityRatio ||
//                   drugClasses.cannabis_plant > explicityRatio ||
//                   drugClasses.recreational_drugs_not_cannabis > explicityRatio
//                 ) {
//                   allModels.push("drugs");
//                 }
//               }
//             }
//             // Check medical drugs
//             if (frame.medical) {
//               if (frame.medical.prob > explicityRatio) {
//                 allModels.push("drugs");
//               } else if (frame.medical.classes) {
//                 const medicalClasses = frame.medical.classes;
//                 if (
//                   medicalClasses.pills > explicityRatio ||
//                   medicalClasses.paraphernalia > explicityRatio
//                 ) {
//                   allModels.push("drugs");
//                 }
//               }
//             }
//             // Also check old format fields
//             if (
//               frame.drugs > explicityRatio ||
//               frame.medical_drugs > explicityRatio ||
//               frame.recreational_drugs > explicityRatio
//             ) {
//               allModels.push("drugs");
//             }

//             // Check for gore/blood (gore-2.0 model)
//             if (
//               frame.gore?.prob > explicityRatio ||
//               frame["gore-2.0"]?.prob > explicityRatio
//             ) {
//               allModels.push("gore");
//             }

//             // Check for violence
//             if (frame.violence?.prob > explicityRatio) {
//               allModels.push("violence");
//             }

//             // Check for self-harm
//             if (frame["self-harm"]?.prob > explicityRatio) {
//               allModels.push("self-harm");
//             }

//             // Check for tobacco
//             if (frame.tobacco?.prob > explicityRatio) {
//               allModels.push("tobacco");
//             }

//             // Check for gambling
//             if (frame.gambling?.prob > explicityRatio) {
//               allModels.push("gambling");
//             }

//             // Check for offensive content (offensive-2.0 model) - flags, ISIS, etc.
//             if (frame.offensive || frame["offensive-2.0"]) {
//               const offensive = frame.offensive || frame["offensive-2.0"];
//               const offensiveScore = Math.max(
//                 offensive.prob || 0,
//                 offensive.nazi || 0,
//                 offensive.asian_swastika || 0,
//                 offensive.confederate || 0,
//                 offensive.supremacist || 0,
//                 offensive.terrorist || 0,
//                 offensive.middle_finger || 0,
//                 offensive.flag || 0
//               );
//               // Lower threshold for flags and terrorist symbols
//               if (offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1) {
//               allModels.push("offensive");
//               }
//             }

//             // Check for masked men (faces with masks)
//             if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
//               const hasMaskedFace = frame.faces.some(face => 
//                 face.attributes && (
//                   face.attributes.mask > 0.5 ||
//                   face.attributes.face_mask > 0.5 ||
//                   face.attributes.medical_mask > 0.5
//                 )
//               );
//               if (hasMaskedFace) {
//                 allModels.push("masked-men");
//               }
//             }

//             // Check for money
//             if (frame.money?.prob > explicityRatio) {
//               allModels.push("money");
//           }

//           allModels.forEach((model) => {
//             if (!sigthengineResults.includes(model)) {
//               sigthengineResults.push(model);
//             }
//           });
//           }
//         }

//         contentNames.push(contentName);
//       }
//     }



//     // Check description text for abusive content
//     let descriptionTextResult = null;
//     let hasAbusiveDescription = false;
//     if (description && description.trim() !== "") {
//       try {
//         descriptionTextResult = await checkTextSightengine(description);
        
//         // Handle response structure - can be direct or nested
//         const textResult = descriptionTextResult.data || descriptionTextResult;
        
//         // Check if description contains abusive content
//         // Sightengine returns arrays for each category
//         hasAbusiveDescription = 
//           (textResult.profanity && Array.isArray(textResult.profanity) && textResult.profanity.length > 0) ||
//           (textResult.extremism && Array.isArray(textResult.extremism) && textResult.extremism.length > 0) ||
//           (textResult.violence && Array.isArray(textResult.violence) && textResult.violence.length > 0) ||
//           (textResult.self_harm && Array.isArray(textResult.self_harm) && textResult.self_harm.length > 0) ||
//           (textResult.drug && Array.isArray(textResult.drug) && textResult.drug.length > 0) ||
//           (textResult.weapon && Array.isArray(textResult.weapon) && textResult.weapon.length > 0) ||
//           (textResult.personal && Array.isArray(textResult.personal) && textResult.personal.length > 0) ||
//           (textResult.link && Array.isArray(textResult.link) && textResult.link.length > 0) ||
//           (textResult.spam && Array.isArray(textResult.spam) && textResult.spam.length > 0);
        
//         // Debug logging (can be removed in production)
//         if (hasAbusiveDescription) {
//           console.log("Abusive text detected in description:", textResult);
//           sigthengineResults.push("profanity-text");
//         }
//       } catch (error) {
//         console.error("Error checking description text:", error);
//         // If text moderation fails, we should still check for common profanity patterns as fallback
//         const commonProfanity = /\b(fuck|shit|damn|bitch|asshole|piss|hell|crap)\b/gi;
//         if (commonProfanity.test(description)) {
//           hasAbusiveDescription = true;
//           sigthengineResults.push("profanity-text");
//         }
//       }
//     }

//     const includeTextContent = contentsResponse.some(
//       (response) => {
//         const responseData = response.data || response;
//         const frame = responseData.frames?.[0] || responseData;
//         return frame.text && (
//           frame.text.profanity?.length > 0 ||
//           frame.text.personal?.length > 0 ||
//           frame.text.extremism?.length > 0 ||
//           frame.text.violence?.length > 0 ||
//           frame.text.self_harm?.length > 0
//         );
//       }
//     );

//     const includeQRContent = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return frame.qr && (
//         (frame.qr.personal && frame.qr.personal.length > 0) ||
//         (frame.qr.link && frame.qr.link.length > 0) ||
//         (frame.qr.social && frame.qr.social.length > 0) ||
//         (frame.qr.spam && frame.qr.spam.length > 0) ||
//         (frame.qr.profanity && frame.qr.profanity.length > 0) ||
//         (frame.qr.blacklist && frame.qr.blacklist.length > 0)
//       );
//     });

//     const includeNudity = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return frame.nudity && (
//         frame.nudity.sexual_activity > nudityRatio ||
//         frame.nudity.sexual_display > nudityRatio ||
//         frame.nudity.erotica > nudityRatio ||
//         frame.nudity.sextoy > nudityRatio
//       );
//     });

//     const includeWad = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
      
//       // Check weapons
//       let hasWeapon = false;
//       if (frame.weapon) {
//         if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//           hasWeapon = true;
//         } else if (frame.weapon.classes) {
//           const weaponClasses = frame.weapon.classes;
//           hasWeapon = (
//             weaponClasses.firearm > explicityRatio ||
//             weaponClasses.firearm_gesture > explicityRatio ||
//             weaponClasses.knife > explicityRatio
//           );
//         }
//       }
//       if (!hasWeapon && (
//         frame.weapon_firearm > explicityRatio ||
//         frame.weapon_knife > explicityRatio
//       )) {
//         hasWeapon = true;
//       }

//       // Check alcohol
//       let hasAlcohol = false;
//       if (frame.alcohol) {
//         if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//           hasAlcohol = true;
//         } else if (frame.alcohol.prob > explicityRatio) {
//           hasAlcohol = true;
//         }
//       }

//       // Check for drugs
//       let hasDrugs = false;
//       if (frame.recreational_drug) {
//         if (frame.recreational_drug.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.recreational_drug.classes) {
//           const drugClasses = frame.recreational_drug.classes;
//           hasDrugs = (
//             drugClasses.cannabis > explicityRatio ||
//             drugClasses.cannabis_drug > explicityRatio ||
//             drugClasses.cannabis_plant > explicityRatio ||
//             drugClasses.recreational_drugs_not_cannabis > explicityRatio
//           );
//         }
//       }
      
//       if (!hasDrugs && frame.medical) {
//         if (frame.medical.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.medical.classes) {
//           const medicalClasses = frame.medical.classes;
//           hasDrugs = (
//             medicalClasses.pills > explicityRatio ||
//             medicalClasses.paraphernalia > explicityRatio
//           );
//         }
//       }
//       if (!hasDrugs && (
//         frame.drugs > explicityRatio ||
//         frame.medical_drugs > explicityRatio ||
//         frame.recreational_drugs > explicityRatio
//       )) {
//         hasDrugs = true;
//       }

//       return hasWeapon || hasAlcohol || hasDrugs;
//     });

//     const includeGore = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return (frame.gore?.prob > explicityRatio) || 
//              (frame["gore-2.0"]?.prob > explicityRatio);
//     });

//     const includeGambling = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       return frame.gambling?.prob > explicityRatio;
//     });

//     const includeOffensive = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
//       const offensive = frame.offensive || frame["offensive-2.0"];
//       if (!offensive) return false;
//       const offensiveScore = Math.max(
//         offensive.prob || 0,
//         offensive.nazi || 0,
//         offensive.asian_swastika || 0,
//         offensive.confederate || 0,
//         offensive.supremacist || 0,
//         offensive.terrorist || 0,
//         offensive.middle_finger || 0,
//         offensive.flag || 0
//       );
//       // Lower threshold for flags and terrorist symbols (ISIS flag, etc.)
//       return offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1;
//     });

//     if (includeTextContent) {
//       sigthengineResults.push("profinity-text");
//     }
//     if (includeQRContent) {
//       sigthengineResults.push("qr-content");
//     }
//     // if (includeScamContent) {
//     //   sigthengineResults.push("scam");
//     // }
//     // if (includeMinor) {
//     //   sigthengineResults.push("minor");
//     // }
//     if (includeNudity) {
//       sigthengineResults.push("nudity-2.0");
//     }
//     if (includeWad) {
//       sigthengineResults.push("wad");
//     }
//     if (includeGore) {
//       sigthengineResults.push("horror");
//     }
//     // if (includeTobacco) {
//     //   sigthengineResults.push("tobacco");
//     // }
//     if (includeGambling) {
//       sigthengineResults.push("gambling");
//     }
//     if (includeOffensive) {
//       sigthengineResults.push("offensive");
//     }

//     // Check for explicit content that should block post creation
//     // These categories should prevent post creation: pornography/explicit sexual acts, blood/gore/violence, weapons, drugs & paraphernalia, harmful content
//     const hasExplicitBlockingContent = contentsResponse.some((response) => {
//       // Handle response structure - can be direct or nested in data
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;

//       if (!frame) return false;

//       // Check for pornography & explicit sexual acts (explicit nudity)
//       const hasExplicitNudity = frame.nudity && (
//         frame.nudity.sexual_activity > nudityRatio ||
//         frame.nudity.sexual_display > nudityRatio ||
//         frame.nudity.erotica > nudityRatio ||
//         frame.nudity.sextoy > nudityRatio
//       );

//       // Check for blood/gore/violence
//       const hasGoreViolence = 
//         (frame.gore?.prob > explicityRatio || frame["gore-2.0"]?.prob > explicityRatio) ||
//         (frame.violence?.prob > explicityRatio);

//       // Check for weapons (arms)
//       let hasWeapons = false;
//       if (frame.weapon) {
//         if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
//           hasWeapons = true;
//         } else if (frame.weapon.classes) {
//           const weaponClasses = frame.weapon.classes;
//           hasWeapons = (
//             weaponClasses.firearm > explicityRatio ||
//             weaponClasses.firearm_gesture > explicityRatio ||
//             weaponClasses.knife > explicityRatio ||
//             weaponClasses.firearm_toy > explicityRatio
//           );
//         }
//       }
//       // Also check old format
//       if (!hasWeapons && (
//         frame.weapon_firearm > explicityRatio ||
//         frame.weapon_knife > explicityRatio
//       )) {
//         hasWeapons = true;
//       }

//       // Check for drugs & paraphernalia
//       let hasDrugs = false;
//       if (frame.recreational_drug) {
//         if (frame.recreational_drug.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.recreational_drug.classes) {
//           const drugClasses = frame.recreational_drug.classes;
//           hasDrugs = (
//             drugClasses.cannabis > explicityRatio ||
//             drugClasses.cannabis_drug > explicityRatio ||
//             drugClasses.cannabis_plant > explicityRatio ||
//             drugClasses.recreational_drugs_not_cannabis > explicityRatio
//           );
//         }
//       }
//       // Check medical drugs
//       if (!hasDrugs && frame.medical) {
//         if (frame.medical.prob > explicityRatio) {
//           hasDrugs = true;
//         } else if (frame.medical.classes) {
//           const medicalClasses = frame.medical.classes;
//           hasDrugs = (
//             medicalClasses.pills > explicityRatio ||
//             medicalClasses.paraphernalia > explicityRatio
//           );
//         }
//       }
//       // Also check old format
//       if (!hasDrugs && (
//         frame.drugs > explicityRatio ||
//         frame.medical_drugs > explicityRatio ||
//         frame.recreational_drugs > explicityRatio
//       )) {
//         hasDrugs = true;
//       }

//       // Check for harmful content (self-harm, offensive - flags/ISIS, etc.)
//       const hasSelfHarm = frame["self-harm"]?.prob > explicityRatio;
//       let hasOffensive = false;
//       if (frame.offensive || frame["offensive-2.0"]) {
//         const offensive = frame.offensive || frame["offensive-2.0"];
//         const offensiveScore = Math.max(
//           offensive.prob || 0,
//           offensive.nazi || 0,
//           offensive.asian_swastika || 0,
//           offensive.confederate || 0,
//           offensive.supremacist || 0,
//           offensive.terrorist || 0,
//           offensive.middle_finger || 0,
//           offensive.flag || 0
//         );
//         // Lower threshold for flags and terrorist symbols (ISIS flag, etc.)
//         hasOffensive = offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1;
//       }

//       return hasExplicitNudity || hasGoreViolence || hasWeapons || hasDrugs || hasSelfHarm || hasOffensive;
//     });
    
//     // Block post creation if explicit blocking content is found
//     if (hasExplicitBlockingContent) {      
//       // await sendNotification(
//       //   userid,
//       //   "Post Creation Failed",
//       //   "Your post contains explicit content and cannot be created"
//       // );
//       return res.status(400).json({
//         error: "Your post contains explicit content. Posts with nudity, violence, weapons, drugs or harmful content are not allowed",
//         sigthengineResults: sigthengineResults,
//       });
//     }

//     // Compute restrictedContent and abusiveText flags based on actual Sightengine response
//     const hasRestrictedContent = contentsResponse.some((response) => {
//       // Handle response structure - can be direct or nested in data
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;

//       if (!frame) return false;

//       // Check for none sexual body part, bikinis, men bare chest, legs, mini skirts & shorts (restricted nudity)
//       const hasExposedBody = frame.nudity && frame.nudity.suggestive_classes && (
//         // Bikini (restrict bikini images)
//         frame.nudity.suggestive_classes.bikini > 0.5 ||
//         // Swimwear (male or one-piece)
//         frame.nudity.suggestive_classes.swimwear_male > 0.5 ||
//         frame.nudity.suggestive_classes.swimwear_one_piece > 0.5 ||
//         // Male chest with very revealing or revealing
//         (frame.nudity.suggestive_classes.male_chest > 0.5 && 
//          frame.nudity.suggestive_classes.male_chest_categories &&
//          (frame.nudity.suggestive_classes.male_chest_categories.very_revealing > 0.5 ||
//           frame.nudity.suggestive_classes.male_chest_categories.revealing > 0.5)) ||
//         // Female chest/cleavage with very revealing or revealing
//         (frame.nudity.suggestive_classes.cleavage > 0.5 &&
//          frame.nudity.suggestive_classes.cleavage_categories &&
//          (frame.nudity.suggestive_classes.cleavage_categories.very_revealing > 0.5 ||
//           frame.nudity.suggestive_classes.cleavage_categories.revealing > 0.5)) ||
//         // Underwear visible (male underwear)
//         frame.nudity.suggestive_classes.male_underwear > 0.5 ||
//         frame.nudity.suggestive_classes.lingerie > 0.5 ||
//         // Visibly undressed
//         frame.nudity.suggestive_classes.visibly_undressed > 0.5 ||
//         // Suggestive poses or focus
//         frame.nudity.suggestive_classes.suggestive_pose > 0.5 ||
//         frame.nudity.suggestive_classes.suggestive_focus > 0.5 ||
//         // High suggestive probability overall (most of body visible)
//         // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
//         frame.nudity.suggestive > 0.7 ||
//         frame.nudity.very_suggestive > 0.5 ||
//         frame.nudity.mildly_suggestive > 0.7
//       );

//       // Check for alcohol
//       let hasAlcohol = false;
//       if (frame.alcohol) {
//         if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
//           hasAlcohol = true;
//         } else if (frame.alcohol.prob > explicityRatio) {
//           hasAlcohol = true;
//         }
//       }

//       // Check for tobacco
//       const hasTobacco = frame.tobacco && frame.tobacco.prob > explicityRatio;

//       // Check for gambling
//       const hasGambling = frame.gambling && frame.gambling.prob > explicityRatio;

//       // Check for masked men
//       // let hasMaskedMen = false;
//       // if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
//       //   hasMaskedMen = frame.faces.some(face => 
//       //     face.attributes && (
//       //       face.attributes.mask > 0.5 ||
//       //       face.attributes.face_mask > 0.5 ||
//       //       face.attributes.medical_mask > 0.5
//       //     )
//       //   );
//       // }

//       // Check for money
//       // const hasMoney = frame.money && frame.money.prob > explicityRatio;
      
//       return hasExposedBody || hasAlcohol || hasTobacco || hasGambling 
//       // || hasMaskedMen
//       //  || hasMoney;
//     });

//     // Check for abusive text in images/videos and description
//     const hasAbusiveTextInMedia = contentsResponse.some((response) => {
//       const responseData = response.data || response;
//       const frame = responseData.frames?.[0] || responseData;
      
//       if (!frame) return false;

//       // Check for profanity in text within images/videos
//       const hasTextProfanity = frame.text && (
//         (frame.text.profanity && frame.text.profanity.length > 0) ||
//         (frame.text.extremism && frame.text.extremism.length > 0) ||
//         (frame.text.violence && frame.text.violence.length > 0) ||
//         (frame.text.self_harm && frame.text.self_harm.length > 0)
//       );

//       // Check for profanity in QR codes
//       const hasQRProfanity = frame.qr && 
//         frame.qr.profanity && 
//         frame.qr.profanity.length > 0;

//       return hasTextProfanity || hasQRProfanity;
//     });

//     // Combine media text abuse check with description text abuse check
//     const hasAbusiveText = hasAbusiveTextInMedia || hasAbusiveDescription;




//     if (req.files["contents"]) {
//       if (!post) {
//         post = await Post.create({
//           userid,
//           description,
//           postType,
//           commentsAllowed,
//           location
//         });

//         if (postType == "paid") {
//           await post.updateOne({
//             price,
//           });
//         } else if (postType == "public") {
//           await post.updateOne({
//             price: 0,
//           });
//         }
//       }

//       await Post.findByIdAndUpdate(post._id, {
//         $push: { contents: contentNames },
//       });

//       if(hasRestrictedContent){
//         await post.updateOne({ 
//           sigthengineResults,
//           restrictedContent: hasRestrictedContent,
//           // abusiveText: hasAbusiveText
//         });
//       }
//     }
//     if (!post && description) {
//       post = await Post.create({
//         userid,
//         description,
//         postType,
//         commentsAllowed,
//         textPost: true,
//         location
//       });

//       if (postType == "paid") {
//         await post.updateOne({
//           price,
//         });
//       } else if (postType == "public") {
//         await post.updateOne({
//           price: 0,
//         });
//       }
//     }

//     if (!post) {
//       // await sendNotification(
//       //   userid,
//       //   "Error creating post",
//       //   `Please provide content`
//       // );
//       // throw Error("Please provide content");
//       res.status(400).json({
//         error: "Please provide content"
//       });
//     }
//     // else {
//     //   // var sockets = global.onlineSockets.get(userid);
//     //   // if (sockets) {
//     //   //   for (const socket of sockets) {
//     //   //     if (socket) {
//     //   //       socket.emit("errorCreatingPost", {
//     //   //         error: "Please provide content"
//     //   //       });
//     //   //     }
//     //   //   }
//     //   // }
//     //   await sendNotification(
//     //     userid,
//     //     "Error creating post",
//     //     `Please provide content`
//     //   );
//     //   throw Error("Please provide content");
//     // }

//     if (req.files["thumbnails"]) {
//       for (const thumbnail of req.files["thumbnails"]) {
//         const thumbnailName = randomName();
//         const params = {
//           Bucket: bucketName,
//           Key: thumbnailName,
//           Body: thumbnail.buffer,
//           ContentType: thumbnail.mimetype,
//         };
//         const command = new PutObjectCommand(params);
//         await s3.send(command);
//         console.log("post: ", post);
//         await Post.findByIdAndUpdate(post._id, {
//           $push: { thumbnails: thumbnailName },
//         });
//       }
//     }

//     await user.updateOne({ $push: { posts: post._id } });

//     // var sockets = global.onlineSockets.get(userid);
//     // if (sockets) {
//     //   for (const socket of sockets) {
//     //     if (socket) {
//     //       socket.emit("createdPost", {
//     //         description: truncateString(description, 30),
//     //         postid: post._id,
//     //         userid
//     //       });
//     //     }
//     //   }
//     // }
//     // await sendNotification(
//     //   userid,
//     //   "Post created",
//     //   truncateString(description, 30),
//     //   "post",
//     //   post._id
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
//         tags.map(tag => {
//           taggedUsers.push("")
//         })
        
//         // Print the extracted tags
//         await Promise.all(
//           tags.map(async (tag, i) => {
//             var taggedUser = await User.findOne({tag})
//             if(taggedUser){
//               taggedUsers[i] = taggedUser._id;
//             }
//           })
//         )

//         taggedUsers = taggedUsers.filter(tag => tag !== "");
//       }
//     }

//     await post.updateOne({
//       taggedUsers
//     })

//     console.log("tags: ", tags);
//     console.log("tagged users: ", taggedUsers)
//     await Promise.all(
//       user.followers.map(async (followerid) => {
//         if (followerid != userid) {
//           var follower = await User.findById(followerid);

//           var notificationTitle = `New ${postType == "paid" ? "paid ": ""}Post`;
//           var notificationBody = `has posted a New ${postType == "paid" ? "paid ": ""}Post`;
//           if(follower){
//             if (tags.includes(follower.tag)) {
//               notificationTitle = "Tagged in post";
//               notificationBody = `has tagged you in a post`;
//               tags = tags.filter(tag => tag !== follower.tag);
//             }
//           }
//           await sendNotification(
//             followerid,
//             notificationTitle,
//             `${user.firstname + " " + user.lastname} ${notificationBody}`,
//             "post",
//             post._id,
//             userid
//           );
//           await createActivity(
//             followerid,
//             user._id,
//             notificationBody,
//             undefined,
//             post._id,
//             null,
//             null,
//             null,
//             null,
//             null,
//             postType == "paid" ? "paidPost" : "freePost"
//           );
//         }
//       })
//     );

//     await Promise.all(
//       tags.map(async (tag) => {
//           var tagUser = await User.findOne({tag});

//           if(user){
//             var notificationTitle = "Tagged in post";
//             var notificationBody = `has tagged you in a post`;
//             await sendNotification(
//               tagUser._id,
//               notificationTitle,
//               `${user.firstname + " " + user.lastname} ${notificationBody}`,
//               "post",
//               post._id,
//               userid
//             );
//             await createActivity(
//               tagUser._id,
//               user._id,
//               "tagged you in a post",
//               undefined,
//               post._id,
//               null,
//               null,
//               null,
//               null,
//               null,
//               postType == "paid" ? "paidPost" : "freePost"
//             );
//           }
//       })
//     );

//     res.status(201).json({
//       message: "Post Posted",
//       contentsResponse,
//       sigthengineResults,
//     });
//   } catch (error) {
//     // var sockets = global.onlineSockets.get(userid);
//     //   if (sockets) {
//     //     for (const socket of sockets) {
//     //       if (socket) {
//     //         socket.emit("errorCreatingPost", {
//     //           error: error.message
//     //         });
//     //       }
//     //     }
//     //   }
//     // await sendNotification(userid, "Error creating post", error.message);
//     res.status(500).json({ error: error.message });
//     console.log("error: ", error);
//   }
// };

const createPost = async (req, res) => {
  let { userid, description, postType, price, commentsAllowed, location } = req.body;
  try {
    price = parseInt(price, 10);

    if(!commentsAllowed){
      commentsAllowed = true;
    }
    var post;

    const user = await User.findById(userid);

    if (!user) {
      // await sendNotification(userid, "Error creating post", "User not found");
      // throw Error("User Not Found");
      return req.status(400).json({ error: "User Not Found" });
    }

    const contentsResponse = [];
    const imageModels = [
      "nudity-2.1",
      "weapon",
      "alcohol",
      "recreational_drug",
      "medical",
      "properties",
      "type",
      "quality",
      "offensive-2.0",
      "faces",
      "people-counting",
      "text-content",
      "face-age",
      "gore-2.0",
      "text",
      "qr-content",
      "tobacco",
      "genai",
      "violence",
      "self-harm",
      "money",
      "gambling"
    ];
    const videoModels = [
      "nudity-2.1",
      "weapon",
      "alcohol",
      "recreational_drug",
      "medical",
      "properties",
      "type",
      "quality",
      "offensive-2.0",
      "faces",
      "people-counting",
      "text-content",
      "face-age",
      "gore-2.0",
      "text",
      "qr-content",
      "tobacco",
      "genai",
      "violence",
      "self-harm",
      "money",
      "gambling"
    ];
    let sigthengineResults = [];
    let allModels = [];
    let imageModelResults = [];

    var explicityRatio = 0.5;
    var nudityRatio = 0.5;

    var contentNames = [];

    if (req.files["contents"]) {
      for (const content of req.files["contents"]) {
        const contentName = randomName();
        const params = {
          Bucket: bucketName,
          Key: contentName,
          Body: content.buffer,
          ContentType: content.mimetype,
        };
        const command = new PutObjectCommand(params);
        await s3.send(command);

        if (content.mimetype.startsWith("image")) {
          const sightengineResponse = await checkImageWithSightengine(
            content.buffer,
            imageModels
          );
          contentsResponse.push(sightengineResponse);

          // Handle response structure - can be direct or nested in data
          const responseData = sightengineResponse.data || sightengineResponse;
          const frame = responseData.frames?.[0] || responseData;

          if (responseData && (responseData.frames || responseData.nudity)) {
            // Check for abusive text in image
            if (
              frame.text &&
              (frame.text.profanity?.length > 0 ||
                frame.text.extremism?.length > 0 ||
                frame.text.violence?.length > 0 ||
                frame.text.self_harm?.length > 0 ||
                (frame.text.drug?.length > 0))
            ) {
              imageModelResults.push("profanity-text");
            }

            // Check for QR content
            if (
              frame.qr &&
              (frame.qr.personal?.length > 0 ||
                frame.qr.link?.length > 0 ||
                frame.qr.social?.length > 0 ||
                frame.qr.spam?.length > 0 ||
                frame.qr.profanity?.length > 0 ||
                frame.qr.blacklist?.length > 0)
            ) {
              imageModelResults.push("qr-content");
            }

            // Check for nudity (nudity-2.1 model)
            if (frame.nudity) {
            const nuditySubModels = [
              "sexual_activity",
              "sexual_display",
              "erotica",
              "sextoy",
            ];
            let hasNudity = false;
            for (const subModel of nuditySubModels) {
                if (frame.nudity[subModel] > nudityRatio) {
                hasNudity = true;
                break;
              }
            }
            if (hasNudity) {
              imageModelResults.push("nudity");
            }

              // Check for exposed body (chest, most of body visible)
              if (frame.nudity.suggestive_classes) {
                const suggestive = frame.nudity.suggestive_classes;
                // Check for bikini (restrict bikini images)
                if (suggestive.bikini > 0.5) {
                  // imageModelResults.push("nudity"); removed
                }
                // Check for swimwear (male or one-piece)
                if (
                  suggestive.swimwear_male > 0.5 ||
                  suggestive.swimwear_one_piece > 0.5
                ) {
                  // imageModelResults.push("nudity"); removed
                }
                // Check for male chest with very revealing or revealing
                if (
                  (suggestive.male_chest > 0.5 &&
                   suggestive.male_chest_categories &&
                   (suggestive.male_chest_categories.very_revealing > 0.5 ||
                    suggestive.male_chest_categories.revealing > 0.5)) ||
                  // Check for visibly undressed
                  suggestive.visibly_undressed > 0.5
                ) {
                  // imageModelResults.push("nudity"); removed
                }
                // Check for female chest/cleavage
                if (
                  suggestive.cleavage > 0.5 &&
                  suggestive.cleavage_categories &&
                  (suggestive.cleavage_categories.very_revealing > 0.5 ||
                    suggestive.cleavage_categories.revealing > 0.5)
                ) {
                  // imageModelResults.push("nudity"); removed
                }
                // Check for underwear visible (male underwear)
                if (
                  suggestive.male_underwear > 0.5 ||
                  suggestive.lingerie > 0.5
                ) {
                  // imageModelResults.push("nudity"); removed
                }
                // Check for suggestive poses or focus
                if (
                  suggestive.suggestive_pose > 0.5 ||
                  suggestive.suggestive_focus > 0.5
                ) {
                  // imageModelResults.push("nudity"); removed
                }
                // High suggestive overall (most of body visible)
                // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
                if (
                  frame.nudity.suggestive > 0.7 ||
                  frame.nudity.very_suggestive > 0.5 ||
                  frame.nudity.mildly_suggestive > 0.7
                ) {
                  // imageModelResults.push("nudity"); removed
                }
              }
            }

            // Check for weapons - handle nested structure
            if (frame.weapon) {
              // Check if weapon is a number (old format) or object (new format)
              if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
                imageModelResults.push("weapon");
              } else if (frame.weapon.classes) {
                // New nested structure: weapon.classes.firearm, weapon.classes.knife, etc.
                const weaponClasses = frame.weapon.classes;
                if (
                  weaponClasses.firearm > explicityRatio ||
                  weaponClasses.firearm_gesture > explicityRatio ||
                  weaponClasses.knife > explicityRatio ||
                  weaponClasses.firearm_toy > explicityRatio
                ) {
                  imageModelResults.push("weapon");
                }
              }
              // Also check old format fields
              if (
                frame.weapon_firearm > explicityRatio ||
                frame.weapon_knife > explicityRatio
              ) {
                imageModelResults.push("weapon");
              }
            }

            // Check for alcohol
            if (frame.alcohol) {
              if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
                imageModelResults.push("alcohol");
              } else if (frame.alcohol.prob > explicityRatio) {
                imageModelResults.push("alcohol");
              }
            }

            // Check for drugs - handle nested structure
            if (frame.recreational_drug) {
              if (frame.recreational_drug.prob > explicityRatio) {
                imageModelResults.push("drugs");
              } else if (frame.recreational_drug.classes) {
                const drugClasses = frame.recreational_drug.classes;
                if (
                  drugClasses.cannabis > explicityRatio ||
                  drugClasses.cannabis_drug > explicityRatio ||
                  drugClasses.cannabis_plant > explicityRatio ||
                  drugClasses.recreational_drugs_not_cannabis > explicityRatio
                ) {
                  imageModelResults.push("drugs");
                }
              }
            }
            // Check medical drugs
            if (frame.medical) {
              if (frame.medical.prob > explicityRatio) {
                imageModelResults.push("drugs");
              } else if (frame.medical.classes) {
                const medicalClasses = frame.medical.classes;
                if (
                  medicalClasses.pills > explicityRatio ||
                  medicalClasses.paraphernalia > explicityRatio
                ) {
                  imageModelResults.push("drugs");
                }
              }
            }
            // Also check old format fields
            if (
              frame.drugs > explicityRatio ||
              frame.medical_drugs > explicityRatio ||
              frame.recreational_drugs > explicityRatio
            ) {
              imageModelResults.push("drugs");
            }

            // Check for gore/blood (gore-2.0 model)
            if (
              frame.gore?.prob > explicityRatio ||
              frame["gore-2.0"]?.prob > explicityRatio
            ) {
              imageModelResults.push("gore");
            }

            // Check for violence
            if (frame.violence?.prob > explicityRatio) {
              imageModelResults.push("violence");
            }

            // Check for self-harm
            if (frame["self-harm"]?.prob > explicityRatio) {
              imageModelResults.push("self-harm");
            }

            // Check for tobacco
            if (frame.tobacco?.prob > explicityRatio) {
              imageModelResults.push("tobacco");
            }

            // Check for gambling
            if (frame.gambling?.prob > explicityRatio) {
              imageModelResults.push("gambling");
            }

            // Check for offensive content (offensive-2.0 model) - flags, ISIS, etc.
            if (frame.offensive || frame["offensive-2.0"]) {
              const offensive = frame.offensive || frame["offensive-2.0"];
              const offensiveScore = Math.max(
                offensive.prob || 0,
                offensive.nazi || 0,
                offensive.asian_swastika || 0,
                offensive.confederate || 0,
                offensive.supremacist || 0,
                offensive.terrorist || 0,
                offensive.middle_finger || 0,
                offensive.flag || 0
              );
              // Lower threshold for flags and terrorist symbols
              if (offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1) {
              imageModelResults.push("offensive");
              }
            }

            // Check for masked men (faces with masks)
            if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
              const hasMaskedFace = frame.faces.some(face => 
                face.attributes && (
                  face.attributes.mask > 0.5 ||
                  face.attributes.face_mask > 0.5 ||
                  face.attributes.medical_mask > 0.5
                )
              );
              if (hasMaskedFace) {
                imageModelResults.push("masked-men");
              }
            }

            // Check for money
            if (frame.money?.prob > explicityRatio) {
              imageModelResults.push("money");
            }

            imageModelResults.forEach((model) => {
              if (!sigthengineResults.includes(model)) {
                sigthengineResults.push(model);
              }
            });
          }
        } else if (content.mimetype.startsWith("video")) {
          let sightengineResponse;
          const buffer = content.buffer;
          const fileSizeMB = buffer.length / (1024 * 1024);
          let durationSeconds = 0;

          try {
            durationSeconds = await fileOps.getVideoDuration(content);
            console.log(`Video stats: ${fileSizeMB.toFixed(2)} MB, ${durationSeconds.toFixed(1)} seconds`);
          } catch (e) {
            console.error("Cannot read video duration:", e);
            // fallback: treat as short → sync will likely fail if actually long
          }

          const shouldUseAsync = (durationSeconds > 59 || fileSizeMB > 50);

          if (!shouldUseAsync) {
            // Original synchronous flow for short/small videos
            sightengineResponse = await checkVideoWithSightengine(buffer, videoModels);
          } else {
            // ───────────────────────────────────────────────────────
            // ASYNCHRONOUS FLOW (long duration OR large file)
            // ───────────────────────────────────────────────────────
            let mediaId;

            if (fileSizeMB > 50) {
              // Large file → first upload to Sightengine, then submit for moderation
              mediaId = await uploadVideoToSightengine(buffer);  // your existing upload helper returns media.id

              // NOW submit the stored media.id for moderation (critical missing step!)
              const form = new FormData();
              form.append("media_id", mediaId);           // ← use media id here (not buffer)
              form.append("models", videoModels.join(","));
              form.append("api_user", process.env.SIGHTENGINE_API_USER);
              form.append("api_secret", process.env.SIGHTENGINE_API_SECRET);
              // Optional: form.append("callback_url", "https://your-server/webhook"); // better than polling if possible

              const submitRes = await axios.post(
                "https://api.sightengine.com/1.0/video/check.json",
                form,
                { headers: form.getHeaders(), maxContentLength: Infinity }
              );

              if (submitRes.data.status !== "success" || !submitRes.data.media?.id) {
                throw new Error(`Async video moderation submit failed: ${JSON.stringify(submitRes.data)}`);
              }

              // mediaId remains the same
              mediaId = submitRes.data.media.id;
            } else {
              // Long but ≤50MB → direct async submission (no separate upload needed)
              const form = new FormData();
              form.append("media", buffer, { filename: "video.mp4" });
              form.append("models", videoModels.join(","));
              form.append("api_user", process.env.SIGHTENGINE_API_USER);
              form.append("api_secret", process.env.SIGHTENGINE_API_SECRET);
              // Optional callback_url here too

              const submitRes = await axios.post(
                "https://api.sightengine.com/1.0/video/check.json",
                form,
                { headers: form.getHeaders() }
              );

              if (submitRes.data.status !== "success" || !submitRes.data.media?.id) {
                throw new Error("Async video submit failed");
              }

              mediaId = submitRes.data.media.id;
            }

            // Poll for results (same for both paths)
            const pollResult = await pollVideoJob(mediaId);

            sightengineResponse = pollResult; // should have .data with moderation results (frames, etc.)
          }

          contentsResponse.push(sightengineResponse);

          // Handle response structure - can be direct or nested in data
          const responseData = sightengineResponse.data || sightengineResponse;
          const frame = responseData.frames?.[0] || responseData;

          if (responseData && (responseData.frames || responseData.nudity)) {
            // Check for abusive text in video
            if (
              frame.text &&
              (frame.text.profanity?.length > 0 ||
                frame.text.extremism?.length > 0 ||
                frame.text.violence?.length > 0 ||
                frame.text.self_harm?.length > 0 ||
                (frame.text.drug?.length > 0))
            ) {
              allModels.push("profanity-text");
            }

            // Check for QR content
            if (frame.qr) {
              const qrContentValues = Object.values(frame.qr);
              if (
                qrContentValues.some(
                  (value) => Array.isArray(value) && value.length > 0
                )
              ) {
                allModels.push("qr-content");
              }
            }

            // Check for nudity (nudity-2.1 model)
            if (frame.nudity) {
            const nuditySubModels = [
              "sexual_activity",
              "sexual_display",
              "erotica",
              "sextoy",
            ];
            let hasNudity = false;
            for (const subModel of nuditySubModels) {
                if (frame.nudity[subModel] > nudityRatio) {
                hasNudity = true;
                break;
              }
            }
            if (hasNudity) {
              allModels.push("nudity");
            }

              // Check for exposed body (chest, most of body visible)
              if (frame.nudity.suggestive_classes) {
                const suggestive = frame.nudity.suggestive_classes;
                // Check for bikini (restrict bikini images)
                if (suggestive.bikini > 0.5) {
                  // allModels.push("nudity"); removed
                }
                // Check for swimwear (male or one-piece)
                if (
                  suggestive.swimwear_male > 0.5 ||
                  suggestive.swimwear_one_piece > 0.5
                ) {
                  // allModels.push("nudity"); removed
                }
                // Check for male chest with very revealing or revealing
                if (
                  (suggestive.male_chest > 0.5 &&
                   suggestive.male_chest_categories &&
                   (suggestive.male_chest_categories.very_revealing > 0.5 ||
                    suggestive.male_chest_categories.revealing > 0.5)) ||
                  // Check for visibly undressed
                  suggestive.visibly_undressed > 0.5
                ) {
                  // allModels.push("nudity"); removed
                }
                // Check for female chest/cleavage
                if (
                  suggestive.cleavage > 0.5 &&
                  suggestive.cleavage_categories &&
                  (suggestive.cleavage_categories.very_revealing > 0.5 ||
                    suggestive.cleavage_categories.revealing > 0.5)
                ) {
                  // allModels.push("nudity"); removed
                }
                // Check for underwear visible (male underwear)
                if (
                  suggestive.male_underwear > 0.5 ||
                  suggestive.lingerie > 0.5
                ) {
                  // allModels.push("nudity"); removed
                }
                // Check for suggestive poses or focus
                if (
                  suggestive.suggestive_pose > 0.5 ||
                  suggestive.suggestive_focus > 0.5
                ) {
                  // allModels.push("nudity"); removed
                }
                // High suggestive overall (most of body visible)
                // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
                if (
                  frame.nudity.suggestive > 0.7 ||
                  frame.nudity.very_suggestive > 0.5 ||
                  frame.nudity.mildly_suggestive > 0.7
                ) {
                  // allModels.push("nudity"); removed
                }
              }
            }

            // Check for weapons - handle nested structure
            if (frame.weapon) {
              // Check if weapon is a number (old format) or object (new format)
              if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
                allModels.push("weapon");
              } else if (frame.weapon.classes) {
                // New nested structure: weapon.classes.firearm, weapon.classes.knife, etc.
                const weaponClasses = frame.weapon.classes;
                if (
                  weaponClasses.firearm > explicityRatio ||
                  weaponClasses.firearm_gesture > explicityRatio ||
                  weaponClasses.knife > explicityRatio ||
                  weaponClasses.firearm_toy > explicityRatio
                ) {
                  allModels.push("weapon");
                }
              }
              // Also check old format fields
              if (
                frame.weapon_firearm > explicityRatio ||
                frame.weapon_knife > explicityRatio
              ) {
                allModels.push("weapon");
              }
            }

            // Check for alcohol
            if (frame.alcohol) {
              if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
                allModels.push("alcohol");
              } else if (frame.alcohol.prob > explicityRatio) {
                allModels.push("alcohol");
              }
            }

            // Check for drugs - handle nested structure
            if (frame.recreational_drug) {
              if (frame.recreational_drug.prob > explicityRatio) {
                allModels.push("drugs");
              } else if (frame.recreational_drug.classes) {
                const drugClasses = frame.recreational_drug.classes;
                if (
                  drugClasses.cannabis > explicityRatio ||
                  drugClasses.cannabis_drug > explicityRatio ||
                  drugClasses.cannabis_plant > explicityRatio ||
                  drugClasses.recreational_drugs_not_cannabis > explicityRatio
                ) {
                  allModels.push("drugs");
                }
              }
            }
            // Check medical drugs
            if (frame.medical) {
              if (frame.medical.prob > explicityRatio) {
                allModels.push("drugs");
              } else if (frame.medical.classes) {
                const medicalClasses = frame.medical.classes;
                if (
                  medicalClasses.pills > explicityRatio ||
                  medicalClasses.paraphernalia > explicityRatio
                ) {
                  allModels.push("drugs");
                }
              }
            }
            // Also check old format fields
            if (
              frame.drugs > explicityRatio ||
              frame.medical_drugs > explicityRatio ||
              frame.recreational_drugs > explicityRatio
            ) {
              allModels.push("drugs");
            }

            // Check for gore/blood (gore-2.0 model)
            if (
              frame.gore?.prob > explicityRatio ||
              frame["gore-2.0"]?.prob > explicityRatio
            ) {
              allModels.push("gore");
            }

            // Check for violence
            if (frame.violence?.prob > explicityRatio) {
              allModels.push("violence");
            }

            // Check for self-harm
            if (frame["self-harm"]?.prob > explicityRatio) {
              allModels.push("self-harm");
            }

            // Check for tobacco
            if (frame.tobacco?.prob > explicityRatio) {
              allModels.push("tobacco");
            }

            // Check for gambling
            if (frame.gambling?.prob > explicityRatio) {
              allModels.push("gambling");
            }

            // Check for offensive content (offensive-2.0 model) - flags, ISIS, etc.
            if (frame.offensive || frame["offensive-2.0"]) {
              const offensive = frame.offensive || frame["offensive-2.0"];
              const offensiveScore = Math.max(
                offensive.prob || 0,
                offensive.nazi || 0,
                offensive.asian_swastika || 0,
                offensive.confederate || 0,
                offensive.supremacist || 0,
                offensive.terrorist || 0,
                offensive.middle_finger || 0,
                offensive.flag || 0
              );
              // Lower threshold for flags and terrorist symbols
              if (offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1) {
              allModels.push("offensive");
              }
            }

            // Check for masked men (faces with masks)
            if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
              const hasMaskedFace = frame.faces.some(face => 
                face.attributes && (
                  face.attributes.mask > 0.5 ||
                  face.attributes.face_mask > 0.5 ||
                  face.attributes.medical_mask > 0.5
                )
              );
              if (hasMaskedFace) {
                allModels.push("masked-men");
              }
            }

            // Check for money
            if (frame.money?.prob > explicityRatio) {
              allModels.push("money");
          }

          allModels.forEach((model) => {
            if (!sigthengineResults.includes(model)) {
              sigthengineResults.push(model);
            }
          });
          }
        }

        contentNames.push(contentName);
      }
    }



    // Check description text for abusive content
    let descriptionTextResult = null;
    let hasAbusiveDescription = false;
    if (description && description.trim() !== "") {
      try {
        descriptionTextResult = await checkTextSightengine(description);
        
        // Handle response structure - can be direct or nested
        const textResult = descriptionTextResult.data || descriptionTextResult;
        
        // Check if description contains abusive content
        // Sightengine returns arrays for each category
        hasAbusiveDescription = 
          (textResult.profanity && Array.isArray(textResult.profanity) && textResult.profanity.length > 0) ||
          (textResult.extremism && Array.isArray(textResult.extremism) && textResult.extremism.length > 0) ||
          (textResult.violence && Array.isArray(textResult.violence) && textResult.violence.length > 0) ||
          (textResult.self_harm && Array.isArray(textResult.self_harm) && textResult.self_harm.length > 0) ||
          (textResult.drug && Array.isArray(textResult.drug) && textResult.drug.length > 0);
        
        // Debug logging (can be removed in production)
        if (hasAbusiveDescription) {
          console.log("Abusive text detected in description:", textResult);
          sigthengineResults.push("profanity-text");
        }
      } catch (error) {
        console.error("Error checking description text:", error);
        // If text moderation fails, we should still check for common profanity patterns as fallback
        const commonProfanity = /\b(fuck|shit|damn|bitch|asshole|piss|hell|crap)\b/gi;
        if (commonProfanity.test(description)) {
          hasAbusiveDescription = true;
          sigthengineResults.push("profanity-text");
        }
      }
    }

    const includeTextContent = contentsResponse.some(
      (response) => {
        const responseData = response.data || response;
        const frame = responseData.frames?.[0] || responseData;
        return frame.text && (
          frame.text.profanity?.length > 0 ||
          frame.text.personal?.length > 0 ||
          frame.text.extremism?.length > 0 ||
          frame.text.violence?.length > 0 ||
          frame.text.self_harm?.length > 0
        );
      }
    );

    const includeQRContent = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      return frame.qr && (
        (frame.qr.personal && frame.qr.personal.length > 0) ||
        (frame.qr.link && frame.qr.link.length > 0) ||
        (frame.qr.social && frame.qr.social.length > 0) ||
        (frame.qr.spam && frame.qr.spam.length > 0) ||
        (frame.qr.profanity && frame.qr.profanity.length > 0) ||
        (frame.qr.blacklist && frame.qr.blacklist.length > 0)
      );
    });

    const includeNudity = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      return frame.nudity && (
        frame.nudity.sexual_activity > nudityRatio ||
        frame.nudity.sexual_display > nudityRatio ||
        frame.nudity.erotica > nudityRatio ||
        frame.nudity.sextoy > nudityRatio
      );
    });

    const includeWad = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      
      // Check weapons
      let hasWeapon = false;
      if (frame.weapon) {
        if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
          hasWeapon = true;
        } else if (frame.weapon.classes) {
          const weaponClasses = frame.weapon.classes;
          hasWeapon = (
            weaponClasses.firearm > explicityRatio ||
            weaponClasses.firearm_gesture > explicityRatio ||
            weaponClasses.knife > explicityRatio
          );
        }
      }
      if (!hasWeapon && (
        frame.weapon_firearm > explicityRatio ||
        frame.weapon_knife > explicityRatio
      )) {
        hasWeapon = true;
      }

      // Check alcohol
      let hasAlcohol = false;
      if (frame.alcohol) {
        if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
          hasAlcohol = true;
        } else if (frame.alcohol.prob > explicityRatio) {
          hasAlcohol = true;
        }
      }

      // Check for drugs
      let hasDrugs = false;
      if (frame.recreational_drug) {
        if (frame.recreational_drug.prob > explicityRatio) {
          hasDrugs = true;
        } else if (frame.recreational_drug.classes) {
          const drugClasses = frame.recreational_drug.classes;
          hasDrugs = (
            drugClasses.cannabis > explicityRatio ||
            drugClasses.cannabis_drug > explicityRatio ||
            drugClasses.cannabis_plant > explicityRatio ||
            drugClasses.recreational_drugs_not_cannabis > explicityRatio
          );
        }
      }
      
      if (!hasDrugs && frame.medical) {
        if (frame.medical.prob > explicityRatio) {
          hasDrugs = true;
        } else if (frame.medical.classes) {
          const medicalClasses = frame.medical.classes;
          hasDrugs = (
            medicalClasses.pills > explicityRatio ||
            medicalClasses.paraphernalia > explicityRatio
          );
        }
      }
      if (!hasDrugs && (
        frame.drugs > explicityRatio ||
        frame.medical_drugs > explicityRatio ||
        frame.recreational_drugs > explicityRatio
      )) {
        hasDrugs = true;
      }

      return hasWeapon || hasAlcohol || hasDrugs;
    });

    const includeGore = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      return (frame.gore?.prob > explicityRatio) || 
             (frame["gore-2.0"]?.prob > explicityRatio);
    });

    const includeGambling = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      return frame.gambling?.prob > explicityRatio;
    });

    const includeOffensive = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      const offensive = frame.offensive || frame["offensive-2.0"];
      if (!offensive) return false;
      const offensiveScore = Math.max(
        offensive.prob || 0,
        offensive.nazi || 0,
        offensive.asian_swastika || 0,
        offensive.confederate || 0,
        offensive.supremacist || 0,
        offensive.terrorist || 0,
        offensive.middle_finger || 0,
        offensive.flag || 0
      );
      // Lower threshold for flags and terrorist symbols (ISIS flag, etc.)
      return offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1;
    });

    if (includeTextContent) {
      sigthengineResults.push("profinity-text");
    }
    if (includeQRContent) {
      sigthengineResults.push("qr-content");
    }
    // if (includeScamContent) {
    //   sigthengineResults.push("scam");
    // }
    // if (includeMinor) {
    //   sigthengineResults.push("minor");
    // }
    if (includeNudity) {
      sigthengineResults.push("nudity-2.0");
    }
    if (includeWad) {
      sigthengineResults.push("wad");
    }
    if (includeGore) {
      sigthengineResults.push("horror");
    }
    // if (includeTobacco) {
    //   sigthengineResults.push("tobacco");
    // }
    if (includeGambling) {
      sigthengineResults.push("gambling");
    }
    if (includeOffensive) {
      sigthengineResults.push("offensive");
    }

    // Check for explicit content that should block post creation
    // These categories should prevent post creation: pornography/explicit sexual acts, blood/gore/violence, weapons, drugs & paraphernalia, harmful content
    const hasExplicitBlockingContent = contentsResponse.some((response) => {
      // Handle response structure - can be direct or nested in data
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;

      if (!frame) return false;

      // Check for pornography & explicit sexual acts (explicit nudity)
      let hasExplicitNudity = false;
      if (frame.nudity) {
        hasExplicitNudity = (
          frame.nudity.sexual_activity > nudityRatio ||
          frame.nudity.sexual_display > nudityRatio ||
          frame.nudity.erotica > nudityRatio ||
          frame.nudity.sextoy > nudityRatio
        );
      }

      // Check for suggestive content for minor check
      let hasSuggestive = false;
      if (frame.nudity && frame.nudity.suggestive_classes) {
        const suggestive = frame.nudity.suggestive_classes;
        if (suggestive.bikini > 0.5) hasSuggestive = true;
        if (
          suggestive.swimwear_male > 0.5 ||
          suggestive.swimwear_one_piece > 0.5
        ) hasSuggestive = true;
        if (
          (suggestive.male_chest > 0.5 &&
           suggestive.male_chest_categories &&
           (suggestive.male_chest_categories.very_revealing > 0.5 ||
            suggestive.male_chest_categories.revealing > 0.5)) ||
          suggestive.visibly_undressed > 0.5
        ) hasSuggestive = true;
        if (
          suggestive.cleavage > 0.5 &&
          suggestive.cleavage_categories &&
          (suggestive.cleavage_categories.very_revealing > 0.5 ||
            suggestive.cleavage_categories.revealing > 0.5)
        ) hasSuggestive = true;
        if (
          suggestive.male_underwear > 0.5 ||
          suggestive.lingerie > 0.5
        ) hasSuggestive = true;
        if (
          suggestive.suggestive_pose > 0.5 ||
          suggestive.suggestive_focus > 0.5
        ) hasSuggestive = true;
      }
      if (
        frame.nudity.suggestive > 0.7 ||
        frame.nudity.very_suggestive > 0.5 ||
        frame.nudity.mildly_suggestive > 0.7
      ) hasSuggestive = true;

      // Check for minors
      let hasMinor = false;
      if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
        hasMinor = frame.faces.some(face => face.age < 18);
      }

      const hasMinorsInSuggestiveContext = hasMinor && (hasExplicitNudity || hasSuggestive);

      // Check for blood/gore/violence
      const hasGoreViolence = 
        (frame.gore?.prob > explicityRatio || frame["gore-2.0"]?.prob > explicityRatio) ||
        (frame.violence?.prob > explicityRatio);

      // Check for weapons (arms)
      let hasWeapons = false;
      if (frame.weapon) {
        if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
          hasWeapons = true;
        } else if (frame.weapon.classes) {
          const weaponClasses = frame.weapon.classes;
          hasWeapons = (
            weaponClasses.firearm > explicityRatio ||
            weaponClasses.firearm_gesture > explicityRatio ||
            weaponClasses.knife > explicityRatio ||
            weaponClasses.firearm_toy > explicityRatio
          );
        }
      }
      // Also check old format
      if (!hasWeapons && (
        frame.weapon_firearm > explicityRatio ||
        frame.weapon_knife > explicityRatio
      )) {
        hasWeapons = true;
      }

      // Check for drugs & paraphernalia
      let hasDrugs = false;
      if (frame.recreational_drug) {
        if (frame.recreational_drug.prob > explicityRatio) {
          hasDrugs = true;
        } else if (frame.recreational_drug.classes) {
          const drugClasses = frame.recreational_drug.classes;
          hasDrugs = (
            drugClasses.cannabis > explicityRatio ||
            drugClasses.cannabis_drug > explicityRatio ||
            drugClasses.cannabis_plant > explicityRatio ||
            drugClasses.recreational_drugs_not_cannabis > explicityRatio
          );
        }
      }
      // Check medical drugs
      if (!hasDrugs && frame.medical) {
        if (frame.medical.prob > explicityRatio) {
          hasDrugs = true;
        } else if (frame.medical.classes) {
          const medicalClasses = frame.medical.classes;
          hasDrugs = (
            medicalClasses.pills > explicityRatio ||
            medicalClasses.paraphernalia > explicityRatio
          );
        }
      }
      // Also check old format
      if (!hasDrugs && (
        frame.drugs > explicityRatio ||
        frame.medical_drugs > explicityRatio ||
        frame.recreational_drugs > explicityRatio
      )) {
        hasDrugs = true;
      }

      // Check for harmful content (self-harm, offensive - flags/ISIS, etc.)
      const hasSelfHarm = frame["self-harm"]?.prob > explicityRatio;
      let hasOffensive = false;
      if (frame.offensive || frame["offensive-2.0"]) {
        const offensive = frame.offensive || frame["offensive-2.0"];
        const offensiveScore = Math.max(
          offensive.prob || 0,
          offensive.nazi || 0,
          offensive.asian_swastika || 0,
          offensive.confederate || 0,
          offensive.supremacist || 0,
          offensive.terrorist || 0,
          offensive.middle_finger || 0,
          offensive.flag || 0
        );
        // Lower threshold for flags and terrorist symbols (ISIS flag, etc.)
        hasOffensive = offensiveScore > 0.1 || offensive.terrorist > 0.1 || offensive.nazi > 0.1;
      }

      // Check for abusive text in media
      const hasTextProfanity = frame.text && (
        frame.text.profanity?.length > 0 ||
        frame.text.extremism?.length > 0 ||
        frame.text.violence?.length > 0 ||
        frame.text.self_harm?.length > 0 ||
        (frame.text.drug?.length > 0)
      );

      const hasQRProfanity = frame.qr && frame.qr.profanity?.length > 0;

      return hasExplicitNudity || hasDrugs || hasSelfHarm || hasOffensive || hasMinorsInSuggestiveContext || hasTextProfanity || hasQRProfanity;
    });
    
    // Block post creation if explicit blocking content is found
    if (hasExplicitBlockingContent || hasAbusiveDescription) {      
      // await sendNotification(
      //   userid,
      //   "Post Creation Failed",
      //   "Your post contains explicit content and cannot be created"
      // );
      return res.status(400).json({
        error: "Your post contains prohibited content such as sexual acts, nudity, pornography, or explicit fetish content, self-harm, drug use, hate speech, harassment, exploitation, abuse, terrorism, or minors in adult or suggestive context.",
        sigthengineResults: sigthengineResults,
      });
    }

    // Compute restrictedContent and abusiveText flags based on actual Sightengine response
    const hasRestrictedContent = contentsResponse.some((response) => {
      // Handle response structure - can be direct or nested in data
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;

      if (!frame) return false;

      // Check for none sexual body part, bikinis, men bare chest, legs, mini skirts & shorts (restricted nudity)
      const hasExposedBody = frame.nudity && frame.nudity.suggestive_classes && (
        // Bikini (restrict bikini images)
        frame.nudity.suggestive_classes.bikini > 0.5 ||
        // Swimwear (male or one-piece)
        frame.nudity.suggestive_classes.swimwear_male > 0.5 ||
        frame.nudity.suggestive_classes.swimwear_one_piece > 0.5 ||
        // Male chest with very revealing or revealing
        (frame.nudity.suggestive_classes.male_chest > 0.5 && 
         frame.nudity.suggestive_classes.male_chest_categories &&
         (frame.nudity.suggestive_classes.male_chest_categories.very_revealing > 0.5 ||
          frame.nudity.suggestive_classes.male_chest_categories.revealing > 0.5)) ||
        // Female chest/cleavage with very revealing or revealing
        (frame.nudity.suggestive_classes.cleavage > 0.5 &&
         frame.nudity.suggestive_classes.cleavage_categories &&
         (frame.nudity.suggestive_classes.cleavage_categories.very_revealing > 0.5 ||
          frame.nudity.suggestive_classes.cleavage_categories.revealing > 0.5)) ||
        // Underwear visible (male underwear)
        frame.nudity.suggestive_classes.male_underwear > 0.5 ||
        frame.nudity.suggestive_classes.lingerie > 0.5 ||
        // Visibly undressed
        frame.nudity.suggestive_classes.visibly_undressed > 0.5 ||
        // Suggestive poses or focus
        frame.nudity.suggestive_classes.suggestive_pose > 0.5 ||
        frame.nudity.suggestive_classes.suggestive_focus > 0.5 ||
        // High suggestive probability overall (most of body visible)
        // Also check mildly_suggestive (bikini often shows as mildly_suggestive)
        frame.nudity.suggestive > 0.7 ||
        frame.nudity.very_suggestive > 0.5 ||
        frame.nudity.mildly_suggestive > 0.7
      );

      // Check for alcohol
      let hasAlcohol = false;
      if (frame.alcohol) {
        if (typeof frame.alcohol === 'number' && frame.alcohol > explicityRatio) {
          hasAlcohol = true;
        } else if (frame.alcohol.prob > explicityRatio) {
          hasAlcohol = true;
        }
      }

      // Check for tobacco
      const hasTobacco = frame.tobacco && frame.tobacco.prob > explicityRatio;

      // Check for gambling
      const hasGambling = frame.gambling && frame.gambling.prob > explicityRatio;

      // Check for masked men
      // let hasMaskedMen = false;
      // if (frame.faces && Array.isArray(frame.faces) && frame.faces.length > 0) {
      //   hasMaskedMen = frame.faces.some(face => 
      //     face.attributes && (
      //       face.attributes.mask > 0.5 ||
      //       face.attributes.face_mask > 0.5 ||
      //       face.attributes.medical_mask > 0.5
      //     )
      //   );
      // }

      // Check for money
      // const hasMoney = frame.money && frame.money.prob > explicityRatio;

      // Check for weapons (arms)
      let hasWeapon = false;
      if (frame.weapon) {
        if (typeof frame.weapon === 'number' && frame.weapon > explicityRatio) {
          hasWeapon = true;
        } else if (frame.weapon.classes) {
          const weaponClasses = frame.weapon.classes;
          hasWeapon = (
            weaponClasses.firearm > explicityRatio ||
            weaponClasses.firearm_gesture > explicityRatio ||
            weaponClasses.knife > explicityRatio ||
            weaponClasses.firearm_toy > explicityRatio
          );
        }
      }
      // Also check old format
      if (!hasWeapon && (
        frame.weapon_firearm > explicityRatio ||
        frame.weapon_knife > explicityRatio
      )) {
        hasWeapon = true;
      }

      // Check for violence (fights)
      const hasViolence = frame.violence?.prob > explicityRatio;

      // Check for gore (blood scenes, accidents)
      const hasGore = 
        frame.gore?.prob > explicityRatio || 
        frame["gore-2.0"]?.prob > explicityRatio;
      
      return hasWeapon || hasViolence || hasGore;
    });

    // Check for abusive text in images/videos and description
    const hasAbusiveTextInMedia = contentsResponse.some((response) => {
      const responseData = response.data || response;
      const frame = responseData.frames?.[0] || responseData;
      
      if (!frame) return false;

      // Check for profanity in text within images/videos
      const hasTextProfanity = frame.text && (
        (frame.text.profanity && frame.text.profanity.length > 0) ||
        (frame.text.extremism && frame.text.extremism.length > 0) ||
        (frame.text.violence && frame.text.violence.length > 0) ||
        (frame.text.self_harm && frame.text.self_harm.length > 0) ||
        (frame.text.drug && frame.text.drug.length > 0)
      );

      // Check for profanity in QR codes
      const hasQRProfanity = frame.qr && 
        frame.qr.profanity && 
        frame.qr.profanity.length > 0;

      return hasTextProfanity || hasQRProfanity;
    });

    // Combine media text abuse check with description text abuse check
    const hasAbusiveText = hasAbusiveTextInMedia || hasAbusiveDescription;




    if (req.files["contents"]) {
      if (!post) {
        post = await Post.create({
          userid,
          description,
          postType,
          commentsAllowed,
          location
        });

        if (postType == "paid") {
          await post.updateOne({
            price,
          });
        } else if (postType == "public") {
          await post.updateOne({
            price: 0,
          });
        }
      }

      await Post.findByIdAndUpdate(post._id, {
        $push: { contents: contentNames },
      });

      if(hasRestrictedContent){
        await post.updateOne({ 
          sigthengineResults,
          restrictedContent: hasRestrictedContent,
          // abusiveText: hasAbusiveText removed
        });
      }
    }
    if (!post && description) {
      post = await Post.create({
        userid,
        description,
        postType,
        commentsAllowed,
        textPost: true,
        location
      });

      if (postType == "paid") {
        await post.updateOne({
          price,
        });
      } else if (postType == "public") {
        await post.updateOne({
          price: 0,
        });
      }
    }

    if (!post) {
      // await sendNotification(
      //   userid,
      //   "Error creating post",
      //   `Please provide content`
      // );
      // throw Error("Please provide content");
      res.status(400).json({
        error: "Please provide content"
      });
    }
    // else {
    //   // var sockets = global.onlineSockets.get(userid);
    //   // if (sockets) {
    //   //   for (const socket of sockets) {
    //   //     if (socket) {
    //   //       socket.emit("errorCreatingPost", {
    //   //         error: "Please provide content"
    //   //       });
    //   //     }
    //   //   }
    //   // }
    //   await sendNotification(
    //     userid,
    //     "Error creating post",
    //     `Please provide content`
    //   );
    //   throw Error("Please provide content");
    // }

    if (req.files["thumbnails"]) {
      for (const thumbnail of req.files["thumbnails"]) {
        const thumbnailName = randomName();
        const params = {
          Bucket: bucketName,
          Key: thumbnailName,
          Body: thumbnail.buffer,
          ContentType: thumbnail.mimetype,
        };
        const command = new PutObjectCommand(params);
        await s3.send(command);
        console.log("post: ", post);
        await Post.findByIdAndUpdate(post._id, {
          $push: { thumbnails: thumbnailName },
        });
      }
    }

    await user.updateOne({ $push: { posts: post._id } });

    // var sockets = global.onlineSockets.get(userid);
    // if (sockets) {
    //   for (const socket of sockets) {
    //     if (socket) {
    //       socket.emit("createdPost", {
    //         description: truncateString(description, 30),
    //         postid: post._id,
    //         userid
    //       });
    //     }
    //   }
    // }
    // await sendNotification(
    //   userid,
    //   "Post created",
    //   truncateString(description, 30),
    //   "post",
    //   post._id
    // );

    let tags = [];
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
        tags = matches.map((tag) => tag.substring(1));
        tags.map(tag => {
          taggedUsers.push("")
        })
        
        // Print the extracted tags
        await Promise.all(
          tags.map(async (tag, i) => {
            var taggedUser = await User.findOne({tag})
            if(taggedUser){
              taggedUsers[i] = taggedUser._id;
            }
          })
        )

        taggedUsers = taggedUsers.filter(tag => tag !== "");
      }
    }

    await post.updateOne({
      taggedUsers
    })

    console.log("tags: ", tags);
    console.log("tagged users: ", taggedUsers)
    await Promise.all(
      user.followers.map(async (followerid) => {
        if (followerid != userid) {
          var follower = await User.findById(followerid);

          var notificationTitle = `New ${postType == "paid" ? "paid ": ""}Post`;
          var notificationBody = `has posted a New ${postType == "paid" ? "paid ": ""}Post`;
          if(follower){
            if (tags.includes(follower.tag)) {
              notificationTitle = "Tagged in post";
              notificationBody = `has tagged you in a post`;
              tags = tags.filter(tag => tag !== follower.tag);
            }
          }
          await sendNotification(
            followerid,
            notificationTitle,
            `${user.firstname + " " + user.lastname} ${notificationBody}`,
            "post",
            post._id,
            userid
          );
          await createActivity(
            followerid,
            user._id,
            notificationBody,
            undefined,
            post._id,
            null,
            null,
            null,
            null,
            null,
            postType == "paid" ? "paidPost" : "freePost"
          );
        }
      })
    );

    await Promise.all(
      tags.map(async (tag) => {
          var tagUser = await User.findOne({tag});

          if(user){
            var notificationTitle = "Tagged in post";
            var notificationBody = `has tagged you in a post`;
            await sendNotification(
              tagUser._id,
              notificationTitle,
              `${user.firstname + " " + user.lastname} ${notificationBody}`,
              "post",
              post._id,
              userid
            );
            await createActivity(
              tagUser._id,
              user._id,
              "tagged you in a post",
              undefined,
              post._id,
              null,
              null,
              null,
              null,
              null,
              postType == "paid" ? "paidPost" : "freePost"
            );
          }
      })
    );

    res.status(201).json({
      message: "Post Posted",
      contentsResponse,
      sigthengineResults,
    });
  } catch (error) {
    // var sockets = global.onlineSockets.get(userid);
    //   if (sockets) {
    //     for (const socket of sockets) {
    //       if (socket) {
    //         socket.emit("errorCreatingPost", {
    //           error: error.message
    //         });
    //       }
    //     }
    //   }
    // await sendNotification(userid, "Error creating post", error.message);
    res.status(500).json({ error: error.message });
    console.log("error: ", error);
  }
};

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

    return response.data;
  } catch (error) {
    console.error("Sightengine API error:", error.message);
    throw Error("Sightengine API error");
  }
}

// Helper: Poll Sightengine job status until done or timeout
const pollVideoJob = async (mediaId, maxAttempts = 120, intervalMs = 2000) => { // ~2 min timeout
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    await new Promise(r => setTimeout(r, intervalMs));

    try {
      const response = await axios.get('https://api.sightengine.com/1.0/video/byid.json', {
        params: {
          id: mediaId,               // media.id
          api_user: process.env.SIGHTENGINE_API_USER,
          api_secret: process.env.SIGHTENGINE_API_SECRET,
        }
      });

      const data = response.data;
      console.log("polling response:", data);

      if (data.output.data.status === 'failure') {
        throw new Error(`Video moderation job failed: ${data.error?.message || 'unknown'}`);
      }

      if (data.output.data.status === 'finished') {
        return data.output; // contains .data with moderation results (same structure as sync)
      }

      // still processing → continue polling
      console.log(`Polling attempt ${attempt}/${maxAttempts} - status: ${data.output.data.status || 'pending'}`);

    } catch (err) {
      console.error("Polling error:", err.message);
      if (attempt === maxAttempts) throw new Error("Video moderation timeout");
    }
  }

  throw new Error("Video moderation polling timeout");
};

// Helper: Upload large video to Sightengine → returns media.id
const uploadVideoToSightengine = async (videoBuffer) => {
  // Step 1: Get signed upload URL + media.id
  const createRes = await axios.get('https://api.sightengine.com/1.0/upload/create-video.json', {
    params: {
      api_user: process.env.SIGHTENGINE_API_USER,
      api_secret: process.env.SIGHTENGINE_API_SECRET,
    },
  });

  const responseData = createRes.data;

  if (responseData.status !== 'success' || !responseData.upload?.url || !responseData.media?.id) {
    throw new Error(
      `Failed to get Sightengine upload details: ${JSON.stringify(responseData)}`
    );
  }

  const signedUrl = responseData.upload.url;
  const mediaId = responseData.media.id;

  // Step 2: PUT the video to the signed URL
  await axios.put(signedUrl, videoBuffer, {
    headers: { 'Content-Type': 'video/mp4' }, // adjust mime if needed (e.g. 'video/quicktime' for .mov)
    maxContentLength: Infinity,
    maxBodyLength: Infinity,
  });

  return mediaId;
};

async function checkImageWithSightengine(imageBuffer, models) {
  try {
    const data = new FormData();
    data.append("media", imageBuffer, { filename: "image.jpg" });
    data.append("models", models.join(","));
    data.append("api_user", process.env.SIGHTENGINE_API_USER);
    data.append("api_secret", process.env.SIGHTENGINE_API_SECRET);

    const response = await axios({
      method: "post",
      url: "https://api.sightengine.com/1.0/check.json",
      data: data,
      headers: data.getHeaders(),
    });

    return response.data;
  } catch (error) {
    console.error("Sightengine API error:", error.message);
    throw Error("Sightengine API error");
  }
}
async function checkTextSightengine(text) {
  try {
    const data = new FormData();
    data.append("text", text || "");
    data.append("lang", "en");
    data.append("categories", "profanity,extremism,violence,self-harm,personal,link,social,spam,drug,weapon,medical,money-transaction,content-trade");
    data.append("mode", "rules");
    data.append("api_user", process.env.SIGHTENGINE_API_USER);
    data.append("api_secret", process.env.SIGHTENGINE_API_SECRET);

    const response = await axios({
      method: "post",
      url: "https://api.sightengine.com/1.0/text/check.json",
      data: data,
      headers: data.getHeaders(),
    });

    return response.data;
  } catch (error) {
    console.error("Sightengine Text API error:", error.message);
    // Return empty result on error to not block post creation
    return {
      profanity: [],
      extremism: [],
      violence: [],
      personal: [],
      link: [],
      social: [],
      spam: [],
    };
  }
}
const editPost = async (req, res) => {
  try {
    let { postid, description, commentsAllowed, location } = req.body;

    const post = await Post.findById(postid);

    if (!post) {
      throw Error("Post Not Found");
    }

    await post.updateOne({
      description,
      commentsAllowed: commentsAllowed || post.commentsAllowed,
      location: location || post.location
    });
    res.status(200).json({
      message: "Post Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const deletePost = async (req, res) => {
  try {
    const postid = req.body.postid;
    const post = await Post.findById(postid);
    if (!post) {
      throw Error("Post Not Found");
    }
    const userid = post.userid;

    await Promise.all(
      post.contents.map((content) => {
        let params = {
          Bucket: bucketName,
          Key: content,
        };
        let command = new DeleteObjectCommand(params);
        return s3.send(command);
      })
    );

    await User.findByIdAndUpdate(userid, {
      $pull: { posts: post._id, savedPosts: post._id },
    });
    await Post.findByIdAndDelete(postid);

    await Activity.deleteMany({ postid });

    res.status(200).json({
      status: "Post Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const buyPost = async (req, res) => {
  try {
    const { postid, userid } = req.body;
    const user = await User.findById(userid);
    const post = await Post.findById(postid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!post) {
      throw Error("Post Not Found");
    }
    const receiver = await User.findById(post.userid);

    const walletReceiver = await Wallet.findById(receiver.walletid);
    const walletSender = await Wallet.findById(user.walletid);

    if (post.postType == "public") {
      return res.status(400).json({
        success: false,
        message: "Post is Already Public"
      })
    }

    if (post.canView.includes(userid)) {
      return res.status(400).json({
        success: false,
        message: "Post already bought!"
      })
    }

    if (post.price <= walletSender.coins) {
      await walletSender.updateOne({
        coins: walletSender.coins - post.price,
      });
      var mainAdmin = await Admin.findOne({ mainAdmin: true });
      var amount = post.price;
      var adminShare = amount * (mainAdmin.adminShare / 100);
      var userShare = amount - adminShare;
      var diamonds = userShare * mainAdmin.coinEquivalence;
      // var diamonds = post.price
      await walletReceiver.updateOne({
        diamonds: walletReceiver.diamonds + diamonds
      });
      await walletReceiver.updateOne({
        coins: walletReceiver.coins + userShare
      });

      await transactionHistoryModel.create({
        userid,
        amount: post.price,
        fee: adminShare,
        adminShare: adminShare,
        userGot: userShare,
        transactionType: "buyPost"
      })

      await post.updateOne({
        $push: { canView: userid },
      });

      await createTransaction({
        user_id: userid,
        creator_id: post.userid,
        type: 'paywall',
        amount: amount,
        // platform_fee: post.price * 0.28,
        // net_creator_amount: post.price * 0.72,
        net_creator_amount: userShare,
        status: 'completed', // If internal; else pending
        post_id: post._id
      });

      await sendNotification(
        post.userid,
        "Bought your post",
        `${user.firstname + " " + user.lastname} has bought your post`,
        "post",
        post._id,
        null,
        null,
        userid
      );
      await createActivity(
        post.userid,
        userid,
        `Bought your post`,
        undefined,
        post._id
      );

      res.status(200).json({
        message: "Post Bought Successfully",
      });
    } else {
      throw Error("Not Enough Coins In Wallet");
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const likePost = async (req, res) => {
  try {
    var postid = req.body.postid;
    const post = await Post.findById(req.body.postid);
    if(!post){
      res.status(400).json({
        success: false,
        error: "Post not found",
      });
    }
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (!post) {
      throw Error("Post Not Found");
    }

    var likes = post.likes.map(like => { return like.toString() })
    if (likes.includes(userid)) {
      await post.updateOne({ $pull: { likes: req.body.userid } });
      await updateRankingPointsForUser(post.userid);
      
      await Activity.deleteMany({
        otheruserid: userid,
        postid,
      });

      res.status(200).json({
        message: "Post Unliked",
      });
    } else {
      await post.updateOne({ $push: { likes: req.body.userid } });
      await markOnboardingTask(userid, "like");
      if (userid != post.userid) {
        await sendNotification(
          post.userid,
          "Post Liked",
          `${user.firstname + " " + user.lastname} liked your Post`,
          "post",
          post._id
        );

        await createActivity(
          post.userid,
          userid,
          "liked your post",
          undefined,
          post._id
        );
      }

      res.status(200).json({
        message: "Post Liked",
      });
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const makeComment = async (req, res) => {
  try {
    const { userid, postid, description } = req.body;

    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const post = await Post.findById(postid);
    if (!post) {
      throw Error("Post Not Found");
    }
    
    

    let taggedUsers = [];
    const comment = await Comment.create({
      userid,
      postid,
      description
    });
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

        tags.map(tag => {
          taggedUsers.push("")
        })
        // Print the extracted tags
        await Promise.all(
          tags.map(async (tag, i) => {
            var taggedUser = await User.findOne({ tag });
            if(taggedUser){
              // taggedUsers.push(taggedUser._id);
              
              taggedUsers[i] = taggedUser._id;
            }
            await sendNotification(
              taggedUser._id,
              "Tagged in comment",
              `${
                user.firstname + " " + user.lastname
              } has tagged you in a comment`,
              "post",
              post._id,
              "tagComment",
              comment._id,
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
              } has tagged you in a comment`,
              undefined,   // streamid
              post._id,    // postid
              undefined,   // channel
              undefined,   // token
              null,        // voicemeetid
              false,       // walletNotify
              undefined,   // reelid
              "tag-comment",          // activityType
              { postid: post._id, commentid: comment._id }, // data
              'true'         // isComment
            );
          })
        );
        
        taggedUsers = taggedUsers.filter(tag => tag !== "");
      }
    }
    await comment.updateOne({
      taggedUsers
    })
    

    await post.updateOne({ $push: { comments: comment._id } });

    

    if (userid != post.userid) {
      await sendNotification(
        post.userid,
        "New Comment",
        `${user.firstname + " " + user.lastname} commented on your post`,
        "post",
        post._id,
        "postComment",
        comment._id,
        null,
        null,
        null,
        'true'
      );

      await createActivity(
        post.userid,
        userid,
        `${user.firstname + " " + user.lastname} commented on your post`,
        undefined,   // streamid
        post._id,    // postid
        undefined,   // channel
        undefined,   // token
        null,        // voicemeetid
        false,       // walletNotify
        undefined,   // reelid
        "comment-post",          // activityType
        { postid: post._id, commentid: comment._id }, // data
        true         // isComment
      );
    }

    res.status(200).json({
      message: "Comment Posted",
      commentId: comment._id
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
    console.log(error);
  }
};
const getComments = async (req, res) => {
  try {
    const postid = req.params.postid;

    const post = await Post.findById(postid);

    if (!post) {
      throw Error("Post Not Found");
    }

    let comments = await Comment.find({ postid }).sort({ createdAt: "desc" });

    comments = await Promise.all(
      comments.map(async (comment) => {
        const userid = comment.userid;
        const user = await User.findById(userid);
        comment = comment.toObject();
        comment.username = user.username;
        comment.profilePictureUrl = await getPicUrl(userid);
        comment.isVerified = user.isVerified;
        return comment;
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
    const comment = await Comment.findById(req.body.commentid);
    if(!comment){
      res.status(400).json({
        success: false,
        message: "Invalid comment"
      })
    }

    var user = await User.findById(req.body.userid);
    if(!user){
      res.status(400).json({
        success: false,
        message: "Invalid user"
      })
    }

    if (comment.likes.includes(req.body.userid)) {
      await comment.updateOne({ $pull: { likes: req.body.userid } });
      res.status(200).json({
        message: "Comment Unliked",
      });
    } else if (!comment.likes.includes(req.body.userid)) {
      await comment.updateOne({ $push: { likes: req.body.userid } });
      res.status(200).json({
        message: "Comment Liked",
      });
    }

    if(req.body.userid != comment.userid.toString()){
      await sendNotification(
        comment.userid,
        "Comment Liked",
        `${user.firstname + " " + user.lastname} liked your post comment`,
        "post",
        comment.postid,
        "commentLiked",
        comment._id,
        null,
        null,
        null,
        'true'
      );

      await createActivity(
        comment.userid,
        user._id,
        `${user.firstname + " " + user.lastname} liked your post comment`,
        undefined,   // streamid
        comment.postid,    // postid
        undefined,   // channel
        undefined,   // token
        null,        // voicemeetid
        false,       // walletNotify
        undefined,   // reelid
        "comment-liked",          // activityType
        { postid: comment.postid, commentid: comment._id }, // data
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
    const comment = await Comment.findById(commentid);
    if (!comment) {
      throw Error("Comment Not Found");
    }

    const postid = comment.postid;

    await Post.findByIdAndUpdate(postid, {
      $pull: { comments: comment._id },
    });

    await Promise.all(
      comment.replies.map((id) => {
        return Reply.findByIdAndDelete(id);
      })
    );

    await Comment.findByIdAndDelete(commentid);

    res.status(200).json({
      status: "Comment Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
// const deleteMyComment = async (req, res) => {
//   try {
//     const commentid = req.body.commentid;
//     const userid = req.body.userid;
//     const comment = await Comment.findById(commentid);
//     if (!comment) {
//       res.status(400).json({
//         success: false,
//         message: "Comment Not Found"
//       })
//       return;
//     }

//     const user = await User.findById(userid);
//     if (!user) {
//       res.status(400).json({
//         success: false,
//         message: "User Not Found"
//       })
//       return;
//     }

//     if(!user._id == comment.userid){
//       res.status(400).json({
//         success: false,
//         message: "You can't delete this comment"
//       })
//       return;
//     }

//     const postid = comment.postid;

//     await Post.findByIdAndUpdate(postid, {
//       $pull: { comments: comment._id },
//     });

//     await Promise.all(
//       comment.replies.map((id) => {
//         return Reply.findByIdAndDelete(id);
//       })
//     );

//     await Comment.findByIdAndDelete(commentid);

//     res.status(200).json({
//       status: "Comment Deleted",
//     });
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };
const makeReply = async (req, res) => {
  try {
    const { userid, commentid, description } = req.body;
    
    const comment = await Comment.findById(req.body.commentid);
    if(!comment){
      return res.status(400).json({
        success: false,
        message: "Invalid comment"
      })
    }

    // const post = await Post.findById(comment.postid);
    // if(!post){
    //   return res.status(400).json({
    //     success: false,
    //     message: "Invalid post"
    //   })
    // }

    const user = await User.findById(req.body.userid);
    if(!user){
      return res.status(400).json({
        success: false,
        message: "Invalid user"
      })
    }

    const reply = await Reply.create({
      userid,
      commentid,
      description,
    });

    await Comment.findByIdAndUpdate(commentid, {
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
              } has tagged you in a post comment`,
              "post",
              comment.postid,
              "tagCommentReply",
              comment._id,
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
              } has tagged you in a post comment`,
              undefined,   // streamid
              comment.postid,    // postid
              undefined,   // channel
              undefined,   // token
              null,        // voicemeetid
              false,       // walletNotify
              undefined,   // reelid
              "tag-comment-reply",          // activityType
              { postid: comment.postid, commentid: comment._id }, // data
              'true'         // isComment
            );
          })
        );
      }
    }

    await reply.updateOne({
      taggedUsers
    })
    
    if(req.body.userid != comment.userid.toString()){
      await sendNotification(
        comment.userid,
        "Comment Replied",
        `${user.firstname + " " + user.lastname} replied on your post comment`,
        "post",
        comment.postid,
        "commentReplied",
        comment._id,
        null,
        null,
        null,
        'true'
      );
  
      await createActivity(
        comment.userid,
        user._id,
        `${user.firstname + " " + user.lastname} replied on your post comment`,
        undefined,   // streamid
        comment.postid,    // postid
        undefined,   // channel
        undefined,   // token
        null,        // voicemeetid
        false,       // walletNotify
        undefined,   // reelid
        "comment-replied",          // activityType
        { postid: comment.postid, commentid: comment._id }, // data
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

    const comment = await Comment.findById(commentid);

    const replies = await Promise.all(
      comment.replies.map(async (id) => {
        let reply = await Reply.findById(id);
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
    const reply = await Reply.findById(req.body.replyid);

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
    const reply = await Reply.findById(replyid);
    if (!reply) {
      throw Error("Reply Not Found");
    }

    const commentid = reply.commentid;

    await Comment.findByIdAndUpdate(commentid, {
      $pull: { replies: reply._id },
    });
    await Reply.findByIdAndDelete(replyid);

    res.status(200).json({
      status: "Reply Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const getPostById = async (req, res) => {
  try {
    const postid = req.params.postid;

    const post = await getPost(postid);

    res.status(200).json({ post });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const getAllPostDescriptions = async (req, res) => {
  try {
    const posts = await Post.find().sort({ createdAt: -1 });

    const hashtagCounts = {};

    posts.forEach((post) => {
      const hashtags = extractHashtags(post.description);

      hashtags.forEach((hashtag) => {
        const tag = hashtag.substring(1);

        hashtagCounts[tag] = (hashtagCounts[tag] || 0) + 1;
      });
    });

    const hashtagArray = Object.keys(hashtagCounts).map((key) => ({
      hashtag: key,
      count: hashtagCounts[key],
    }));

    res.status(200).json({ hashtags: hashtagArray });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
function extractHashtags(description) {
  const regex = /#[^\s#]+/g;

  return description.match(regex) || [];
}
const getUserPosts = async (req, res) => {
  try {
    const userid = req.params.userid;
    const postids = await Post.find({ userid })
      .sort({ createdAt: -1 })
      .select("_id");

    let posts = await Promise.all(
      postids.map((id) => {
        return getPost(id);
      })
    );
    let pinnedPosts = [];
    let unpinnedPost = [];

    posts.forEach((post) => {
      if (post.pinned) {
        pinnedPosts.push(post);
      } else { 
        unpinnedPost.push(post);
      }
    });

    posts = pinnedPosts.concat(unpinnedPost);

    res.status(200).json({ posts });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const bookmarkPost = async (req, res) => {
  try {
    const { userid, postid } = req.body;
    const user = await User.findById(userid);
    const post = await Post.findById(postid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!post) {
      throw Error("Post Not Found");
    }
    if (!user.savedPosts.includes(postid)) {
      await user.updateOne({ $push: { savedPosts: postid } });
      await post.updateOne({ $push: { savedBy: userid } });

      res.status(200).json({
        message: "Post Bookmarked",
      });
    } else if (user.savedPosts.includes(postid)) {
      await user.updateOne({ $pull: { savedPosts: postid } });
      await post.updateOne({ $pull: { savedBy: userid } });

      res.status(200).json({
        message: "Post UnBookmarked",
      });
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const getBookmarked = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }
    let posts = await Promise.all(
      user.savedPosts.map(async (id) => {
        const post = await Post.findById(id);
        if (post) {
          return getPost(post._id);
        }
      })
    );
    posts = posts.filter((item) => item != null);

    res.status(200).json({
      posts,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const pinPost = async (req, res) => {
  try {
    const postid = req.body.postid;
    const post = await Post.findById(postid);
    let message = "";
    if (!post) {
      throw Error("Post Not Found");
    }

    if (post.pinned == true) {
      await post.updateOne({
        pinned: false,
      });
      message = "Post UnPinned";
    } else if (post.pinned == false) {
      await post.updateOne({
        pinned: true,
      });
      message = "Post Pinned";
    }
    res.status(200).json({
      message,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
function truncateString(str, maxLength) {
  if (str.length > maxLength) {
    return str.substring(0, maxLength) + "...";
  }
  return str;
}

const sharePost = async (req, res) => {
  try {
    var { postid, senderid, receiverid } = req.body
    const post = await Post.findById(postid).lean();

    if (!post) {
      throw Error("Post Not Found");
    }

    const sender = await User.findById(senderid);
    const receiver = await User.findById(receiverid);
    if (!sender) {
      throw Error("Sender Not Found");
    }
    if (!receiver) {
      throw Error("Receiver Not Found");
    }

    await sendMessageCustomShare(senderid, receiverid, "post", postid )

    // Count one share per sender for trending. Existing numeric share counts
    // remain as a legacy fallback for posts created before this field existed.
    await Post.updateOne(
      { _id: postid, sharedBy: { $ne: senderid } },
      { $addToSet: { sharedBy: senderid }, $inc: { shares: 1 } }
    );

    res.status(200).json({
      message: "post shared",
    });
  } catch (error) {
    console.log("error", error)
    res.status(400).json({
      error: error.message,
    });
  }
};


module.exports = {
  createPost,
  getAllPostDescriptions,
  editPost,
  pinPost,
  deletePost,
  getAllposts,
  getAllPostsLatest,
  getUserPosts,
  likePost,
  makeComment,
  getComments,
  likeComment,
  deleteComment,
  makeReply,
  getReplies,
  likeReply,
  deleteReply,
  bookmarkPost,
  getBookmarked,
  buyPost,
  getPostById,
  getTotalPosts,
  acceptPost,
  getAllNudityPosts,
  sharePost,
  getPost
};
