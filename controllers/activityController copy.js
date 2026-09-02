const Activity = require("../models/activityModel");
const User = require("../models/userModel");
const Post = require("../models/postModel");
const {aws} = require("../helpers/otherHelpers")

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const createActivity = async (
  userid,
  otheruserid,
  text,
  streamid,
  postid,
  channel,
  token
) => {
  try {
    const user = await User.findById(userid);
    const otheruser = await User.findById(otheruserid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (!otheruser) {
      throw Error("User Not Found");
    }

    await Activity.create({
      userid,
      otheruserid,
      text,
      streamid,
      postid,
      channel,
      token,
    });
  } catch (error) {
    console.error(error);
  }
};


const deleteActivity = async (
  req, res
) => {
  try {
    const {activityid} = req.body;
    await Activity.deleteOne({
      _id: activityid
    });

    res.status(200).json({
      message: "Activity delete successfully"
    });
  } catch (error) {
    console.error(error);
  }
};

const getActivities = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Nots Found");
    }
    let activities = await Activity.find({ userid })
      .sort({ createdAt: "desc" })
      .select("_id");

    activities = await Promise.all(
      activities.map((id) => {
        return getActivity(id);
      })
    );

    res.status(200).json({
      activities,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const { getPicUrl } = require("./userController");

const getActivity = async (id) => {
  let activity = await Activity.findById(id);

  try {
    const otherUser = await User.findById(activity.otheruserid);
    activity = activity.toObject();

    if (!activity) {
      throw Error("Activity Not Found");
    }

    const userProfilePic = await getPicUrl(activity.userid);
    const otherUserProfilePic = await getPicUrl(activity.otheruserid);

    if(otherUser){
      activity.otherUsername = otherUser.username;
    }else{
      activity.otherUsername = null
    }

    activity.userProfilePic = userProfilePic;
    activity.otherUserProfilePic = otherUserProfilePic;

    activity.text = activity.text;

    if (activity.streamid) {
    } else if (activity.postid) {
      const post = await Post.findById(activity.postid);
      if (post) {
        activity.thumbnail = await getThumbnail(post._id);
      } else {
        activity.thumbnail = "";
      }
    }

    return activity;
  } catch (error) {
    console.error(error);
    console.log(activity);
  }
};

// get thumbnail of post
const getThumbnail = async (id) => {
  try {
    let post = await Post.findById(id);

    if (!post) {
      throw Error("Post Not Found");
    }

    const content = post.contents[0];
    console.log("content: ", post.contents)

    if (content) {
      var data = await aws.getLinkFromAWS(content);
      console.log("data:",data);
      return data;
    }
    return "";
  } catch (error) {
    throw new Error(error.message);
  }
};

module.exports = { createActivity, getActivities, deleteActivity };
