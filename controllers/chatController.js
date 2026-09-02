const User = require("../models/userModel")
const Chat = require("../models/chatModel")
const MessageRequest = require("../models/messageRequestModel")
const Thread = require("../models/threadModel")
const Story = require("../models/storyModel");
const Post = require("../models/postModel");
const Reel = require("../models/reelModel");
const { aws } = require("../helpers/otherHelpers");
const {
    getMessageAccess: resolveMessageAccess
} = require("../services/privacyAccessService");

const { S3Client, PutObjectCommand, GetObjectCommand, CopyObjectCommand, DeleteObjectCommand, HeadObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner')

require('dotenv').config()


bucketName = process.env.BUCKET_NAME
bucketRegion = process.env.BUCKET_REGION
accessKey = process.env.ACCESS_KEY
secretAccessKey = process.env.SECRET_ACCESS_KEY

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString('hex')


const s3 = new S3Client({
    credentials: {
        accessKeyId: accessKey,
        secretAccessKey: secretAccessKey
    },
    region: bucketRegion
})

const { getPicUrl } = require("../controllers/userController")

const getChatHistory = async (req, res) => {
    try {
        const { userid, otherUserid } = req.body;

        let chats = await Chat.find({
            $or: [
                { senderid: userid, receiverid: otherUserid },
                { senderid: otherUserid, receiverid: userid }
            ]
        }).sort({ createdAt: 'desc' });
        let chat = []

        await Promise.all(
            chats.map(async c => {
                c = c.toObject()
                if(c.deletedForMe && c.senderid.toString() == userid.toString()){
                    return;
                }
                c.contentURL = ""
                c.contentType = ""
                if(c.likedBy && c.likedBy.length > 0){
                    c["liked"] = true;
                }else{
                    c["liked"] = false;
                }
                if (c.media) {
                    if(c.media && c.media.trim() != ""){
                        let getObjectParams = {
                            Bucket: bucketName,
                            Key: c.media
                        }
                        let command = new GetObjectCommand(getObjectParams)
                        let command2 = new HeadObjectCommand(getObjectParams)
                        var object = await s3.send(command2)
                        var objectUrl = await getSignedUrl(s3, command, { expiresIn: "604800" })
                        c.contentURL = objectUrl
                        c.contentType = object.ContentType
                    }else{
                        c.contentURL = ""
                        c.contentType = ""
                    }
                }
                delete c.media
    
                if(c.replyModel == "story"){
                    var story = await Story.findById(c.replyof).lean();
                    if(story.content && story.content.trim() != ""){
                        story.content = await aws.getLinkFromAWS(story.content)
                    }
                    c["replyof"] = story
                }
    
                if(c.sharedModel != "none"){
                    // if(c.sharedModel == "post"){
                        c["sharedEntity"] = await (c.sharedModel == "post" ? Post : Reel).findById(c.sharedEntity).lean();
                    // }
                    if(c.sharedModel == "post"){
                        c.sharedEntity["thumbnail"] = c["sharedEntity"]["thumbnails"].length > 0 && c["sharedEntity"]["thumbnails"][0].trim() != "" ? await aws.getLinkFromAWS(c["sharedEntity"]["thumbnails"][0]) : ""
                        c.sharedEntity["contentType"] = null;
                        if(c.sharedEntity.contents && c.sharedEntity.contents.length > 0 && c.sharedEntity.contents[0].trim() != ""){
                            c.sharedEntity["contentType"] = await aws.getContentTypeFromAws(c.sharedEntity.contents[0]);
                        }
                        console.log("thumbs: ", c["sharedEntity"]["thumbnail"])
                    }else if(c.sharedModel == "reel"){
                        c["sharedEntity"]["thumbnail"] = (c["sharedEntity"]["thumbnail"] && c["sharedEntity"]["thumbnail"].trim() != "") ? await aws.getLinkFromAWS(c["sharedEntity"]["thumbnail"]) : ""
                        if(c.sharedEntity.video && c.sharedEntity.video.trim() != ""){
                            c.sharedEntity["contentType"] = await aws.getContentTypeFromAws(c.sharedEntity.video);
                        }
                    }else{
                        c["sharedEntity"]["thumbnail"] = ""
                    }
                }
    
                chat.push(c)

            })
        )
        chat.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))

        res.status(200).json({ chat });
    } catch (error) {
        res.status(400).json({
            error: error.message
        })
    }
}
const getThreads = async (req, res) => {
    try {
        const userid = req.params.userid
        if (userid?.toString() !== req.userId?.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only view your own conversations",
            });
        }
        let threads = await Thread.find({ $or: [{ participantOneId: userid }, { participantTwoId: userid }] })
        const hiddenRequesters = new Set(
            (await MessageRequest.find({
                ownerid: userid,
                accepted: false,
            }).select("requesterid").lean())
                .map(request => request.requesterid.toString())
        );
        threads = threads.filter(thread => {
            const otherId = thread.participantOneId.toString() === userid.toString()
                ? thread.participantTwoId.toString()
                : thread.participantOneId.toString();
            return !hiddenRequesters.has(otherId);
        });

        threads = await Promise.all(
            threads.map(async (thread) => {
                const user1 = await User.findById(thread.participantOneId)
                const user2 = await User.findById(thread.participantTwoId)
                var otherUserId = thread.participantOneId;
                if(thread.participantOneId == userid){
                    otherUserId = thread.participantTwoId;
                }
                var unreadCount = await Chat.countDocuments({
                    receiverid: userid,
                    senderid: otherUserId.toString(),
                    read: false,
                  });
                return {
                    _id: thread._id,
                    participants: [{
                        userid: user1._id,
                        username: user1.username,
                        is_online: user1.is_online,
                        profilePic: await getPicUrl(user1._id)
                    }, {
                        userid: user2._id,
                        username: user2.username,
                        is_online: user2.is_online,
                        profilePic: await getPicUrl(user2._id)
                    }],
                    last_message: thread.last_message,
                    last_message_sender_id: thread.last_message_sender_id,
                    last_message_Username: thread.last_message_Username,
                      last_message_timestamp: thread.last_message_timestamp,
                      contentType: thread.contentType,
                      isMuted: (thread.mutedBy || []).some(
                          mutedUserId => mutedUserId.toString() === userid.toString()
                      ),
                      unreadCount
                }
            })
        )

        res.status(200).json({
            threads
        })

    } catch (error) {
        res.status(400).json({
            error: error.message
        })
    }
}
const getThreads2 = async (userid) => {
    try {
        let threads = await Thread.find({ $or: [{ participantOneId: userid }, { participantTwoId: userid }] })
        const hiddenRequesters = new Set(
            (await MessageRequest.find({
                ownerid: userid,
                accepted: false,
            }).select("requesterid").lean())
                .map(request => request.requesterid.toString())
        );
        threads = threads.filter(thread => {
            const otherId = thread.participantOneId.toString() === userid.toString()
                ? thread.participantTwoId.toString()
                : thread.participantOneId.toString();
            return !hiddenRequesters.has(otherId);
        });

        threads = await Promise.all(
            threads.map(async (thread) => {
                const user1 = await User.findById(thread.participantOneId)
                const user2 = await User.findById(thread.participantTwoId)
                var otherUserId = thread.participantOneId;
                if(thread.participantOneId == userid){
                    otherUserId = thread.participantTwoId;
                }
                var unreadCount = await Chat.countDocuments({
                    receiverid: userid,
                    senderid: otherUserId.toString(),
                    read: false,
                  });
                return {
                    _id: thread._id,
                    participants: [{
                        userid: user1._id,
                        username: user1.username,
                        is_online: user1.is_online,
                        profilePic: await getPicUrl(user1._id)
                    }, {
                        userid: user2._id,
                        username: user2.username,
                        is_online: user2.is_online,
                        profilePic: await getPicUrl(user2._id)
                    }],
                    last_message: thread.last_message,
                    last_message_sender_id: thread.last_message_sender_id,
                    last_message_Username: thread.last_message_Username,
                      last_message_timestamp: thread.last_message_timestamp,
                      contentType: thread.contentType,
                      isMuted: (thread.mutedBy || []).some(
                          mutedUserId => mutedUserId.toString() === userid.toString()
                      ),
                      unreadCount
                }
            })
        )

        return threads

    } catch (error) {
        console.log(error)
    }
}

