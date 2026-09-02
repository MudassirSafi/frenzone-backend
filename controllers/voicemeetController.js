const VoiceMeet = require("../models/voicemeetModel");
const User = require("../models/userModel");
const Club = require("../models/clubModel");
const schedule = require('node-schedule');

const ScheduledVoiceMeet = require("../models/scheduledVoiceMeetModel");
const Activity = require("../models/activityModel");
const crypto = require("crypto");

const { generateRtcToken } = require("./agoraController");

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const { sendNotification } = require("./notificationController");
const { createActivity, resetActivities } = require("./activityController");
const { getPicUrl } = require("./userController");
const { aws } = require("../helpers/otherHelpers");

const idToString = (value) => (value?._id || value)?.toString();

const getClubOwnerId = (club) => (
  club.userid?._id ||
  club.userid ||
  club.owner?._id ||
  club.owner ||
  club.createdBy?._id ||
  club.createdBy
)?.toString();

const getClubMemberIds = (club) => (club.members || [])
  .map(idToString)
  .filter(Boolean);

const isClubOwnerOrMember = (club, userId) => {
  const normalizedUserId = userId?.toString();
  if (!normalizedUserId) return false;

  const ownerId = getClubOwnerId(club);
  const isOwner = ownerId === normalizedUserId;
  const isMember = getClubMemberIds(club).includes(normalizedUserId);
  return isOwner || isMember;
};

