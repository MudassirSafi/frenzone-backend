const mongoose = require("mongoose")

const chatSchema = new mongoose.Schema({
    senderid: { type: mongoose.Schema.Types.ObjectId, required: true },
    receiverid: { type: mongoose.Schema.Types.ObjectId, required: true },
    message:{type:String,default:""},
    media:{type:String,default:""},
    // groupReacts: {
    //     type: [
    //         {
    //             userid: mongoose.Schema.Types.ObjectId,
    //             reactionIndex: Number
    //         }
    //     ]
    // },
    reactionIndex: {
        type: Number,
        default: -1
    },
    replyof: {
        type: mongoose.Schema.Types.ObjectId
    },
    replyModel: {
        type: String,
        default: "chat"
    },
    read: {
        type: Boolean,
        default: false
    },
    delivered: {
        type: Boolean,
        default: false
    },
    seen: {
        type: Boolean,
        default: false
    },
    chatType: {
        type: String,
        enum: ["message", "reply", "share"],
        default: "message"
    },
    sharedModel: {
        type: String,
        enum: ["post", "reel", "story", "none"],
        default: "none"
    },
    sharedEntity: {
        type: mongoose.Schema.Types.ObjectId
    },
    deletedForMe: {
        type: Boolean,
        default: false
    }
},{timestamps:true})

module.exports = mongoose.model("Chat", chatSchema);