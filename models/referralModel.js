const mongoose = require("mongoose");

const referralSchema = new mongoose.Schema(
  {
    referrer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    referred_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    referral_code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["registered", "qualified"],
      default: "registered",
      index: true,
    },
    qualification_timestamp: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Referral", referralSchema);