const createVoiceMeet = async (req, res) => {
  try {
    const requestedUserid = req.body.userid?.toString()
    const authenticatedUserid = (req.authUserId || req.userId)?.toString()
    const userid = authenticatedUserid || requestedUserid
    const clubid = req.body.clubid
    const roomid = req.body.roomid || null
    var members = Array.isArray(req.body.members) ? req.body.members : []
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }
    // club.members.push(club.userid);

    const user = await User.findById(userid);

    if (requestedUserid && authenticatedUserid && requestedUserid !== authenticatedUserid) {
      console.warn("createVoiceMeet userid mismatch; using authenticated user", {
        requestedUserid,
        authenticatedUserid,
        clubid: clubid?.toString(),
        roomid: roomid?.toString()
      });
    }

    if (!user || !isClubOwnerOrMember(club, userid)) {
      console.warn("createVoiceMeet auth failed", {
        requestedUserid,
        authenticatedUserid,
        effectiveUserid: userid?.toString(),
        clubid: clubid?.toString(),
        roomid: roomid?.toString(),
        userFound: !!user,
        ownerId: getClubOwnerId(club),
        memberIds: getClubMemberIds(club),
        isOwner: getClubOwnerId(club) === userid?.toString(),
        isMember: getClubMemberIds(club).includes(userid?.toString())
      });
      throw Error("User Not Found or is not member of this club");
    }
    
    if(user.isOnCall){
      let voicemeetCheck = await VoiceMeet.findOne({ clubid, userid, isActive: true });
      if(voicemeetCheck){
        throw Error("You are already in a call")
      }else{
        await user.updateOne({
          isOnCall: false
        })
      }
    }

    var channelName;
    var token;
    var usersData =[];
    const activeMeetQuery = { clubid, isActive: true };
    if (roomid) activeMeetQuery.roomid = roomid;
    let voicemeet = await VoiceMeet.findOne(activeMeetQuery);
    console.log("voicemeet: ", voicemeet)
    if(voicemeet){
      channelName = voicemeet.channelName;
      token = voicemeet.token;
      await Promise.all(
        voicemeet.members.map(async (member) => {
          var sockets = global.onlineSockets.get(member.toString());
          if (sockets) {
            var userData = await User.findById(member);
            for (const socket of sockets) {
              if (socket) {
                socket.emit("newUserJoined", {
                  username: userData.username,
                  profilePicture: await aws.getLinkFromAWS(userData.profilePicture)
                });
              }
            }
          }
        })
      )
      console.log('members: ', voicemeet.members)
      await Promise.all(
        voicemeet.members.map(async member => {
          var userData = await User.findById(member);
          console.log("member: ", member);
          console.log("uername: ", userData)
          if(userData){
            usersData.push(
              {
                username: userData.username,
                profilePicture: await aws.getLinkFromAWS(userData.profilePicture),
                admin: voicemeet.userid.toString() == userData._id.toString()
              }
            )
          }
        })
      )
    }else{
      channelName = randomName();
      token = generateRtcToken(channelName);

      voicemeet = await VoiceMeet.create({
        clubid,
        channelName,
        token,
        userid,
        roomid
      });

      await Promise.all(
        members.map(async (member) => {
          if(member != userid){
            await sendNotification(
              member,
              "VoiceMeet started",
              `${user.firstname + " " + user.lastname} started a club call mutual to you`
            );
            await createActivity(
              member,
              userid,
              `Started a club call`,
              null,
              null,
              channelName,
              token,
              voicemeet._id,
              undefined,
              undefined,
              undefined,
              {
                clubid
              }
            );
          }
        })
      );
    }


    if(!voicemeet.members.includes(userid)){
      await voicemeet.updateOne({
        $push: { members: userid },
      });
    }

    var profilePic = await getPicUrl(user._id);
    await user.updateOne({
      isOnCall: true
    })
    res.status(200).json({
      _id: voicemeet._id,
      channelName,
      token,
      username: user.username,
      profilePic,
      usersData,
      roomid: voicemeet.roomid
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getActiveVoiceChannelsForClub = async (req, res) => {
  try {
    const { clubid } = req.params;
    const activeMeets = await VoiceMeet.find({ clubid, isActive: true })
      .select("_id roomid members")
      .lean();

    const channels = activeMeets
      .filter(meet => meet.roomid)
      .map(meet => ({
        voiceMeetId: meet._id,
        roomid: meet.roomid,
        memberCount: new Set(
          (meet.members || []).map(member => member.toString())
        ).size,
      }));

    res.status(200).json({ success: true, channels });
  } catch (error) {
    res.status(400).json({ success: false, error: error.message });
  }
};

const addMembers = async (req, res) => {
  try {
    const streamid = req.body.streamid
    var members = req.body.members
    var userid = req.body.userid

    const user = await User.findById(userid);
    if(!userid){
      res.status(400).json({
        success: false,
        message: "userid invalid"
      })
      return;
    }

    let voicemeet = await VoiceMeet.findById(streamid);
    if(!voicemeet){
      res.status(400).json({
        success: false,
        message: "voicemeet invalid"
      })
      return;
    }
    var channelName = voicemeet.channelName;
    var token = voicemeet.token;
    await Promise.all(
      members.map(async (member) => {
        // if(member != userid){
          await sendNotification(
            member,
            "VoiceMeet started",
            `${user.firstname + " " + user.lastname} started a club call mutual to you`
          );
          await createActivity(
            member,
            userid,
            `Started a club call`,
            null,
            null,
            channelName,
            token,
            voicemeet._id,
              undefined,
              undefined,
              undefined,
              {
                clubid: voicemeet.clubid
              }
          );
        // }
      })
    );

    res.status(200).json({
      success: true,
      message: "invite sent"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const scheduleVoiceMeet = async (req, res) => {
  try {
    const { userid, clubid, scheduleTime } = req.body;
    var members = req.body.members
    const club = await Club.findById(clubid);
    if (!club) {
      
      res.status(400).json({
        success: false,
        message: "Club Not Found"
      })
      return;
    }
    // club.members.push(club.userid);

    const user = await User.findById(userid);
    if (!user || !isClubOwnerOrMember(club, userid)) {
      
      res.status(400).json({
        success: false,
        message: "User Not Found or is not member of this club"
      })
      return;
    }

    // if(user.isOnCall){
      
    //   res.status(400).json({
    //     success: false,
    //     message: "You are already in a call"
    //   })
    //   return;
    // }

    // let scheduledVoiceMeet = await ScheduledVoiceMeet.find({ userid, clubid });
    // if (scheduledVoiceMeet.length != 0) {
    //   res.status(400).json({
    //     success: false,
    //     message: "A VoiceMeet is already scheduled"
    //   })
    //   return;
    // }

    let scheduledVoiceMeet = await ScheduledVoiceMeet.create({
      userid,
      clubid,
      scheduleTime
    });

    var timeRemaining = getTimeRemaining(scheduleTime);
    if(!timeRemaining.success){
      res.status(400).json({
        success: false,
        message: timeRemaining.message
      })
      return;
    }

    await Promise.all(
      members.map(async (followerid) => {
        if(followerid != userid){
          await sendNotification(
            followerid,
            `${user.firstname + " " + user.lastname} has scheduled a voice meet`,
            `Scheduled ${timeRemaining.days}days ${timeRemaining.hours}hours ${timeRemaining.minutes}minutes from now`
          );
          await createActivity(
            followerid,
            user._id,
            `scheduled voice meet ${timeRemaining.days}days ${timeRemaining.hours}hours ${timeRemaining.minutes}minutes from now`
          );
        }
      })
    );

    const target = new Date(scheduleTime);

    if (isNaN(target.getTime())) {
      res.status(400).json({
        success: false,
        message: 'Invalid date provided'
      })
      return;
    }

    const oneHourBefore = new Date(target.getTime() - 60 * 60 * 1000);

    if (oneHourBefore >= new Date()) {
      schedule.scheduleJob(oneHourBefore, async ()=>{
        await Promise.all(
          members.map(async (followerid) => {
            if(followerid != userid){
              await sendNotification(
                followerid,
                `${user.firstname + " " + user.lastname} voice meet reminder`,
                `Only 1 hour remaining`
              );
              await createActivity(
                followerid,
                user._id,
                `Only 1 hour remaining`
              );
            }
          })
        );
        await sendNotification(
              user._id,
              `Voice meet reminder`,
              `Only 1 hour remaining to start voice meet`
            );
            await createActivity(
              user._id,
              user._id,
              `Only 1 hour remaining to start voice meet`
            );
      });
    }

    schedule.scheduleJob(target, async ()=>{
      await sendNotification(
            user._id,
            `Voice meet reminder`,
            `Its time to start the voice meet`
      );
      await createActivity(
        user._id,
        user._id,
        `Its time to start the voice meet`,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "startvoicemeet"
      );
    });

    res.status(200).json({
      success: true,
      message: "Voice meet scheduled successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

function getTimeRemaining(targetTime) {
  const now = new Date();
  const future = new Date(targetTime);

  if (isNaN(future.getTime())) {
    return {
      success: false,
      message: "Invalid date provided."
    }
  }

  const diffMs = future - now;

  if (diffMs <= 0) {
    return {
      success: false,
      message: "The given time is in the past."
    }
  }

  const diffMinutes = Math.floor(diffMs / 60000);
  const days = Math.floor(diffMinutes / (60 * 24));
  const hours = Math.floor((diffMinutes % (60 * 24)) / 60);
  const minutes = diffMinutes % 60;
  
  return {
    success: true,
    days,
    hours,
    minutes
  }
}

const sendInvite = async (req, res) => {
  try {
    const { userid, streamid, channel, token } = req.body;

    const user = await User.findById(userid);
    const stream = await VoiceMeet.findById(streamid);

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
    const stream = await VoiceMeet.findById(streamid);

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

const deleteStream = async (req, res) => {
  try {
    const streamid = req.body.streamid;
    const stream = await VoiceMeet.findById(streamid);

    const userid = stream.userid;
    const user = await User.findById(userid);

    if (!stream) {
      throw Error("Stream Not Found");
    }
    const members = stream.members;

    for (const member of members) {
    var sockets = global.onlineSockets.get(member.toString());

    if (sockets) {
      for (const socket of sockets) {
        if (socket) {
          socket.emit("streamended", {
            streamid
          });
        }
      }
    }
  }

    await VoiceMeet.findByIdAndDelete(streamid);

    await user.updateOne({
      isOnCall: false,
    });

    await Activity.deleteMany({voicemeetid: streamid})


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
    const stream = await VoiceMeet.findOne({ userid, isActive: true });
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

const getStreamsOfFollowing = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const following = user.following;
    console.log(following);
    const streams = await VoiceMeet.find({ userid: { $in: following } });

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
    const stream = await VoiceMeet.findById(streamid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!stream || !stream.isActive) {
      throw Error("Stream Not Found");
    }

    if (stream.blocked.includes(userid)) {
      throw Error("User Blocked");
    }

    const token = stream.token;
    if (!stream.members.includes(userid)) {
      // await stream.updateOne({
        //   $push: { members: userid },
      // });
      stream.members.push(userid);
      await stream.save();
    }

    const members = stream.members;
    var membersData = [];
    console.log("members: ", members);
    var memberCount = stream.members.length;
    
    for (const member of members) {
      var sockets = global.onlineSockets.get(member.toString());

      if (sockets) {
        for (const socket of sockets) {
          if (socket) {
            socket.emit("memberCount", {
              memberCount
            });
          }
        }
      }
    }

    await Promise.all(
      stream.members.map(async (member) => {
        var sockets = global.onlineSockets.get(member.toString());
        var userData = await User.findById(member.toString());
        membersData.push({
          _id: userData._id.toString(),
          username: userData.username,
          profilePicture: await aws.getLinkFromAWS(userData.profilePicture)
        })

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("newUserJoined", {
                _id: user._id.toString(),
                username: user.username,
                profilePicture: await aws.getLinkFromAWS(user.profilePicture)
              });
            }
          }
        }
      })
    )

    await user.updateOne({
      isOnCall: true
    })

    res.status(200).json({
      _id: stream._id,
      channelName: stream.channelName,
      token,
      members: membersData
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};



const leaveVoiceMeet = async (req, res) => {
  try {
    const userid = req.body.userid
    const clubid = req.body.clubid
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }

    const user = await User.findById(userid);
    if (!user || !isClubOwnerOrMember(club, userid)) {
      throw Error("User Not Found or is not member of this club");
    }

    if(!user.isOnCall){
      throw Error("You are not on call")
    }


    let voicemeet = await VoiceMeet.findOne({ clubid, isActive: true });
    if(!voicemeet){
      throw Error("voice meet not found")
    }

    if(voicemeet.members.includes(userid)){
      await voicemeet.updateOne({
        $pull: { members: userid },
      });
    }

    await resetActivities({
      userid,
      voicemeetid: voicemeet._id
    })

    await user.updateOne({
      isOnCall: false
    })
    
    res.status(200).json({
      _id: voicemeet._id,
      message: "You left the voice call"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};


const kickUser = async (req, res) => {
  try {
    const userid = req.body.userid
    const clubid = req.body.clubid
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }

    const user = await User.findById(userid);
    if (!user || !isClubOwnerOrMember(club, userid)) {
      throw Error("User Not Found or is not member of this club");
    }

    if(!user.isOnCall){
      throw Error("User is not on call")
    }


    let voicemeet = await VoiceMeet.findOne({ clubid, isActive: true });
    if(!voicemeet){
      throw Error("voice meet not found")
    }
    
    await Promise.all(
      voicemeet.members.map(async (member) => {
        var sockets = global.onlineSockets.get(member.toString());

        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("userKicked", {
                _id: user._id.toString(),
                username: user.username,
                profilePicture: await aws.getLinkFromAWS(user.profilePicture)
              });
            }
          }
        }
      })
    )

    if(voicemeet.members.includes(userid)){
      await voicemeet.updateOne({
        $pull: { members: userid },
      });
    }

    await resetActivities({
      userid,
      voicemeetid: voicemeet._id
    })

    await user.updateOne({
      isOnCall: false
    })

    res.status(200).json({
      _id: voicemeet._id,
      message: "user kicked out"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};


const getViewers = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await VoiceMeet.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    let members = stream.members;

    members = await Promise.all(
      members.map(async (id) => {
        let user = await User.findById(id);
        if (user) {
          let isModerator = false;
          if (stream.moderators.includes(id)) {
            isModerator = true;
          }

          return {
            _id: user._id,
            username: user.username,
            profilePic: await getPicUrl(id),
            isModerator,
            isHost: stream.userid.toString() == user._id.toString()
          };
        }
      })
    );

    res.status(200).json({
      members,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getViewersCount = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await VoiceMeet.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    let members = stream.members;
    var memberCount = members.length

    res.status(200).json({
      memberCount,
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
    const stream = await VoiceMeet.findById(streamid);
    if (!stream) {
      throw Error("Stream Not Found");
    }
    if (stream.members.includes(userid)) {
      await stream.updateOne({
        $push: { moderators: userid },
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

const removeModerator = async (req, res) => {
  try {
    const { userid, streamid } = req.body;
    const stream = await VoiceMeet.findById(streamid);
    if (!stream) {
      throw Error("Stream Not Found");
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

const getModerators = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await VoiceMeet.findById(streamid);

    if (!stream) {
      throw Error("Stream Not Found");
    }

    let moderators = stream.moderators;

    moderators = await Promise.all(
      moderators.map(async (id) => {
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
      moderators,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getBlocked = async (req, res) => {
  try {
    const { streamid } = req.params;
    const stream = await VoiceMeet.findById(streamid);

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

// ========== NEW X-SPACE STYLE VOICE CHAT APIs ==========

// Request to speak (Listener workflow)
const requestToSpeak = async (req, res) => {
  try {
    const { userid, voicemeetid } = req.body;
    
    const user = await User.findById(userid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user) {
      throw Error("User Not Found");
    }
    if (!voicemeet) {
      throw Error("Voice Meet Not Found");
    }
    if (!voicemeet.isActive) {
      throw Error("Voice Meet has ended");
    }
    if (voicemeet.bannedUsers.includes(userid)) {
      throw Error("You are banned from this voice chat");
    }
    if (voicemeet.speakers.includes(userid)) {
      throw Error("You are already a speaker");
    }
    
    // Check if request already exists
    const existingRequest = voicemeet.speakingRequests.find(
      req => req.userid.toString() === userid.toString()
    );
    
    if (existingRequest) {
      throw Error("You have already requested to speak");
    }
    
    // Add speaking request
    voicemeet.speakingRequests.push({
      userid,
      requestedAt: new Date()
    });
    await voicemeet.save();
    
    // Notify host and moderators
    const notifyUsers = [voicemeet.userid, ...voicemeet.moderators, ...voicemeet.coHosts];
    await Promise.all(
      notifyUsers.map(async (notifyUserId) => {
        if (notifyUserId.toString() !== userid.toString()) {
          await sendNotification(
            notifyUserId,
            "Speaking Request",
            `${user.firstname} ${user.lastname} requested to speak`,
            {
              action: "speakingRequest",
              voicemeetid: voicemeet._id,
              userid: user._id
            }
          );
        }
      })
    );
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("speakingRequest", {
                voicemeetid: voicemeet._id,
                requester: {
                  userid: user._id.toString(),
                  username: user.username,
                  profilePicture: await aws.getLinkFromAWS(user.profilePicture)
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Speaking request sent"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Approve speaking request (Host/Moderator/Co-Host)
const approveSpeakingRequest = async (req, res) => {
  try {
    const { userid, voicemeetid, requesterid } = req.body;
    
    const user = await User.findById(userid);
    const requester = await User.findById(requesterid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !requester || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to approve requests");
    }
    
    // Remove from speaking requests
    voicemeet.speakingRequests = voicemeet.speakingRequests.filter(
      req => req.userid.toString() !== requesterid.toString()
    );
    
    // Add to speakers if not already
    if (!voicemeet.speakers.includes(requesterid)) {
      voicemeet.speakers.push(requesterid);
    }
    
    // Remove from listeners if present
    voicemeet.listeners = voicemeet.listeners.filter(
      id => id.toString() !== requesterid.toString()
    );
    
    await voicemeet.save();
    
    // Notify requester
    await sendNotification(
      requesterid,
      "Speaking Request Approved",
      `Your request to speak has been approved`,
      {
        action: "speakingApproved",
        voicemeetid: voicemeet._id
      }
    );
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("speakingRequestApproved", {
                voicemeetid: voicemeet._id,
                requesterid: requester._id.toString(),
                requester: {
                  userid: requester._id.toString(),
                  username: requester.username,
                  profilePicture: await aws.getLinkFromAWS(requester.profilePicture)
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Speaking request approved"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Deny speaking request (Host/Moderator/Co-Host)
const denySpeakingRequest = async (req, res) => {
  try {
    const { userid, voicemeetid, requesterid } = req.body;
    
    const user = await User.findById(userid);
    const requester = await User.findById(requesterid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !requester || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to deny requests");
    }
    
    // Remove from speaking requests
    voicemeet.speakingRequests = voicemeet.speakingRequests.filter(
      req => req.userid.toString() !== requesterid.toString()
    );
    await voicemeet.save();
    
    // Notify requester
    await sendNotification(
      requesterid,
      "Speaking Request Denied",
      `Your request to speak has been denied`,
      {
        action: "speakingDenied",
        voicemeetid: voicemeet._id
      }
    );
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("speakingRequestDenied", {
                voicemeetid: voicemeet._id,
                requesterid: requester._id.toString(),
                requester: {
                  userid: requester._id.toString(),
                  username: requester.username,
                  profilePicture: await aws.getLinkFromAWS(requester.profilePicture)
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Speaking request denied"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Mute speaker (Hard mute - Host/Moderator/Co-Host)
const muteSpeaker = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid, muteType = "hard" } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to mute users");
    }
    
    if (muteType === "hard") {
      // Hard mute - cannot unmute themselves
      if (!voicemeet.hardMuted.includes(targetUserid)) {
        voicemeet.hardMuted.push(targetUserid);
      }
      // Remove from soft muted if present
      voicemeet.softMuted = voicemeet.softMuted.filter(
        id => id.toString() !== targetUserid.toString()
      );
    } else {
      // Soft mute - can unmute themselves
      if (!voicemeet.softMuted.includes(targetUserid)) {
        voicemeet.softMuted.push(targetUserid);
      }
      // Remove from hard muted if present
      voicemeet.hardMuted = voicemeet.hardMuted.filter(
        id => id.toString() !== targetUserid.toString()
      );
    }
    
    await voicemeet.save();
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("userMuted", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                muteType,
                mutedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: `User ${muteType} muted successfully`
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Unmute speaker (Host/Moderator/Co-Host)
const unmuteSpeaker = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions OR user unmuting themselves (if soft muted)
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    const isSelfUnmute = userid.toString() === targetUserid.toString();
    const isSoftMuted = voicemeet.softMuted.includes(targetUserid);
    
    if (!isHost && !isModerator && !isCoHost && !(isSelfUnmute && isSoftMuted)) {
      throw Error("You don't have permission to unmute users");
    }
    
    // Cannot self-unmute if hard muted
    if (isSelfUnmute && voicemeet.hardMuted.includes(targetUserid)) {
      throw Error("You cannot unmute yourself (hard muted)");
    }
    
    // Remove from muted lists
    voicemeet.hardMuted = voicemeet.hardMuted.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.softMuted = voicemeet.softMuted.filter(
      id => id.toString() !== targetUserid.toString()
    );
    
    await voicemeet.save();
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("userUnmuted", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                unmutedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "User unmuted successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Assign Co-Host (Host only)
const assignCoHost = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Only host can assign co-host
    if (voicemeet.userid.toString() !== userid.toString()) {
      throw Error("Only host can assign co-host");
    }
    
    if (voicemeet.coHosts.includes(targetUserid)) {
      throw Error("User is already a co-host");
    }
    
    voicemeet.coHosts.push(targetUserid);
    await voicemeet.save();
    
    // Notify target user
    await sendNotification(
      targetUserid,
      "Co-Host Assigned",
      `You have been assigned as co-host`,
      {
        action: "coHostAssigned",
        voicemeetid: voicemeet._id
      }
    );
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("coHostAssigned", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                assignedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Co-host assigned successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Assign Moderator (Host/Co-Host)
const assignModerator = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isCoHost) {
      throw Error("You don't have permission to assign moderators");
    }
    
    if (voicemeet.moderators.includes(targetUserid)) {
      throw Error("User is already a moderator");
    }
    
    voicemeet.moderators.push(targetUserid);
    await voicemeet.save();
    
    // Notify target user
    await sendNotification(
      targetUserid,
      "Moderator Assigned",
      `You have been assigned as moderator`,
      {
        action: "moderatorAssigned",
        voicemeetid: voicemeet._id
      }
    );
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("moderatorAssigned", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                assignedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Moderator assigned successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Move to Listener (Host/Moderator/Co-Host)
const moveToListener = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to move users");
    }
    
    // Remove from speakers
    voicemeet.speakers = voicemeet.speakers.filter(
      id => id.toString() !== targetUserid.toString()
    );
    
    // Add to listeners if not already
    if (!voicemeet.listeners.includes(targetUserid)) {
      voicemeet.listeners.push(targetUserid);
    }
    
    // Remove from muted lists
    voicemeet.hardMuted = voicemeet.hardMuted.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.softMuted = voicemeet.softMuted.filter(
      id => id.toString() !== targetUserid.toString()
    );
    
    await voicemeet.save();
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("movedToListener", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                movedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "User moved to listener"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Remove from Space (Host/Moderator/Co-Host)
const removeFromSpace = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to remove users");
    }
    
    // Remove from all lists
    voicemeet.members = voicemeet.members.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.speakers = voicemeet.speakers.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.listeners = voicemeet.listeners.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.speakingRequests = voicemeet.speakingRequests.filter(
      req => req.userid.toString() !== targetUserid.toString()
    );
    voicemeet.hardMuted = voicemeet.hardMuted.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.softMuted = voicemeet.softMuted.filter(
      id => id.toString() !== targetUserid.toString()
    );
    
    await voicemeet.save();
    
    // Update user status
    await targetUser.updateOne({
      isOnCall: false
    });
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("removedFromSpace", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                removedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    // Also notify the removed user
    const targetSockets = global.onlineSockets.get(targetUserid.toString());
    if (targetSockets) {
      for (const socket of targetSockets) {
        if (socket) {
          socket.emit("removedFromSpace", {
            voicemeetid: voicemeet._id,
            targetUserid: targetUser._id.toString(),
            removedBy: {
              userid: user._id.toString(),
              username: user.username
            }
          });
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: "User removed from space"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Ban user (Host/Moderator/Co-Host)
const banUser = async (req, res) => {
  try {
    const { userid, voicemeetid, targetUserid } = req.body;
    
    const user = await User.findById(userid);
    const targetUser = await User.findById(targetUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !targetUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to ban users");
    }
    
    // Add to banned users
    if (!voicemeet.bannedUsers.includes(targetUserid)) {
      voicemeet.bannedUsers.push(targetUserid);
    }
    
    // Remove from all lists
    voicemeet.members = voicemeet.members.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.speakers = voicemeet.speakers.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.listeners = voicemeet.listeners.filter(
      id => id.toString() !== targetUserid.toString()
    );
    voicemeet.speakingRequests = voicemeet.speakingRequests.filter(
      req => req.userid.toString() !== targetUserid.toString()
    );
    
    await voicemeet.save();
    
    // Update user status
    await targetUser.updateOne({
      isOnCall: false
    });
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("userBanned", {
                voicemeetid: voicemeet._id,
                targetUserid: targetUser._id.toString(),
                targetUser: {
                  userid: targetUser._id.toString(),
                  username: targetUser.username,
                  profilePicture: await aws.getLinkFromAWS(targetUser.profilePicture)
                },
                bannedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    // Also notify the banned user
    const targetSockets = global.onlineSockets.get(targetUserid.toString());
    if (targetSockets) {
      for (const socket of targetSockets) {
        if (socket) {
          socket.emit("userBanned", {
            voicemeetid: voicemeet._id,
            targetUserid: targetUser._id.toString(),
            bannedBy: {
              userid: user._id.toString(),
              username: user.username
            }
          });
        }
      }
    }
    
    res.status(200).json({
      success: true,
      message: "User banned successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Report user in space (Any user)
const reportUserInSpace = async (req, res) => {
  try {
    const { userid, voicemeetid, reportedUserid, reason, reportType } = req.body;
    
    const user = await User.findById(userid);
    const reportedUser = await User.findById(reportedUserid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !reportedUser || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Valid report types from workflow
    const validTypes = ["nudity", "harassment", "hate_speech", "scam", "underage", "spam"];
    if (reportType && !validTypes.includes(reportType)) {
      throw Error(`Invalid report type. Must be one of: ${validTypes.join(", ")}`);
    }
    
    // Create report (you may want to create a VoiceMeetReport model)
    // For now, we'll use the existing report system
    const Report = require("../models/reportModel");
    await Report.create({
      reportedUser: reportedUserid,
      reportedBy: userid,
      reason: reason || `Reported from voice chat: ${reportType || "general"}`,
      reportedAt: new Date()
    });
    
    // Notify moderators and host
    const notifyUsers = [voicemeet.userid, ...voicemeet.moderators, ...voicemeet.coHosts];
    await Promise.all(
      notifyUsers.map(async (notifyUserId) => {
        await sendNotification(
          notifyUserId,
          "User Reported",
          `${user.firstname} ${user.lastname} reported ${reportedUser.firstname} ${reportedUser.lastname} in voice chat`,
          {
            action: "userReported",
            voicemeetid: voicemeet._id,
            reportedUserid: reportedUser._id
          }
        );
      })
    );
    
    // Emit socket event to all members (for transparency, or only to moderators if preferred)
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("userReported", {
                voicemeetid: voicemeet._id,
                reportedUserid: reportedUser._id.toString(),
                reportedUser: {
                  userid: reportedUser._id.toString(),
                  username: reportedUser.username,
                  profilePicture: await aws.getLinkFromAWS(reportedUser.profilePicture)
                },
                reportedBy: {
                  userid: user._id.toString(),
                  username: user.username
                },
                reportType,
                reason
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "User reported successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// React with emoji (Listener/Speaker)
const reactWithEmoji = async (req, res) => {
  try {
    const { userid, voicemeetid, emoji } = req.body;
    
    const user = await User.findById(userid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    if (!voicemeet.isActive) {
      throw Error("Voice Meet has ended");
    }
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("emojiReaction", {
                userid: user._id.toString(),
                username: user.username,
                profilePicture: await aws.getLinkFromAWS(user.profilePicture),
                emoji,
                voicemeetid: voicemeet._id
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Reaction sent"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Share room (Any user)
const shareRoom = async (req, res) => {
  try {
    const { userid, voicemeetid } = req.body;
    
    const user = await User.findById(userid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Return shareable link/info
    const shareData = {
      voicemeetid: voicemeet._id,
      title: voicemeet.title || "Voice Chat",
      topic: voicemeet.topic || "",
      host: {
        username: (await User.findById(voicemeet.userid)).username,
        profilePicture: await aws.getLinkFromAWS((await User.findById(voicemeet.userid)).profilePicture)
      }
    };
    
    res.status(200).json({
      success: true,
      shareData,
      message: "Room share data retrieved"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// End voice chat (Host only)
const endVoiceChat = async (req, res) => {
  try {
    const { userid, voicemeetid } = req.body;
    
    const user = await User.findById(userid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Only host can end the room
    if (voicemeet.userid.toString() !== userid.toString()) {
      throw Error("Only host can end the voice chat");
    }
    
    if (!voicemeet.isActive) {
      throw Error("Voice chat is already ended");
    }
    
    // Calculate summary
    const duration = Math.floor((new Date() - voicemeet.startedAt) / 1000); // seconds
    const totalListeners = voicemeet.listeners.length + voicemeet.members.filter(
      id => !voicemeet.speakers.includes(id)
    ).length;
    const maxConcurrentListeners = voicemeet.members.length; // Simplified
    const activeSpeakers = voicemeet.speakers.length;
    
    // Update voicemeet
    voicemeet.isActive = false;
    voicemeet.endedAt = new Date();
    voicemeet.summary = {
      totalListeners,
      maxConcurrentListeners,
      activeSpeakers,
      duration
    };
    await voicemeet.save();
    
    // Notify all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("voiceChatEnded", {
                voicemeetid: voicemeet._id,
                summary: voicemeet.summary
              });
            }
          }
        }
        
        // Update user status
        const memberUser = await User.findById(member);
        if (memberUser) {
          await memberUser.updateOne({
            isOnCall: false
          });
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Voice chat ended",
      summary: voicemeet.summary
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Pin message (Host/Moderator/Co-Host) - placeholder for future chat feature
const pinMessage = async (req, res) => {
  try {
    const { userid, voicemeetid, messageid } = req.body;
    
    const user = await User.findById(userid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to pin messages");
    }
    
    // Add to pinned messages
    if (!voicemeet.pinnedMessages.includes(messageid)) {
      voicemeet.pinnedMessages.push(messageid);
      await voicemeet.save();
    }
    
    // Emit socket event to all members
    await Promise.all(
      voicemeet.members.map(async (member) => {
        const sockets = global.onlineSockets.get(member.toString());
        if (sockets) {
          for (const socket of sockets) {
            if (socket) {
              socket.emit("messagePinned", {
                voicemeetid: voicemeet._id,
                messageid,
                pinnedBy: {
                  userid: user._id.toString(),
                  username: user.username
                }
              });
            }
          }
        }
      })
    );
    
    res.status(200).json({
      success: true,
      message: "Message pinned successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

// Get speaking requests (Host/Moderator/Co-Host)
const getSpeakingRequests = async (req, res) => {
  try {
    const { userid } = req.params;
    const { voicemeetid } = req.query;
    
    const user = await User.findById(userid);
    const voicemeet = await VoiceMeet.findById(voicemeetid);
    
    if (!user || !voicemeet) {
      throw Error("User or Voice Meet Not Found");
    }
    
    // Check permissions
    const isHost = voicemeet.userid.toString() === userid.toString();
    const isModerator = voicemeet.moderators.includes(userid);
    const isCoHost = voicemeet.coHosts.includes(userid);
    
    if (!isHost && !isModerator && !isCoHost) {
      throw Error("You don't have permission to view speaking requests");
    }
    
    // Get user details for each request
    const requests = await Promise.all(
      voicemeet.speakingRequests.map(async (req) => {
        const requester = await User.findById(req.userid);
        return {
          userid: requester._id,
          username: requester.username,
          profilePicture: await aws.getLinkFromAWS(requester.profilePicture),
          requestedAt: req.requestedAt
        };
      })
    );
    
    res.status(200).json({
      success: true,
      requests
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

module.exports = {
  createVoiceMeet,
  leaveVoiceMeet,
  deleteStream,
  getStreamsOfFollowing,
  joinStream,
  getStreamByUserId,
  getActiveVoiceChannelsForClub,
  getViewers,
  getViewersCount,
  getModerators,
  makeModerator,
  removeModerator,
  getBlocked,
  sendInvite,
  sendAudianceInvite,
  scheduleVoiceMeet,
  addMembers,
  kickUser,
  // New X-Space style APIs
  requestToSpeak,
  approveSpeakingRequest,
  denySpeakingRequest,
  muteSpeaker,
  unmuteSpeaker,
  assignCoHost,
  assignModerator,
  moveToListener,
  removeFromSpace,
  banUser,
  reportUserInSpace,
  reactWithEmoji,
  shareRoom,
  endVoiceChat,
  pinMessage,
  getSpeakingRequests
};
