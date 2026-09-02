const mongoose = require("mongoose");

const messageRequestSchema = new mongoose.Schema(
  {
    ownerid: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    requesterid: {
      type: mongoose.Schema.Types.ObjectId,
      required: true,
      ref: "User",
    },
    accepted: {
      type: Boolean,
      default: false,
    },
    acceptedAt: {
      type: Date,
    },
    declined: {
      type: Boolean,
      default: false,
    },
    declinedAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

messageRequestSchema.index({ ownerid: 1, requesterid: 1 }, { unique: true });

module.exports = mongoose.model("MessageRequest", messageRequestSchema);
