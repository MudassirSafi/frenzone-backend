const mongoose = require("mongoose");

const reelSchema = new mongoose.Schema(
  {
    userid: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    description: { type: String, required: true },
    likes: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
    shares: {
      type: Number,
      default: 0
    },
    video: { type: String, default: "" },
    viewedBy: [
      { type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] },
    ],
    thumbnail: { type: String, default: "" },
    sightengineResults: [{ type: String, default: [] }],
    taggedUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    commentsAllowed: {
      type: Boolean,
      default: true
    },
    location: { type: String, default: "" },
    interactionScore: { type: Number, default: 0 }, // For trending calculations
    tags: [{ type: String, default: [] }], // Extracted tags for better matching
  },
  { timestamps: true }
);

// Index for efficient querying
reelSchema.index({ createdAt: -1, interactionScore: -1 });

module.exports = mongoose.model("Reel", reelSchema);
