const User = require("../models/userModel");
const { Upload } = require("@aws-sdk/lib-storage");
const Chat = require("../models/chatModel");
const Post = require("../models/postModel");
const Reel = require("../models/reelModel");
const Thread = require("../models/threadModel");
const Activity = require("../models/activityModel");

const axios = require("axios")
const FormData = require("form-data")
const fs = require("fs")
const ffmpeg = require("fluent-ffmpeg")
const fileURLT = require("url")
const path = require("path")
const os = require("os")
const { Readable } = require('stream');

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
const { sendNotification } = require("../controllers/notificationController");
const System = require("../models/systemModel");
const {
  authorizeMessageSend,
  isConversationMuted,
} = require("../services/privacyAccessService");

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

var fileOps = {
    // getVideoDuration: async function(videoFile) {
    //   if (!videoFile?.buffer) {
    //     throw new Error('No video buffer provided');
    //   }
    
    //   const buffer = videoFile.buffer;
    //   const ext = path.extname(videoFile.originalname) || '.mp4';
    //   const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'reel-duration-'));
    //   const tempPath = path.join(tempDir, `upload${ext}`);
    
    //   try {
    //     await fs.writeFile(tempPath, buffer);
    
    //     return await new Promise((resolve, reject) => {
    //       ffmpeg.ffprobe(tempPath, (err, metadata) => {
    //         if (err) {
    //           console.error('ffprobe error:', err.message);
    //           return reject(err);
    //         }
    //         const duration = metadata?.format?.duration;
    //         if (typeof duration !== 'number' || isNaN(duration)) {
    //           return reject(new Error('Duration not found or invalid'));
    //         }
    //         resolve(duration);
    //       });
    //     });
    //   } finally {
    //     await fs.unlink(tempPath).catch(() => {});
    //     await fs.rmdir(tempDir).catch(() => {});
    //   }
    // }
  getVideoDuration: async function(videoFile) {
    if (!videoFile?.buffer) {
      throw new Error('No video buffer provided');
    }

    const buffer = videoFile.buffer;

    // Create a Readable stream from the buffer
    const stream = new Readable();
    stream.push(buffer);
    stream.push(null); // End the stream

    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(stream, (err, metadata) => {
        if (err) {
          console.error('ffprobe error:', err.message || err);
          return reject(new Error(`ffprobe failed: ${err.message || 'unknown error'}`));
        }

        const duration = metadata?.format?.duration;

        if (typeof duration !== 'number' || isNaN(duration) || duration <= 0) {
          return reject(new Error('Duration not found, invalid, or zero'));
        }

        resolve(duration); // in seconds
      });
    });
  },
}

var aws = {
  uploadToAWS : async function(content){
    const contentFileName = randomName();

    const contentParams = {
      Bucket: bucketName,
      Key: contentFileName,
      Body: content.buffer,
      ContentType: content.mimetype,
    };

    await uploadToS3(contentParams)

    return contentFileName;
  },

  getLinkFromAWS : async function(key){
    if(key && key.trim() != ""){
      const getObjectParams = {
        Bucket: bucketName,
        Key: key,
      };
      const command = new GetObjectCommand(getObjectParams);
      url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      return url;
    }else{
      return "";
    }
  },

  getContentTypeFromAws: async function(key){
    if(key && key.trim() != ""){
      const getObjectParams = {
        Bucket: bucketName,
        Key: key,
      };
      const command = new HeadObjectCommand(getObjectParams);
      const data = await s3.send(command);
      console.log("Data: ", data)
      return data.ContentType
    }else{
      return "";
    }
  }
}

async function getNewUsername(initialString){
  var system = await System.findOne({});
  var latestUser = -1
  if(initialString && initialString.trim() != ""){
    
  }else{
    initialString = "user"
    if(system){
      latestUser = system.latestUser + 1
    }else{
      latestUser = 1
    }
  }
  
  var user = await User.findOne({username: `${initialString}${latestUser != -1 ? latestUser : ""}`}).select("_id")
  while(user){
    latestUser = latestUser + 1;
    user = await User.findOne({username: `${initialString}${latestUser != -1 ? latestUser : ""}`})
  }
  if(latestUser != -1 ){
    const options = { upsert: true, new: true };
    await System.findOneAndUpdate(
      {},
      {
        latestUser
      },
      options
    );
  }
  return `${initialString}${latestUser != -1 ? latestUser : ""}`
}

