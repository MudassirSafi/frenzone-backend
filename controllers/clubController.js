const User = require("../models/userModel");
const Admin = require("../models/adminModel");
const Club = require("../models/clubModel");
const ClubRoom = require("../models/clubRoomModel");
const Wallet = require("../models/walletModel");
const Subscription = require("../models/subscriptionModel");
const ClubChat = require("../models/clubChatModel");
const Stream = require("../models/streamModel");
const { createTransaction } = require('./globalTransactionController');

const { generateRtcToken } = require("./agoraController");
const { aws } = require("../helpers/otherHelpers");
const { sendNotification } = require("./notificationController");
const { createActivity } = require("./activityController");
const { markOnboardingTask } = require("../helpers/newUserOnboardingHelper");
const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const crypto = require("crypto");

require("dotenv").config();

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const clubRoomDebug = (step, data = {}) => {
  console.log(`[CLUB_ROOM_DEBUG] ${step}`, JSON.stringify(data, null, 2));
};

const idToString = (id) => id?.toString?.() ?? String(id);
const isSameId = (left, right) => idToString(left) === idToString(right);
const memberIdsWithoutOwner = (members = [], ownerId) => {
  if (typeof members === "string") {
    try {
      members = JSON.parse(members);
    } catch (error) {
      members = [];
    }
  }
  if (!Array.isArray(members)) members = [];

  const uniqueMembers = new Set();

  members.forEach((member) => {
    if (!member || isSameId(member, ownerId)) return;
    uniqueMembers.add(idToString(member));
  });

  return [...uniqueMembers];
};

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const { getPicUrl } = require("./userController");