const deleteChat = async (req, res) => {
    try {
        var {userid, otherUserid} = req.body;

        var thread = await Thread.findOne({
            $or: [
                { participantOneId: userid, participantTwoId: otherUserid },
                { participantOneId: otherUserid, participantTwoId: userid }
            ]
        })

        if(!thread){
            res.status(400).json({
                success: false,
                message: "No thread found"
            })
            return;
        }

        var chats = await Chat.find({
            $or: [
                { senderid: userid, receiverid: otherUserid },
                { senderid: otherUserid, receiverid: userid }
            ]
        })

        await Promise.all(
            chats.map(async chat => {
                await chat.deleteOne();
            })
        )

        await thread.deleteOne();
        res.status(200).json({
            success: true,
            message: "Thread deleted"
        })
    } catch (error) {
        console.log(error)
        res.status(400).json({
                success: false,
                message: error.message
            })
    }
}
const markAsRead = async (req, res) => {
    try{
    var {userid, otheruserid} = req.body;
    var chats = await Chat.find({
      receiverid: userid,
      senderid: otheruserid,
      read: false
    });
  
    await Promise.all(
      chats.map(async chat =>{
        await chat.updateOne({
            read: true
        })
      })
    )

    var socketActivity = global.onlineSockets.get(userid.toString());

    if (socketActivity) {
        var unreadCount = await Chat.countDocuments({ receiverid: userid, read: false })
        for (const socket of socketActivity) {
            if (socket) {
                socket.emit("unreadMessagesCount", {
                count: unreadCount
                });
            }
        }
    }
  
    res.status(200).json({
      message: "chat read"
    })
  }catch(err){
    res.status(400).json({
      message: err.message
    })
  }
}
const getUnreadCount = async (req, res) => {
try{
    const userid = req.params.userid
var chats = await Chat.countDocuments({
    receiverid: userid,
    read: false
});

res.status(200).json({
    count: chats
})
}catch(err){
res.status(400).json({
    message: err.message
})
}
}
const getMessageAccess = async (req, res) => {
    try {
        if (req.params.senderId?.toString() !== req.userId?.toString()) {
            return res.status(403).json({
                success: false,
                message: "Invalid sender identity",
            });
        }
        const access = await resolveMessageAccess(
            req.params.senderId,
            req.params.receiverId
        );
        res.status(200).json({ success: true, data: access });
    } catch (error) {
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}
const getMessageRequestStatus = async (req, res) => {
    try {
        const ownerId = req.params.ownerId;
        const requesterId = req.params.requesterId;
        if (ownerId?.toString() !== req.userId?.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only view your own message requests"
            });
        }

        const incomingMessage = await Chat.exists({
            senderid: requesterId,
            receiverid: ownerId,
        });
        const request = await MessageRequest.findOne({
            ownerid: ownerId,
            requesterid: requesterId,
        }).lean();

        res.status(200).json({
            success: true,
            data: {
                hasIncomingRequest: !!incomingMessage && request?.accepted !== true,
                accepted: request?.accepted === true,
            }
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

const acceptMessageRequest = async (req, res) => {
    try {
        const ownerId = req.body.ownerId || req.userId;
        const requesterId = req.body.requesterId;
        if (!requesterId) {
            return res.status(400).json({
                success: false,
                message: "requesterId is required"
            });
        }
        if (ownerId?.toString() !== req.userId?.toString()) {
            return res.status(403).json({
                success: false,
                message: "You can only accept your own message requests"
            });
        }

        const incomingMessage = await Chat.exists({
            senderid: requesterId,
            receiverid: ownerId,
        });
        if (!incomingMessage) {
            return res.status(404).json({
                success: false,
                message: "No message request found"
            });
        }

        const acceptedRequest = await MessageRequest.findOneAndUpdate(
            {
                ownerid: ownerId,
                requesterid: requesterId,
                accepted: false,
                declined: { $ne: true },
            },
            {
                accepted: true,
                acceptedAt: new Date(),
                declined: false,
                $unset: { declinedAt: 1 },
            },
            { upsert: true, new: true, setDefaultsOnInsert: true }
        );

        if (!acceptedRequest) {
            return res.status(404).json({
                success: false,
                message: "No message request found",
            });
        }

        res.status(200).json({
            success: true,
            message: "Message request accepted",
            data: {
                accepted: true,
            }
        });
    } catch (error) {
        res.status(error.statusCode || 400).json({
            success: false,
            message: error.message
        });
    }
}

const getMessageRequests = async (req, res) => {
    try {
        const ownerId = req.userId;
        const requests = await MessageRequest.find({
            ownerid: ownerId,
            accepted: false,
            declined: { $ne: true },
        }).sort({ createdAt: -1 }).lean();

        const data = (await Promise.all(requests.map(async request => {
            const requester = await User.findById(request.requesterid)
                .select("_id username firstname lastname")
                .lean();
            if (!requester) return null;
            const message = await Chat.findOne({
                senderid: request.requesterid,
                receiverid: ownerId,
            }).sort({ createdAt: 1 }).lean();
            if (!message) return null;
            return {
                requestId: request._id,
                requesterId: requester._id,
                username: requester.username,
                firstname: requester.firstname,
                lastname: requester.lastname,
                profilePic: await getPicUrl(requester._id),
                message: message.message || "",
                createdAt: message.createdAt,
            };
        }))).filter(Boolean);

        res.status(200).json({ success: true, requests: data });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}

const declineMessageRequest = async (req, res) => {
    try {
        const ownerId = req.userId;
        const requesterId = req.body.requesterId;
        if (!requesterId) {
            return res.status(400).json({
                success: false,
                message: "requesterId is required",
            });
        }
        const request = await MessageRequest.findOneAndUpdate(
            {
                ownerid: ownerId,
                requesterid: requesterId,
                accepted: false,
                declined: { $ne: true },
            },
            {
                $set: {
                    declined: true,
                    declinedAt: new Date(),
                },
            },
            { new: true },
        );
        if (!request) {
            return res.status(404).json({
                success: false,
                message: "No message request found",
            });
        }
        res.status(200).json({ success: true });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
}

const setConversationMuted = async (req, res) => {
    try {
        const userId = req.userId;
        const otherUserId = req.body.otherUserId;
        const muted = req.body.muted;
        if (!otherUserId || typeof muted !== "boolean") {
            return res.status(400).json({
                success: false,
                message: "otherUserId and muted are required",
            });
        }

        const thread = await Thread.findOne({
            $or: [
                { participantOneId: userId, participantTwoId: otherUserId },
                { participantOneId: otherUserId, participantTwoId: userId },
            ],
        });
        if (!thread) {
            return res.status(404).json({
                success: false,
                message: "Conversation not found",
            });
        }

        await thread.updateOne(
            muted
                ? { $addToSet: { mutedBy: userId } }
                : { $pull: { mutedBy: userId } },
        );
        res.status(200).json({ success: true, muted });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

const getConversationMuteStatus = async (req, res) => {
    try {
        const userId = req.userId;
        const otherUserId = req.params.otherUserId;
        const muted = !!(await Thread.exists({
            $or: [
                { participantOneId: userId, participantTwoId: otherUserId },
                { participantOneId: otherUserId, participantTwoId: userId },
            ],
            mutedBy: userId,
        }));
        res.status(200).json({ success: true, muted });
    } catch (error) {
        res.status(400).json({ success: false, message: error.message });
    }
};

module.exports = { getChatHistory, getThreads, getThreads2, markAsRead,getUnreadCount, deleteChat, getMessageAccess, getMessageRequestStatus, acceptMessageRequest, getMessageRequests, declineMessageRequest, setConversationMuted, getConversationMuteStatus }
