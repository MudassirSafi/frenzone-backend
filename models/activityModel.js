const mongoose = require("mongoose");

const activitySchema = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, required: true },
    otheruserid: { type: mongoose.Schema.Types.ObjectId },
    text: { type: String, default: "" },
    streamid: { type: mongoose.Schema.Types.ObjectId },
    postid: { type: mongoose.Schema.Types.ObjectId },
    reelid: { type: mongoose.Schema.Types.ObjectId },
    activityType: { type: String, default: "other" },
    voicemeetid: { type: mongoose.Schema.Types.ObjectId },
    walletNotify: {
      type: Boolean,
      default: false
    },
    channel: { type: String, default: "" },
    token: { type: String, default: "" },
    read: {
      type: Boolean,
      default: false
    },
    isComment: {
      type: Boolean,
      default: false
    },
    data: mongoose.Schema.Types.Mixed
  },
  { timestamps: true }
);

module.exports = mongoose.model("Activity", activitySchema);
