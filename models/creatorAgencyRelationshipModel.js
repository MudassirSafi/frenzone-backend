const mongoose = require("mongoose");

const creatorAgencyRelationshipSchema = new mongoose.Schema(
  {
    creator_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    agency_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    invited_by: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
    },
    status: {
      type: String,
      enum: [
        "pending_creator_consent",
        "pending_admin_approval",
        "active",
        "rejected",
        "terminated",
      ],
      default: "pending_creator_consent",
      index: true,
    },
    joined_at: {
      type: Date,
      default: null,
    },
    terminated_at: {
      type: Date,
      default: null,
    },
  },
  { timestamps: true }
);

// Enforce invariant: A creator can belong to at most ONE active/pending agency relationship at a time
creatorAgencyRelationshipSchema.index(
  { creator_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: {
        $in: ["pending_creator_consent", "pending_admin_approval", "active"],
      },
    },
  }
);

module.exports = mongoose.model(
  "CreatorAgencyRelationship",
  creatorAgencyRelationshipSchema
);
