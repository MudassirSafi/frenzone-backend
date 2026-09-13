const mongoose = require("mongoose");

const referralScanSchema = new mongoose.Schema(
  {
    referral_code: {
      type: String,
      required: true,
      trim: true,
      index: true,
    },
    referrer_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    ip_hash: {
      type: String,
      required: true,
      index: true,
    },
    user_agent: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

// Expire individual scan log entries after 90 days for storage hygiene
referralScanSchema.index({ createdAt: 1 }, { expireAfterSeconds: 7776000 });

// Compound index for fast deduplication check: 1 scan per IP per referral code within time window
referralScanSchema.index({ referral_code: 1, ip_hash: 1, createdAt: -1 });

module.exports = mongoose.model("ReferralScan", referralScanSchema);
