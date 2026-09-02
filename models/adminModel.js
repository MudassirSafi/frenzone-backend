const mongoose = require("mongoose");

const adminSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      required: true,
      unique: true,
    },
    password: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "administrator", "moderator", "support", "finance", "content_manager"],
      default: "administrator",
    },
    permissions: {
      type: [String],
      default: ["dashboard.read", "users.read", "reports.read", "live.read", "finance.read"],
    },
    disabled: {
      type: Boolean,
      default: false,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
    coinEquivalence: {
      type: Number,
      default: 1,
    },
    adminShare: {
      type: Number,
      default: 0,
    },
    giftShare:{
      type: Number,
      default: 0
    },
    walletid: {
      type: mongoose.Schema.Types.ObjectId,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Admin", adminSchema);
