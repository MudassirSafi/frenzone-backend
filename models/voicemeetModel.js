const mongoose = require("mongoose")

const voicemeetSchema = new mongoose.Schema(
    {
        userid: { type: mongoose.Schema.Types.ObjectId },
        groupid: { type: mongoose.Schema.Types.ObjectId},
        clubid: {type: mongoose.Schema.Types.ObjectId},
        roomid: {type: mongoose.Schema.Types.ObjectId, ref: "ClubRoom", default: null},
        channelName:{type:String},
        members: [{ type: mongoose.Schema.Types.ObjectId }],
        blocked: [{ type: mongoose.Schema.Types.ObjectId }],
        token:{type:String,default:""},
        broadcasters: [{ type: mongoose.Schema.Types.ObjectId }],
        moderators: [{ type: mongoose.Schema.Types.ObjectId }],
        mutes: [{ type: mongoose.Schema.Types.ObjectId }],
        giftAmount: {type: Number, default: 0},
        parentStream: {type: mongoose.Schema.Types.ObjectId},
        paused: {
            type: Boolean,
            default: false
        },
        muted: {
            type: Boolean,
            default: false
        },
        // New fields for X-Space style voice chat
        title: { type: String, default: "" },
        topic: { type: String, default: "" },
        visibility: { type: String, enum: ["public", "followers", "private"], default: "public" },
        speakers: [{ type: mongoose.Schema.Types.ObjectId }], // Users who can speak
        listeners: [{ type: mongoose.Schema.Types.ObjectId }], // Users who are listening only
        speakingRequests: [{
            userid: { type: mongoose.Schema.Types.ObjectId },
            requestedAt: { type: Date, default: Date.now }
        }],
        coHosts: [{ type: mongoose.Schema.Types.ObjectId }], // Co-hosts with full control except ending room
        bannedUsers: [{ type: mongoose.Schema.Types.ObjectId }], // Permanently banned users
        hardMuted: [{ type: mongoose.Schema.Types.ObjectId }], // Hard muted users (cannot unmute themselves)
        softMuted: [{ type: mongoose.Schema.Types.ObjectId }], // Soft muted users (can unmute themselves)
        isActive: { type: Boolean, default: true },
        startedAt: { type: Date, default: Date.now },
        endedAt: { type: Date },
        summary: {
            totalListeners: { type: Number, default: 0 },
            maxConcurrentListeners: { type: Number, default: 0 },
            activeSpeakers: { type: Number, default: 0 },
            duration: { type: Number, default: 0 } // in seconds
        },
        pinnedMessages: [{ type: mongoose.Schema.Types.ObjectId }] // Pinned messages/chat
    }
)


module.exports = mongoose.model("VoiceMeet", voicemeetSchema);
