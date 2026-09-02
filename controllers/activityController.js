const Activity = require("../models/activityModel");
const Withdraw = require("../models/withdrawModel");
const User = require("../models/userModel");
const Post = require("../models/postModel");
const Reel = require("../models/reelModel");
const Story = require("../models/storyModel");
const {aws} = require("../helpers/otherHelpers")
const Stream = require("../models/streamModel")
const VoiceMeet = require("../models/voicemeetModel")
const moment = require('moment-timezone')

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

const resetActivities = async (check)=>{
  try{
    var activities = await Activity.find(check)
    await Promise.all(
      activities.map(async activity => {
        await activity.deleteOne()
      })
    )
  }catch(e){
    console.log(e)
  }
}

const createActivity = async (
  userid,
  otheruserid,
  text,
  streamid,
  postid,
  channel,
  token,
  voicemeetid=null,
  walletNotify=false,
  reelid,
  activityType="",
  data,
  isComment=false
) => {
  try {
    const user = await User.findById(userid);
    const otheruser = await User.findById(otheruserid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (otheruserid && !otheruser) {
      throw Error("User Not Found");
    }

    await Activity.create({
      userid,
      otheruserid,
      text,
      streamid,
      postid,
      voicemeetid,
      channel,
      token,
      walletNotify,
      reelid,
      activityType,
      data,
      isComment
    });

    var socketActivity = global.onlineSockets.get(userid.toString());

    if (socketActivity) {
      var unreadCount = await Activity.countDocuments({userid: userid, read: false})
      for (const socket of socketActivity) {
        if (socket) {
          socket.emit("unreadActivitiesCount", {
            count: unreadCount
          });
        }
      }
    }
  } catch (error) {
    console.error(error);
  }
};


const deleteActivity = async (
  req, res
) => {
  try {
    const {activityid} = req.body;
    var activity = await Activity.findById(activityid.toString());
    if(activity){
      await activity.deleteOne();
    }else{
      res.status(400).json({
        success: false,
        message: "Activity not found!"
      })
      throw Error("Activity not found");
    }

    res.status(200).json({
      message: "Activity deleted successfully"
    });
  } catch (error) {
    console.error(error);
  }
};

// const getActivities = async (req, res) => {
//   try {
//     // const time = req.params.time;
//     // const localTime = moment(time, 'YYYY-MM-DD HH:mm:ss.SSSSSS');
//     // const utcTime = localTime.clone().utc();
//     // const differenceInMinutes = localTime.diff(utcTime, 'minutes');
//     const userid = req.params.userid;
//     const pageNo = req.params.pageNo;
//     const perPage = req.params.perPage;
//     const user = await User.findById(userid);
//     if (!user) {
//       throw Error("User Nots Found");
//     }
//     let activities = await Activity.find({ userid })
//       .skip((pageNo - 1) * perPage)
//       .limit(perPage)
//       .sort({ createdAt: "desc" })
//     var newActivities = [];
//     for (var i = 0; i < perPage; i++) {
//       var present = true;
//       var activity = activities[i]
//       if(activity.activityType == "story"){
//         var storyData = await Story.findOne({_id: activity.postid, expiresAt: { $gt: new Date()}});
//         if(!storyData){
//           present = false
//         }
//       }
//       if(activity.reelid){
//         var reel = await Reel.findById(activity.reelid)
//         if(!reel){
//           present = false;
//         }
//       }else if(activity.postid){
//         var post = await Post.findById(activity.postid)
//         if(!post){
//           present = false;
//         }
//       }else if(activity.streamid){
//         var stream = await Stream.findById(activity.streamid)
//         if(!stream){
//           present = false;
//         }
//       }
//       if(present){
//         newActivities.push(await getActivity(activity._id))
//       }else{
//         await activity.deleteOne();
//         i--;
//         activities = await Activity.find({ userid })
//         .skip((pageNo - 1) * perPage)
//         .limit(perPage)
//         .sort({ createdAt: "desc" })
//       }
//     }

//     await newActivities.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

//     res.status(200).json({
//       activities: newActivities
//     });
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };

const getActivities = async (req, res) => {
  try {
    const userId = req.params.userid;
    const pageNo = parseInt(req.params.pageNo) || 1;
    const perPage = parseInt(req.params.perPage) || 10;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: "User not found" });

    const newActivities = [];
    let skipCount = 0;

    while (newActivities.length < perPage) {
      const remaining = perPage - newActivities.length;

      // Fetch next batch (we fetch in chunks of 5–10 to avoid hitting DB too hard)
      const activities = await Activity.find({ userid: userId })
        .skip((pageNo - 1) * perPage + skipCount)
        .limit(remaining + 5) // fetch slightly more to reduce DB calls
        .sort({ createdAt: "desc" });

      if (activities.length === 0) break; // no more data

      const validBatch = await Promise.all(
        activities.map(async (activity) => {
          let isValid = true;

          if (activity.activityType === "story") {
            const story = await Story.findOne({
              _id: activity.postid,
              expiresAt: { $gt: new Date() },
            });
            if (!story) isValid = false;
          }

          if (activity.activityType === "withdrawal") {
            const withdraw = await Withdraw.findById(activity?.data?.withdrawid || "");
            if (!withdraw) isValid = false;
          }

          if (activity.reelid) {
            const reel = await Reel.findById(activity.reelid);
            if (!reel) isValid = false;
          } else if (activity.postid) {
            const post = await Post.findById(activity.postid);
            if (!post) isValid = false;
          } else if (activity.streamid) {
            const stream = await Stream.findById(activity.streamid);
            if (!stream) isValid = false;
          }

          if (isValid) {
            return await getActivity(activity._id);
          } else {
            await activity.deleteOne();
            return null;
          }
        })
      );

      // Add valid ones and increase skip count
      const filtered = validBatch.filter(Boolean);
      newActivities.push(...filtered);
      skipCount += activities.length;

      if (activities.length < remaining + 5) break;
    }

    return res.status(200).json({
      activities: newActivities.slice(0, perPage),
    });
  } catch (error) {
    console.error("Error in getActivities:", error);
    return res.status(400).json({ error: error.message });
  }
};



