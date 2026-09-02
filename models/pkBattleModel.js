// models/PKBattle.js
const mongoose = require("mongoose");

const pkBattleSchema = new mongoose.Schema(
    {
        pkChannelName: { type: String, required: true, unique: true },
        rosesTarget: { type: Number, default: 40 },
        streamerA: {
            userId: { type: mongoose.Schema.Types.ObjectId, required: true },
            streamId: { type: mongoose.Schema.Types.ObjectId, required: true },
            username: { type: String },
            isDoubleOpen: { type: Boolean, default: false },
            thumbnail: { type: String, default: "" },
            isVirtualBackground: { type: Boolean, default: false },
            isProfileThumbnail: { type: Boolean, default: false },
            isLivePaused: { type: Boolean, default: false },
            uniqueId: Number,
            profilePic: { type: String },
            giftCount: { type: Number, default: 0 },
            rosesCount: { type: Number, default: 0 },
            roseSenders: [{ type: mongoose.Schema.Types.ObjectId }],
            topGifters: [
                {
                    userId: mongoose.Schema.Types.ObjectId,
                    username: String,
                    image: String,
                    coins: { type: Number, default: 0 },
                },
            ],
        },
        streamerB: {
            userId: { type: mongoose.Schema.Types.ObjectId, required: true },
            streamId: { type: mongoose.Schema.Types.ObjectId, required: true },
            username: { type: String },
            isDoubleOpen: { type: Boolean, default: false },
            thumbnail: { type: String, default: "" },
            isVirtualBackground: { type: Boolean, default: false },
            isProfileThumbnail: { type: Boolean, default: false },
            isLivePaused: { type: Boolean, default: false },
            uniqueId: Number,
            profilePic: { type: String },
            giftCount: { type: Number, default: 0 },
            rosesCount: { type: Number, default: 0 },
            roseSenders: [{ type: mongoose.Schema.Types.ObjectId }],
            topGifters: [
                {
                    userId: mongoose.Schema.Types.ObjectId,
                    username: String,
                    image: String,
                    coins: { type: Number, default: 0 },
                },
            ],
        },
        startTime: { type: Date, default: Date.now },
        endTime: { type: Date },
        status: {
            type: String,
            enum: ["not_started", "ongoing", "completed"],
            default: "not_started",
        },
        winner: { type: mongoose.Schema.Types.ObjectId, default: null },
        winnerHistory: [
            {
                userId: mongoose.Schema.Types.ObjectId,
                username: String,
                uniqueId: Number,
                wonAt: { type: Date, default: Date.now },
            },
        ],
    },
    {
        versionKey: false,
        optimisticConcurrency: false,
    }
);

module.exports = mongoose.model("PKBattle", pkBattleSchema);
