const mongoose = require("mongoose")

const streamSchema = new mongoose.Schema(
    {
        userid: { type: mongoose.Schema.Types.ObjectId },
        clubid: { type: mongoose.Schema.Types.ObjectId },
        channelName: { type: String },
        members: [{ type: mongoose.Schema.Types.ObjectId }],
        broadcasters: [
            {
                userid: { type: mongoose.Schema.Types.ObjectId },
                agoraUid: { type: Number },
                role: { type: String },
                earnings: { type: Number, default: 0 },
                thumbnail: { type: String, default: "" },
                isVirtualBackground: { type: Boolean, default: false },
                isProfileThumbnail: { type: Boolean, default: false },
                isLivePaused: { type: Boolean, default: false },
            }
        ],
        moderators: [{ type: mongoose.Schema.Types.ObjectId }],
        coHostsRequests: [
            {
                userid: { type: mongoose.Schema.Types.ObjectId },
                agoraUid: { type: Number },
            }
        ],
        blocked: [{ type: mongoose.Schema.Types.ObjectId }],
        mutes: [{ type: mongoose.Schema.Types.ObjectId }],
        token: { type: String, default: "" },
        giftAmount: { type: Number, default: 0 },
        giftCount: { type: Number, default: 0 },
        giftCoins: { type: Number, default: 0 },
        gifters: [{
            userid: { type: mongoose.Schema.Types.ObjectId },
            username: { type: String, default: "" },
            profilePicture: { type: String, default: "" },
            giftCount: { type: Number, default: 0 },
            coins: { type: Number, default: 0 }
        }],
        parentStream: { type: mongoose.Schema.Types.ObjectId },
        isCommentsMuted: { type: Boolean, default: false },
        paused: {
            type: Boolean,
            default: false
        },
        muted: {
            type: Boolean,
            default: false
        },
        challengers: {
            type: [{
                challengerid: mongoose.Schema.Types.ObjectId,
                giftsCollected: Number
            }],
            default: []
        },
        likeCount: { type: Number, default: 0 },
        isPK: {
            type: Boolean,
            default: false
        },
        pkChannelName: {
            type: String,
            default: ""
        },
        likes: {
            type: Number,
            default: 0,
        },
        pinComment: {
            userName: { type: String },
            profileImage: { type: String },
            text: { type: String },
        },
        requestsGuestsEnabled: { type: Boolean, default: true },
        voting: {
            enabled: { type: Boolean, default: false },
            startTime: { type: Date },
            endTime: { type: Date },
            voteCounts: {
                smile: { type: Number, default: 0 },
                cry: { type: Number, default: 0 }
            },
            voters: [{ type: mongoose.Schema.Types.ObjectId }]
        },
        lastHeartbeatAt: {
            type: Date,
            default: Date.now
        },
        isClubStreaming: { type: Boolean, default: false }

    }
)


module.exports = mongoose.model("Stream", streamSchema);
