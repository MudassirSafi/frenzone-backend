const mongoose = require("mongoose");

const agencyMemberSchema = new mongoose.Schema(
  {
    agency_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    role: {
      type: String,
      enum: ["owner", "manager", "finance"],
      default: "manager",
    },
    status: {
      type: String,
      enum: ["active", "invited", "disabled"],
      default: "active",
      index: true,
    },
  },
  { timestamps: true }
);

// Prevent duplicate membership for the same user in the same agency
agencyMemberSchema.index({ agency_id: 1, user_id: 1 }, { unique: true });

module.exports = mongoose.model("AgencyMember", agencyMemberSchema);