const getUpdatedActivities = async (req, res) => {
  try {
    var time = req.body.time;
    if(!time){
      time = new Date();
    }else{
      time = new Date(time);
    }
    const localTime = moment(time, 'YYYY-MM-DD HH:mm:ss.SSSSSS');
    console.log("time:",localTime);
    var utcTime = moment(new Date(), 'YYYY-MM-DD HH:mm:ss.SSSSSS');
    utcTime = utcTime.subtract(new Date().getTimezoneOffset(), 'minutes'); 
    console.log("utcTime: ", utcTime);
    
    const diff = moment.duration(utcTime.diff(localTime));
    console.log("diff: ", diff);
    // const diff = time.getTimezoneOffset();
    // console.log("diff: ", diff.asHours());
    // const differenceInMinutes = localTime.diff(utcTime, 'minutes');
    const userid = req.body.userid;
    const pageNo = req.body.pageNo;
    const perPage = req.body.perPage;
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Nots Found");
    }
    let activities = await Activity.find({ userid })
      .skip((pageNo - 1) * perPage)
      .limit(perPage)
      .sort({ createdAt: "desc" })
      .select("_id");

    activities = await Promise.all(
      activities.map((id) => {
        return getActivity(id, diff);
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

// const { getPicUrl } = require("./userController");

const getActivity = async (id, diff = null) => {
  let activity = await Activity.findById(id);

  try {
    const otherUser = await User.findById(activity.otheruserid);
    activity = activity.toObject();
    activity["ended"] = false;
    activity["contentType"] = "none"
    activity["sigthengineResults"] = []

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
      var streamCheck = await Stream.findById(activity.streamid);
      if(!streamCheck){
        activity["ended"] = true;
      }
    } else if (activity.postid) {
      const post = await Post.findById(activity.postid);
      if (post) {
        activity["sigthengineResults"] = post.sigthengineResults;
        activity.thumbnail = await getThumbnail(post._id);
        if(post.contents.length == 0){
          activity.hasContent = false
        }else{
          activity.hasContent = true;
          activity["contentType"] = await aws.getContentTypeFromAws(post.contents[0])
        }

        if(post.description && post.description != ""){
          activity.hasDescription = true;
        }else{
          activity.hasDescription = false
        }
        activity.description = post.description;
        activity.postType = post.postType

      } else {
        activity.thumbnail = "";
      }
    }else if(activity.voicemeetid){
      var voiceMeetCheck = await VoiceMeet.findById(activity.voicemeetid);
      if(!voiceMeetCheck){
        activity["ended"] = true;
      }
    }else if (activity.reelid) {
      const reel = await Reel.findById(activity.reelid);
      if (reel) {
        activity["sigthengineResults"] = reel.sightengineResults;
        activity.thumbnail = await aws.getLinkFromAWS(reel.thumbnail)
      } else {
        activity.thumbnail = "";
      }
    }

    // if(differenceInMinutes){
    //   let updatedTime = moment(activity.createdAt, 'YYYY-MM-DD HH:mm:ss.SSSSSS');
    //   updatedTime.add(differenceInMinutes, 'minutes');
    //   activity.createdAt = updatedTime
    // }

    if(diff){
      var activityTime = moment.utc(activity.createdAt, 'YYYY-MM-DD HH:mm:ss.SSS');
      console.log("created as: ", activity.createdAt);
      console.log("activity time : ", activityTime)
      activity.createdAt = activityTime.add(diff);
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


    var content = post.thumbnails[0];
    console.log("content: ", post.thumbnails[0])

    if (content) {
      var data = await aws.getLinkFromAWS(content);
      if(data == ""){
        content = post.contents[0];
      }
      data = await aws.getLinkFromAWS(content);
      console.log("data:",data);
      return data;
    }

    content = post.contents[0];
    console.log("content: ", post.contents[0])

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


const markAsRead = async (req, res) => {
  try{
  var {userid} = req.body;
  var activities = await Activity.find({
    userid: userid,
    read: false
  });

  await Promise.all(
    activities.map(async activity =>{
      await activity.updateOne({
          read: true
      })
    })
  )

  var socketActivity = global.onlineSockets.get(userid.toString());

  if (socketActivity) {
    var unreadCount = await Activity.countDocuments({userid: userid, read: false})
    for (const socket of socketActivity) {
      if (socket) {
        socket.emit("unreadActivitiesCount", {
          count: unreadCount
        });
      }
    }
  }

  res.status(200).json({
    message: "activity read"
  })
}catch(err){
  res.status(400).json({
    message: err.message
  })
}
};


const getUnreadCount = async (req, res) => {
  try{
      const userid = req.params.userid
  var activities = await Activity.countDocuments({
    userid: userid,
    read: false
  });
 
  res.status(200).json({
    count: activities
  })
}catch(err){
  res.status(400).json({
    message: err.message
  })
}
}


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

module.exports = { createActivity, getActivities, deleteActivity,markAsRead,getUnreadCount, getUpdatedActivities, resetActivities };
