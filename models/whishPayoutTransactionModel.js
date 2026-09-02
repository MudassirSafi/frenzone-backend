const mongoose = require("mongoose");

const whishPayoutTransactionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    globalTransactionId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "GlobalTransaction",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed"],
      default: "pending",
      index: true,
    },
    whishRequestPayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    whishResponsePayload: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },
    callbackType: {
      type: String,
      enum: ["success", "failure", null],
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("WhishPayoutTransaction", whishPayoutTransactionSchema);