const createClub = async (req, res) => {
  try {
    var {
      userid,
      privateChatRooms,
      pictureSharing,
      liveChatRooms,
      voiceCall,
      fee,
      name
    } = req.body;

    const user = await User.findById(userid);
    if (!user) {
      res.status(400).json({
        success: false,
        error: "User not found"
      })
      return;
    }
    if(user.clubid && await Club.findById(user.clubid)){
      res.status(400).json({
        success: false,
        error: "You already have a club"
      })
      return;
    }

    var image = null
    if(req.file){
      image = await aws.uploadToAWS(req.file);
    }
    const club = await Club.create({
      userid,
      privateChatRooms,
      pictureSharing,
      liveChatRooms,
      voiceCall,
      fee,  
      members: [],
      image,
      name
    });
    // await user.updateOne({
    //   clubid: club._id,
    // });
    await user.updateOne({
      clubid: club._id
    })
    await markOnboardingTask(userid, "club");
    res.status(200).json({
      message: "Club Created",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const createClubRoom = async (req, res) => {
  try {
    clubRoomDebug("01 createClubRoom HIT", {
      method: req.method,
      path: req.originalUrl,
      body: req.body,
      bodyKeys: Object.keys(req.body || {}),
      hasFile: !!req.file,
      fileField: req.file?.fieldname,
      authUserId: req.authUserId?.toString(),
      reqUserId: req.userId?.toString()
    });

    var {
      userid,
      clubid,
      roomType,
      channelType,
      name,
      members
    } = req.body;

    const rawChannelType = channelType;
    clubRoomDebug("02 raw fields extracted", {
      userid,
      clubid,
      roomType,
      name,
      members,
      rawChannelType,
      channel_type: req.body.channel_type,
      type: req.body.type,
      roomChannelType: req.body.roomChannelType,
      chatType: req.body.chatType,
      isVoice: req.body.isVoice
    });

    channelType = (
      channelType ||
      req.body.channel_type ||
      req.body.type ||
      req.body.roomChannelType ||
      req.body.chatType ||
      (req.body.isVoice === true || req.body.isVoice === "true" ? "voice" : null) ||
      "text"
    ).toString().trim().toLowerCase();

    if (channelType.includes("voice")) {
      channelType = "voice";
    } else if (channelType.includes("text") || channelType.includes("chat")) {
      channelType = "text";
    }

    clubRoomDebug("03 channelType normalized", {
      userid: userid?.toString(),
      clubid: clubid?.toString(),
      roomType,
      name,
      rawChannelType,
      channel_type: req.body.channel_type,
      type: req.body.type,
      roomChannelType: req.body.roomChannelType,
      chatType: req.body.chatType,
      isVoice: req.body.isVoice,
      normalizedChannelType: channelType,
      bodyKeys: Object.keys(req.body || {})
    });

    if(typeof members == "string"){
      clubRoomDebug("04 members is string before JSON.parse", {
        members
      });
      try{
        members = JSON.parse(members)
        clubRoomDebug("05 members JSON.parse success", {
          members
        });
      }catch(e){
        members = [userid]
        clubRoomDebug("05 members JSON.parse failed, fallback to userid", {
          error: e.message,
          members
        });
      }
    }

    clubRoomDebug("06 looking up user", {
      userid
    });
    var user = await User.findById(userid);
    if (!user) {
      clubRoomDebug("07 user lookup failed", {
        userid
      });
      res.status(400).json({
        success: false,
        error: "User not found"
      })
      return;
    }
    clubRoomDebug("07 user lookup success", {
      userid: user._id?.toString(),
      username: user.username,
      clubidFromUser: user.clubid?.toString()
    });

    clubRoomDebug("08 looking up club", {
      clubid
    });
    var club = await Club.findById(clubid);
    if (!club) {
      clubRoomDebug("09 club lookup failed", {
        clubid
      });
      res.status(400).json({
        success: false,
        error: "Club not found"
      })
      return;
    }
    clubRoomDebug("09 club lookup success", {
      clubid: club._id?.toString(),
      ownerId: club.userid?.toString(),
      primaryRoom: club.primaryRoom?.toString(),
      existingRooms: (club.rooms || []).map(room => room?.toString())
    });

    if(!["primary", "secondary"].includes(roomType)){
      clubRoomDebug("10 invalid roomType", {
        roomType,
        allowed: ["primary", "secondary"]
      });
      res.status(400).json({
        success: false,
        error: "Room type must be primary or secondary"
      })
      return;
    }
    clubRoomDebug("10 roomType valid", {
      roomType
    });

    if(!["text", "voice"].includes(channelType)){
      clubRoomDebug("11 invalid channelType", {
        channelType,
        allowed: ["text", "voice"]
      });
      res.status(400).json({
        success: false,
        error: "Channel type must be text or voice"
      })
      return;
    }
    clubRoomDebug("11 channelType valid", {
      channelType
    });

    if(roomType == "primary" && club.primaryRoom != null){
       clubRoomDebug("12 primary room already exists", {
        requestedRoomType: roomType,
        primaryRoom: club.primaryRoom?.toString()
      });
       res.status(400).json({
        success: false,
        error: "Primary chat room already exist"
      })
      return;
    }

    var image = null
    if(req.file){
      clubRoomDebug("13 uploading room image", {
        fieldname: req.file.fieldname,
        mimetype: req.file.mimetype,
        size: req.file.size
      });
      image = await aws.uploadToAWS(req.file);
      clubRoomDebug("14 room image uploaded", {
        image
      });
    } else {
      clubRoomDebug("13 no room image provided");
    }

    if(!members || members.length == 0){
      members = [userid]
    }else{
      if(!members.includes(userid)){
        members.push(userid)
      }
    }
    clubRoomDebug("15 members normalized before create", {
      members,
      memberCount: members.length
    });

    clubRoomDebug("16 creating ClubRoom document", {
      userid,
      members,
      clubid,
      image,
      name,
      roomType,
      channelType
    });
    const clubRoom = await ClubRoom.create({
      userid,
      members,
      clubid,
      image,
      name,
      roomType,
      channelType
    });

    clubRoomDebug("17 ClubRoom document created", {
      id: clubRoom._id?.toString(),
      clubid: clubRoom.clubid?.toString(),
      roomType: clubRoom.roomType,
      channelType: clubRoom.channelType,
      name: clubRoom.name
    });

    if(members.length > 0){
      clubRoomDebug("18 sending room notifications/activities", {
        members,
        currentUserid: userid
      });
      await Promise.all(
        members.map(async member => {
          if(member == userid){
            return
          }
          await sendNotification(
          member,
          "Added club room",
          `${user.firstname + " " + user.lastname} added you in a club room`,
          "add-to-clubroom",
          {
            clubid,
            clubroomid: clubRoom._id,
            userid
          }
        );
        await createActivity(
          member,
          user._id,
          `${user.firstname + " " + user.lastname} added you in a club room`,
          undefined,   // streamid
          undefined,    // postid
          undefined,   // channel
          undefined,   // token
          null,        // voicemeetid
          false,       // walletNotify
          undefined,   // reelid
          "added-to-club-room",          // activityType
          {
            clubid,
            clubroomid: clubRoom._id,
            userid
          }, // data
          false         // isComment
        );
        })
      )
      clubRoomDebug("19 room notifications/activities complete");
    }
    
    var update = {
      $push: {
        rooms: clubRoom._id
      }
    }
    if(roomType == "primary"){
      update["$set"] = {
        primaryRoom: clubRoom._id
      }
    }
    clubRoomDebug("20 updating Club with room id", {
      clubid: club._id?.toString(),
      update: {
        pushRoom: clubRoom._id?.toString(),
        setPrimaryRoom: roomType == "primary" ? clubRoom._id?.toString() : null
      }
    });
    await club.updateOne(update)
    clubRoomDebug("21 Club update complete", {
      clubid: club._id?.toString(),
      roomId: clubRoom._id?.toString(),
      savedChannelType: clubRoom.channelType
    });

    const responsePayload = {
      success: true,
      message: "Club Created",
      id: clubRoom._id,
      room: clubRoom,
      clubRoom,
      channelType: clubRoom.channelType,
      roomType: clubRoom.roomType,
      clubid: clubRoom.clubid
    };
    clubRoomDebug("22 createClubRoom RESPONSE", {
      id: responsePayload.id?.toString(),
      channelType: responsePayload.channelType,
      roomType: responsePayload.roomType,
      clubid: responsePayload.clubid?.toString()
    });
    res.status(200).json(responsePayload);
  } catch (error) {
    clubRoomDebug("99 createClubRoom ERROR", {
      error: error.message,
      stack: error.stack
    });
    res.status(400).json({
      error: error.message,
    });
  }
};

const addMembertoClubRoom = async (req, res) => {
  try {
    var {
      userid,
      clubroomid,
      members,
      clubid
    } = req.body;

    var user = await User.findById(userid);
    if (!user) {
      res.status(400).json({
        success: false,
        error: "User not found"
      })
      return;
    }

    var clubRoom = await ClubRoom.findById(clubroomid);
    if (!clubRoom) {
      res.status(400).json({
        success: false,
        error: "club room not found"
      })
      return;
    }
    
    var club = await Club.findById(clubid);
    if (!club) {
      res.status(400).json({
        success: false,
        error: "club  not found"
      })
      return;
    }

    var clubRoomMembers = clubRoom.members.map(member => {return member.toString()})
    members.map(member => {
      if(!clubRoomMembers.includes(member)){
        clubRoomMembers.push(member)
      }
    })

    await clubRoom.updateOne({
      members: clubRoomMembers
    })

    if(members.length > 0){
      await Promise.all(
        members.map(async member => {
          await sendNotification(
          member,
          "Added club room",
          `${user.firstname + " " + user.lastname} added you in a club room`,
          "add-to-clubroom",
          {
            clubid,
            clubroomid: clubRoom._id,
            userid
          }
        );
        await createActivity(
          member,
          user._id,
          `${user.firstname + " " + user.lastname} added you in a club room`,
          data = {
            clubid,
            clubroomid: clubRoom._id,
            userid
          }
        );
        })
      )
    }
    
    res.status(200).json({
      message: "Club Created",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const remvoeMemberFromClubRoom = async (req, res) => {
  try {
    var {
      userid,
      clubroomid,
      members,
      clubid
    } = req.body;

    var user = await User.findById(userid);
    if (!user) {
      res.status(400).json({
        success: false,
        error: "User not found"
      })
      return;
    }

    var clubRoom = await ClubRoom.findById(clubroomid);
    if (!clubRoom) {
      res.status(400).json({
        success: false,
        error: "club room not found"
      })
      return;
    }
    
    var club = await Club.findById(clubid);
    if (!club) {
      res.status(400).json({
        success: false,
        error: "club  not found"
      })
      return;
    }

    var clubRoomMembers = clubRoom.members.map(member => {return member.toString()})
    members.map(member => {
      if(!clubRoomMembers.includes(member)){
        clubRoomMembers.push(member)
      }
    })

    await clubRoom.updateOne({
      $pull: {
        members: { $in: clubRoomMembers }
      }
    })

    if(members.length > 0){
      await Promise.all(
        members.map(async member => {
          await sendNotification(
          member,
          "Removed club room",
          `${user.firstname + " " + user.lastname} remvoed you from a club room`,
          "remove-from-clubroom",
          {
            clubid,
            clubroomid: clubRoom._id,
            userid
          }
        );
        await createActivity(
          member,
          user._id,
          `${user.firstname + " " + user.lastname} remvoed you from a club room`,
          data = {
            clubid,
            clubroomid: clubRoom._id,
            userid
          }
        );
        })
      )
    }
    
    res.status(200).json({
      message: "Club removed member",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const updateClubRoom = async (req, res) => {
  try {
    var {
      clubroomid,
      name
    } = req.body;

    var clubRoom = await ClubRoom.findById(clubroomid);
    if (!clubRoom) {
      res.status(400).json({
        success: false,
        error: "club room not found"
      })
      return;
    }
    
    
    var image = null
    if(req.file){
      image = await aws.uploadToAWS(req.file);
    }

    await clubRoom.updateOne({
      image: image || clubRoom.image,
      name: name || clubRoom.name
    })

    res.status(200).json({
      message: "Club updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getMyClubs = async (req, res)=>{
  try{
    var {userid} = req.params;
    clubRoomDebug("GET_MY_CLUBS 01 hit", {
      userid,
      path: req.originalUrl
    });
    var user = await User.findById(userid).populate({
      path: 'clubid',
      populate: [
        { path: 'rooms' }, 
        { path: 'primaryRoom' }
      ]
    }).lean();

    if (!user) {
      clubRoomDebug("GET_MY_CLUBS 02 user not found", {
        userid
      });
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }
    clubRoomDebug("GET_MY_CLUBS 02 user found", {
      userid: user._id?.toString(),
      userClubId: user.clubid?._id?.toString?.() || user.clubid?.toString?.() || null
    });

    // Owners are intentionally not duplicated in club.members. Resolve the
    // club by its owner as a fallback when User.clubid is missing or stale.
    var club = user.clubid;
    if (!club) {
      clubRoomDebug("GET_MY_CLUBS 03 user.clubid empty, finding club by owner", {
        userid
      });
      club = await Club.findOne({ userid }).populate([
        { path: "rooms" },
        { path: "primaryRoom" }
      ]).lean();
    }

    if(club){
      clubRoomDebug("GET_MY_CLUBS 04 club found before formatting", {
        clubid: club._id?.toString(),
        ownerId: club.userid?.toString(),
        rooms: (club.rooms || []).map(room => ({
          id: room?._id?.toString(),
          name: room?.name,
          roomType: room?.roomType,
          channelType: room?.channelType
        })),
        primaryRoom: club.primaryRoom
          ? {
              id: club.primaryRoom?._id?.toString(),
              name: club.primaryRoom?.name,
              roomType: club.primaryRoom?.roomType,
              channelType: club.primaryRoom?.channelType
            }
          : null
      });
      club.members = memberIdsWithoutOwner(club.members, club.userid);
      if(club.image){
        club.image = await aws.getLinkFromAWS(club.image);
      }
      if(club && club.primaryRoom && club.primaryRoom.image){
        club.primaryRoom.image = await aws.getLinkFromAWS(club.primaryRoom.image);
      }
  
      await Promise.all(
        club.rooms.map(async (room, index) => {
          if(room?.image){
            club.rooms[index].image = await aws.getLinkFromAWS(room.image);
          }
        })
      )
      clubRoomDebug("GET_MY_CLUBS 05 club returned after formatting", {
        clubid: club._id?.toString(),
        rooms: (club.rooms || []).map(room => ({
          id: room?._id?.toString(),
          name: room?.name,
          roomType: room?.roomType,
          channelType: room?.channelType
        }))
      });
    } else {
      clubRoomDebug("GET_MY_CLUBS 04 no club found", {
        userid
      });
    }

    res.status(200).json({
      success: true,
      club
    })
  }catch(e){
    console.log(e);
    res.status(400).json({
      success: false,
      message: e.message
    })
  }
}

const getRoomById = async (req, res)=>{
  try{
    var {roomid} = req.params;
    var room = await ClubRoom.findById(roomid).populate({
      path: 'members',
      select: "username firstname lastname profilePicture"
    });

    if(room.image){
      room.image = await aws.getLinkFromAWS(room.image);
    }

    res.status(200).json({
      success: true,
      room
    })
  }catch(e){
    console.log(e.message);
    res.status(400).json({
      success: false,
      message: e.message
    })
  }
}

const updateClub = async (req, res) => {
  try {
    const {
      clubid,
      privateChatRooms,
      pictureSharing,
      liveChatRooms,
      voiceCall,
      fee,
      members,
      name
    } = req.body;
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }

    var image = null
    if(req.file){
      image = await aws.uploadToAWS(req.file);
    }

    await club.updateOne({
      privateChatRooms,
      pictureSharing,
      liveChatRooms,
      voiceCall,
      fee: fee || club.fee,
      members: members ? memberIdsWithoutOwner(members, club.userid) : memberIdsWithoutOwner(club.members, club.userid),
      name: name || club.name,
      image: image || club.image
    });

    res.status(200).json({
      message: "Club Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const deleteClub = async (req, res) => {
  try {
    const clubid = req.body.clubid;
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }
    const userid = club.userid;
    const user = await User.findById(userid);
    await user.updateOne({
      clubid: null,
    });

    await Promise.all(
      memberIdsWithoutOwner(club.members, club.userid).map(async (id) => {
        const user = await User.findById(id);
        if (user) {
          await user.updateOne({
            $pull: { clubsJoined: clubid },
          });
        }
      })
    );

    await club.deleteOne();
    res.status(200).json({
      message: "Club Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const deleteClubRoom = async (req, res) => {
  try {
    const clubid = req.body.clubid;
    const club = await Club.findById(clubid);
    if (!club) {
      res.status(400).json({
        success: false,
        message: "Club Not Found"
      })
      return
    }

    const clubRoomid = req.body.clubRoomid;
    const clubRoom = await ClubRoom.findById(clubRoomid);
    if (!clubRoom) {
      res.status(400).json({
        success: false,
        message: "Club Room Not Found"
      })
      return;
    }
    const userid = club.userid;
    const user = await User.findById(userid);
    if (!user) {
      res.status(400).json({
        success: false,
        message: "User not found"
      })
      return;
    }

    await club.updateOne({
      $pull: {
        rooms: clubRoomid
      }
    })

    if(clubRoom.roomType == "primary"){
      await club.updateOne({
        primaryRoom: null
      })
    }
    
    res.status(200).json({
      message: "Club Room Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const joinClub = async (req, res) => {
  try {
    const { userid, clubid, fee, productid } = req.body;
    const user = await User.findById(userid);
    const club = await Club.findById(clubid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!club) {
      throw Error("Club Not Found");
    }
    if (isSameId(club.userid, userid)) {
      throw Error("Club owner cannot join own club");
    }
    if (memberIdsWithoutOwner(club.members, club.userid).includes(idToString(userid))) {
      throw Error("Already a Member");
    }

    var subscription = await Subscription.findOne({ userid, clubid });
    if (!subscription) {
      subscription = await Subscription.create({
        userid,
        clubid,
        status: "subscribed",
        product_id: productid
      });
    }

    const clubOwner = await User.findById(club.userid);
    console.log("club owner: ", club);

    if(club.primaryRoom){
      var clubRoom = await ClubRoom.findById(club.primaryRoom);
      if(!clubRoom.members.map(member => member.toString()).includes(userid)){
        await clubRoom.updateOne({
          $addToSet: {
            members: userid
          }
        })
      }
    }

    // const wallet = await Wallet.findById(user.walletid);
    // var coinAmount = fee;

    // const currentWallet = await Wallet.findById(clubOwner.walletid);
    // //     var amountNew = currentWallet.currentAmount - coinAmount
    // //     await currentWallet.updateOne({
    // //       currentAmount: amountNew,
    // //     });
    // //     var socketsWallet = global.onlineSockets.get(club.userid.toString());

    // //     if (socketsWallet) {
    // //       for (const socket of socketsWallet) {
    // //         if (socket) {
    // //           socket.emit("walletChange", {
    // //             userid: sender._id,
    // //             balance: amountNew
    // //           });
    // //         }
    // //       }
    // //     }

    // var mainAdmin = await Admin.findOne({ mainAdmin: true });
    // console.log("main admin: ", mainAdmin);
    // var streamerShare = coinAmount * ((100 - mainAdmin.adminShare) / 100);
    // var adminShare = coinAmount - streamerShare;
    // console.log("current wallet: ", currentWallet.currentAmount);
    // var amountNew = currentWallet.currentAmount + streamerShare;
    // await currentWallet.updateOne({
    //   currentAmount: amountNew,
    // });
    // var adminWallet = await Wallet.findById(mainAdmin.walletid);
    // console.log("dmin wallet: ", adminWallet);
    // var adminAmount = adminWallet.currentAmount + adminShare;
    // await adminWallet.updateOne({
    //   currentAmount: adminAmount,
    // });

    const feeAmount = Number(fee) || 0;
    const platformFee = feeAmount * 0.28;
    const netCreatorAmount = feeAmount - platformFee;

    await createTransaction({
      user_id: userid,
      creator_id: club.userid,
      type: 'club_subscription',
      amount: feeAmount,
      platform_fee: platformFee,
      net_creator_amount: netCreatorAmount,
      status: 'completed', // If internal; else pending
      club_id: clubid,
      subscription_period: 'monthly' // Assume or from req
    });

    const mainAdmin = await Admin.findOne({ mainAdmin: true });
    if (mainAdmin && mainAdmin.walletid) {
      await Wallet.updateOne(
        { _id: mainAdmin.walletid },
        { $inc: { currentAmount: platformFee, earnedAmount: platformFee } }
      );
    }

    console.log("mainadmin: ", mainAdmin);

    await club.updateOne({
      $addToSet: { members: userid },
    });
    await user.updateOne({
      $addToSet: {
        clubsJoined: clubid,
        subscribedProducts: productid
      }
    });
    // socketsWallet = global.onlineSockets.get(club.userid.toString());

    // if (socketsWallet) {
    //   for (const socket of socketsWallet) {
    //     if (socket) {
    //       socket.emit("walletChange", {
    //         userid: club.userid,
    //         balance: amountNew,
    //       });
    //     }
    //   }
    // }

    await sendNotification(
      club.userid.toString(),
      "Club Joined",
      `${user.firstname + " " + user.lastname} Joined your club`,
      "club",
      club._id,
      "userid",
      user._id,
      null,
      null,
      null,
      'false'
    );
    await createActivity(
      club.userid,
      user._id,
      `${user.firstname + " " + user.lastname} Joined your club`,
      undefined,   // streamid
      undefined,    // postid
      undefined,   // channel
      undefined,   // token
      null,        // voicemeetid
      false,       // walletNotify
      undefined,   // reelid
      "joined-club",          // activityType
      { clubid: club._id, userid: user._id }, // data
      false         // isComment
    );

    res.status(200).json({
      message: "Joined Club",
      clubid,
    });

    // if (club.fee <= wallet.currentAmount) {
    //     await wallet.updateOne({
    //         currentAmount: wallet.currentAmount - club.fee
    //     })
    //     await club.updateOne({
    //         $push:{members:userid}
    //     })
    //     await user.updateOne({
    //         $push:{clubsJoined:clubid}
    //     })
    //     res.status(200).json({
    //         message:"Club has been joined"
    //     })
    // }else{
    //     throw Error("Not Enough Coins")
    // }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const addUserToClub = async (req, res) => {
  try {
    const { userid, clubid } = req.body;
    const user = await User.findById(userid);
    const club = await Club.findById(clubid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!club) {
      throw Error("Club Not Found");
    }
    if (isSameId(club.userid, userid)) {
      throw Error("Club owner cannot be added as a member");
    }
    if (memberIdsWithoutOwner(club.members, club.userid).includes(idToString(userid))) {
      throw Error("Already a Member");
    }
    await club.updateOne({
      $addToSet: { members: userid },
    });
    await user.updateOne({
      $addToSet: {
        clubsJoined: clubid
      }
    });

    res.status(200).json({
      message: "User added to the Club",
      clubid,
    });

  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const leaveClub = async (req, res) => {
  try {
    const { userid, clubid } = req.body;
    const user = await User.findById(userid);
    const club = await Club.findById(clubid);
    if (!user) {
      throw Error("User Not Found");
    }
    if (!club) {
      throw Error("Club Not Found");
    }
    if (!memberIdsWithoutOwner(club.members, club.userid).includes(idToString(userid))) {
      throw Error("Not A Member of Club");
    }
    await club.updateOne({
      $pull: { members: userid },
    });
    await user.updateOne({
      $pull: { clubsJoined: clubid },
    });

    res.status(200).json({
      message: "Club Left",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getMembersOfClub = async (req, res) => {
  try {
    const clubid = req.params.clubid;
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Cannot Find Club");
    }

    const members = await Promise.all(
      memberIdsWithoutOwner(club.members, club.userid).map(async (id) => {
        let user = await User.findById(id);
        if (!user) return null;
        return {
          _id: user._id,
          username: user.username,
          profilePicture: await getPicUrl(user._id),
        };
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

const updateFee = async (req, res) => {
  try {
    const { clubid, newfee } = req.body;
    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }
    await club.updateOne({
      fee: newfee,
    });

    res.status(200).json({
      message: "Fee Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getClub = async (req, res) => {
  try {
    const clubid = req.params.clubid;
    const club = await Club.findById(clubid).lean();
    if(!club){
      res.status(400).json({
        success: false,
        message: "Club not found"
      })
      return;
    };
    if(club.image){
      club.image = await aws.getLinkFromAWS(club.image);
    }
    club.members = memberIdsWithoutOwner(club.members, club.userid);
     
    res.status(200).json({
      club,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getChatHistory = async (req, res) => {
  try {
    const clubid = req.query.clubid || req.body.clubid;
    const roomid = req.query.roomid || req.body.roomid;

    const club = await Club.findById(clubid);
    if (!club) {
      throw Error("Club Not Found");
    }

    let chats = await ClubChat.find({ clubid, roomid }).sort({ createdAt: "desc" });

    let chat = [];

    await Promise.all(
      chats.map(async (c) => {
        c = c.toObject();
        const user = await User.findById(c.senderid);
        if (user) {
          c.sendername = user.username;
          c["profilePicture"] = user.profilePicture
            ? await aws.getLinkFromAWS(user.profilePicture)
            : "";
          c["host"] = club.userid.toString() == user._id.toString();
        }
        c.contentURL = "";
        c.contentType = "";
        if (c.media) {
          let getObjectParams = {
            Bucket: bucketName,
            Key: c.media,
          };
          let command = new GetObjectCommand(getObjectParams);
          let command2 = new HeadObjectCommand(getObjectParams);
          const object = await s3.send(command2);
          const objectUrl = await getSignedUrl(s3, command, {
            expiresIn: "604800",
          });
          c.contentURL = objectUrl;
          c.contentType = object.ContentType;
        }
        delete c.media;
        chat.push(c);
      })
    );
    chat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    res.status(200).json({ chat });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const createClubCall = async (req, res) => {
  try {
    const { clubid } = req.body;

    const club = await Club.findById(clubid);

    if (!club) {
      throw Error("Club Not Found");
    }

    const userid = club.userid;
    var user = await User.findById(userid);

    let call = await Stream.findOne({ clubid });

    if (call) {
      throw Error("Call Already Exists");
    }

    const channelName = randomName();
    const token = await generateRtcToken(channelName);

    call = await Stream.create({
      userid,
      clubid,
      channelName,
      token,
    });

    await call.updateOne({
      $addToSet: { members: userid },
    });

    await Promise.all(
      memberIdsWithoutOwner(club.members, club.userid).map(async (followerid) => {
        await sendNotification(
          followerid,
          "Live Stream",
          `${user.firstname + " " + user.lastname} is live now`
        );
        await createActivity(
          followerid,
          user._id,
          `started live streaming`,
          call._id,
          undefined
        );
      })
    );

    res.status(200).json({
      _id: call._id,
      channelName,
      token,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const deleteClubCall = async (req, res) => {
  try {
    const callid = req.body.callid;
    const call = await Stream.findById(callid);

    if (!call) {
      throw Error("Call Not Found");
    }

    await call.deleteOne();

    res.status(200).json({
      message: "Call Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getClubCall = async (req, res) => {
  try {
    const clubid = req.params.clubid;
    const club = await Club.findById(clubid);

    if (!club) {
      throw Error("Club Not Found");
    }

    const call = await Stream.findOne({ clubid });
    if (!call) {
      throw Error("Call Not Found");
    }

    res.status(200).json({
      callid: call._id,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const joinCall = async (req, res) => {
  try {
    const userid = req.body.userid;
    const callid = req.body.callid;

    const user = await User.findById(userid);
    const call = await Stream.findById(callid);

    if (!user) {
      throw Error("User Not Found");
    }
    if (!call) {
      throw Error("Call Not Found");
    }
    const token = call.token;

    if (!call.members.includes(userid)) {
      await call.updateOne({
        $push: { members: userid },
      });
    }

    res.status(200).json({
      _id: call._id,
      channelName: call.channelName,
      token,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const leaveCall = async (req, res) => {
  try {
    const userid = req.body.userid;
    const callid = req.body.callid;
    const user = await User.findById(userid);
    const call = await Stream.findById(callid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (!call) {
      throw Error("Call Not Found");
    }

    if (call.members.includes(userid)) {
      await call.updateOne({
        $pull: { members: userid },
      });
    }

    res.status(200).json({
      message: "User Has Left Call",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const subscription = async (req, res) => {
  var error = function (error) {
    res.status(400).json({
      error,
    });
  };

  try {
    var event = req.body.event;
    // console.log(event);
    // var userid = event.subscriber_attributes.userid.value;
    // var clubid = event.subscriber_attributes.clubid.value;
    // var clubfee = event.price * (1 - event.tax_percentage - event.commission_percentage);
    // var type = event.type
    // const user = await User.findById(userid)
    // const club = await Club.findById(clubid)
    // if(!user){
    //     error("User Not Found")
    // }
    // if(!club){
    //     error("Club Not Found")
    // }

    // var subscription = await Subscription.findOne({userid});
    // if(!subscription && type == "INITIAL_PURCHASE"){
    //     subscription = await Subscription.create({
    //         userid,
    //         clubid,
    //         status: "subscribed",
    //         product_id: event.product_id,
    //         startedAt: event.event_timestamp_ms
    //     })
    // }

    // if(type == "INITIAL_PURCHASEiu"){
    //     const clubOwner = await User.findById(club.userid)
    //     console.log("club owner: ", club)

    //     const wallet = await Wallet.findById(user.walletid)
    //     var coinAmount = clubfee

    //     const currentWallet = await Wallet.findById(clubOwner.walletid);

    //     var mainAdmin = await Admin.findOne({mainAdmin: true});
    //     var streamerShare = coinAmount *  ((100 - mainAdmin.adminShare) / 100);
    //     var adminShare = coinAmount - streamerShare;
    //     amountNew = currentWallet.currentAmount + streamerShare;
    //     await currentWallet.updateOne({
    //       currentAmount: amountNew
    //     });
    //     var adminWallet = await Wallet.findById(mainAdmin.walletid);
    //     var adminAmount = adminWallet.currentAmount + adminShare;
    //     await adminWallet.updateOne({
    //       currentAmount: adminAmount
    //     })

    //     await club.updateOne({
    //         $push:{members:userid}
    //     })
    //     await user.updateOne({
    //         $push:{clubsJoined:clubid}
    //     })

    //     socketsWallet = global.onlineSockets.get(club.userid.toString());

    //     if (socketsWallet) {
    //       for (const socket of socketsWallet) {
    //         if (socket) {
    //           socket.emit("walletChange", {
    //             userid: club.userid,
    //             balance: amountNew
    //           });
    //         }
    //       }
    //     }

    //     socketsWallet = global.onlineSockets.get(userid.toString());

    //     if (socketsWallet) {
    //       for (const socket of socketsWallet) {
    //         if (socket) {
    //           socket.emit("subscribedClub", {
    //             clubid,
    //             userid
    //           });
    //         }
    //       }
    //     }

    //     socketsWallet = global.onlineSockets.get(club.userid.toString());

    //     if (socketsWallet) {
    //       for (const socket of socketsWallet) {
    //         if (socket) {
    //           socket.emit("newSubscription", {
    //             userid,
    //             clubid
    //           });
    //         }
    //       }
    //     }

    // }else if(type == "NON_RENEWING_PURCHASE"){

    // }
    // else if(type == "RENEWAL"){

    // }else if(type == "PRODUCT_CHANGE"){

    // }else if(type == "CANCELLATION"){

    // }else if(type == "BILLING_ISSUE"){

    // }else if(type == "SUBSCRIPTION_PAUSED"){

    // }else if(type == "UNCANCELLATION"){

    // }

    // const events = ["TEST", "INITIAL_PURCHASE", "NON_RENEWING_PURCHASE", "RENEWAL", "PRODUCT_CHANGE", "CANCELLATION", "BILLING_ISSUE", "SUBSCRIBER_ALIAS", "SUBSCRIPTION_PAUSED", "UNCANCELLATION", "TRANSFER", "SUBSCRIPTION_EXTENDED"];
    console.log("updated subsctiption");
    res.status(200).json({
      message: "Subscription Updated",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

module.exports = {
  createClub,
  getChatHistory,
  deleteClub,
  joinClub,
  leaveClub,
  getMembersOfClub,
  updateFee,
  getClub,
  createClubCall,
  deleteClubCall,
  getClubCall,
  joinCall,
  leaveCall,
  updateClub,
  subscription,
  addUserToClub,
  getMyClubs,
  addMembertoClubRoom,
  createClubRoom,
  getRoomById,
  updateClubRoom,
  remvoeMemberFromClubRoom,
  deleteClubRoom
};