var db = {
  findOne: async function(model, params){
    params['deleted'] = false;
    var result = await model.findOne(params);
    return result;
  },
  
  find: async function(model, params, skip = null, limit = null, sort = null){
    params['deleted'] = false;
    var result;
    if(skip && limit && sort){
      result = await model.find(params)
        .skip(skip)
        .limit(limit)
        .sort(sort);
    }
    result = await model.find(params);
    return result;
  },

  findById: async function(model, id){
    var params = {
      _id: id,
    }
    params['deleted'] = false;
    var result = await model.findOne(params);
    return result;
  },
}


const uploadToS3 = async (params) => {
  const upload = new Upload({
    client: s3,
    params: params,
  });
  await upload.done();
};


function sendRes(res, status, success, body, notThrow = true){
  if(res){
    res.status(status).json({
        success,
        body
    })
  }

  if(!notThrow){
    throw Error(body)
  }
}


async function sendMessageCustomShare(senderid, receiverid, sharedModel, sharedEntity ){
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

      const chat = await Chat.create({ senderid, receiverid, sharedModel, sharedEntity, chatType: "share", replyModel: "none" });
      sharedEntity = await (sharedModel == "post" ? Post : Reel).findById(sharedEntity);
      await sharedEntity.updateOne({
        $inc: {
          shares: 1
        }
      })
      sharedEntity = sharedEntity.toObject()
      if(sharedModel == "post"){
          sharedEntity["thumbnail"] = sharedEntity["thumbnails"].length > 0 ? await aws.getLinkFromAWS(sharedEntity["thumbnails"][0]) : ""
      }else if(sharedModel == "reel"){
          sharedEntity["thumbnail"] = (sharedEntity["thumbnail"] && sharedEntity["thumbnail"].trim() != "") ? await aws.getLinkFromAWS(sharedEntity["thumbnail"]) : ""
      }else{
          sharedEntity["thumbnail"] = ""
      }
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
        last_message: `${sharedModel}  shared`,
        last_message_sender_id: sender._id,
        last_message_Username: sender.username,
        last_message_timestamp: chat.createdAt,
        contentType: "",
      });

      if (threadExists) {
        let threadUpdate = {
          _id: thread._id,
          last_message: `${sharedModel}  shared`,
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
                sharedModel,
                sharedEntity,
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
                sharedModel,
                sharedEntity,
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
              // profilePic: await getPicUrl(user1._id),
              profilePic: await aws.getLinkFromAWS(user1.profilePicture)
            },
            {
              userid: user2._id,
              username: user2.username,
              is_online: user2.is_online,
              // profilePic: await getPicUrl(user2._id),
              profilePic: await aws.getLinkFromAWS(user2.profilePicture)
            },
          ],
          last_message: `${sharedModel}  shared`,
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
                sharedModel,
                sharedEntity,
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
                sharedModel,
                sharedEntity,
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
      if (!(await isConversationMuted(receiverid, senderid))) {
        await sendNotification(
          receiverid,
          `${sharedModel} shared`,
          `${sender.firstname+ " " + sender.lastname} shared a ${sharedModel == "reel" ? "blink" : sharedModel} with you!`,
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
  }

async function reencodeVideoToMP4(inputBuffer) {
  return new Promise((resolve, reject) => {
    const tmpInputPath = path.join(os.tmpdir(), `input-${Date.now()}.mp4`);
    const tmpOutputPath = path.join(os.tmpdir(), `output-${Date.now()}.mp4`);

    fs.writeFileSync(tmpInputPath, inputBuffer);

    ffmpeg(tmpInputPath)
      .videoCodec("libx264")
      .audioCodec("aac")
      .outputOptions("-movflags faststart")
      .on("end", () => {
        const fixedBuffer = fs.readFileSync(tmpOutputPath);
        fs.unlinkSync(tmpInputPath);
        fs.unlinkSync(tmpOutputPath);
        resolve(fixedBuffer);
      })
      .on("error", (err) => {
        reject(err);
      })
      .save(tmpOutputPath);
  });
}

module.exports = { aws, db, sendRes, sendMessageCustomShare, getNewUsername, reencodeVideoToMP4, fileOps }
