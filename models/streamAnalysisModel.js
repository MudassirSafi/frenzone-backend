const mongoose = require("mongoose");

const streamAnalysisSchema = new mongoose.Schema(
  {
    streamid: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    userid: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    clubid: { type: mongoose.Schema.Types.ObjectId, default: null },
    likes: { type: Number, default: 0 },
    giftsReceived: { type: Number, default: 0 },
    giftCoins: { type: Number, default: 0 },
    diamondsEarned: { type: Number, default: 0 },
    usdEarned: { type: Number, default: 0 },
    topGifters: [{
      userid: { type: mongoose.Schema.Types.ObjectId },
      username: { type: String, default: "" },
      profilePicture: { type: String, default: "" },
      giftCount: { type: Number, default: 0 },
      coins: { type: Number, default: 0 },
    }],
    endedAt: { type: Date, default: Date.now, index: true },
  },
  { timestamps: true },
);

streamAnalysisSchema.index({ userid: 1, endedAt: -1 });

module.exports = mongoose.model("StreamAnalysis", streamAnalysisSchema);
