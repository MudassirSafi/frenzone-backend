const Activities = require("../models/activitiesModel")
const User = require("../models/userModel")
const { getPicUrl } = require("../controllers/userController");
const {sendNotification} = require("../controllers/notificationController")



async function updateActivity(memberSender, modelid, type, memberReceiverId){
  var computedModelId;
  if(modelid != ""){
      computedModelId = modelid;
  }
  var picURL = await getPicUrl(memberSender._id);
  var activity = {
      sender:{
          senderid: memberSender._id,
          username: memberSender.username,
          email: memberSender.email,
          profilePicture: picURL,
          gender: memberSender.gender
      },
      modelid: computedModelId,
      type
    };

    await Activities.findOneAndUpdate(
      { userid: memberReceiverId },
      { $push: { activities: activity } },
      { new: true }
    );

      var notificationsInfo = {
        acceptedFRequest: {
          title: "Friend request Accepted",
          body: `${memberSender.username} accepted your friend request`
        }, 
        rejectedFRequest: {
          title: "Friend request rejected",
          body: `${memberSender.username} `
        }, 
        fRequest: {
          title: "New friend request",
          body: `${memberSender.username} sent you a friend request` 
        }, 
        disapprovedAlert: {
          title: "Alert disapproved",
          body: `${memberSender.username} ` 
        }, 
        approvedAlert: {
          title: "Alert approved",
          body: `${memberSender.username} ` 
        }, 
        nearbyIncident: {
          title: "Incident nearby",
          body: `${memberSender.username} posted an incident near you!` 
        }, 
        startedStream: {
          title: "New stream started",
          body: `${memberSender.username} started a new stream` 
        },
        postDislike: {
          title: "Post disliked",
          body: `${memberSender.username} disliked your post` 
        }, 
        postLike: {
          title: "Post liked",
          body: `${memberSender.username} liked your post` 
        }, 
        postCommented: {
          title: "New comment on post",
          body: `${memberSender.username} post new comment on your post` 
        }, 
        postCommentLiked: {
          title: "Comment liked",
          body: `${memberSender.username} liked your comment` 
        }, 
        postCommentUnLiked: {
          title: "Comment unliked",
          body: `${memberSender.username} unliked your comment` 
        }, 
        alertLiked: {
          title: "Alert liked",
          body: `${memberSender.username} liked your alert` 
        }, 
        alertUnLiked: {
          title: "Alert Disliked",
          body: `${memberSender.username} disliked your alert` 
        }, 
        alertCommented: {
          title: "New comment on alert",
          body: `${memberSender.username} posted a new comment on your alert` 
        }, 
        alertCommentLiked: {
          title: "Comment liked",
          body: `${memberSender.username} liked you comment` 
        }, 
        alertCommentUnLiked: {
          title: "Comment disliked",
          body: `${memberSender.username} disliked your comment` 
        }
      }

      sendNotification(memberReceiverId, notificationsInfo[type].title,notificationsInfo[type].body );

}

async function updateSenderPic(activitiesMain){
  var activities = activitiesMain.toObject().activities;
    await Promise.all(
      activities.map(async (activity) => {
        var activity = activity;
        var sender = activity.sender;
        var picURL = await getPicUrl(sender.senderid);
        sender.profilePicture = picURL;
        activity.sender = sender;
      })
    );
    // console.log("activities: ", activities);
    activitiesMain.activities = activities;
    // console.log("activities Main: ", activitiesMain)

    return activitiesMain
}

function isLessThanDaysAgo(timestamp, days) {
  timestamp = Date.parse(timestamp) - (5 * 60 * 60 * 1000)
  var currentTimestamp = Date.now();

  var timeDifference = currentTimestamp - timestamp;

  var hoursDifference = timeDifference / (1000 * 60 * 60);

  return hoursDifference < ( days * 24 );
}

module.exports = { updateActivity, isLessThanDaysAgo, updateSenderPic }