const mongoose = require("mongoose");

const postSchema = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    description: { type: String, default: "" },
    likes: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
    comments: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
    shares: {
      type: Number,
      default: 0
    },
    sharedBy: [{ type: mongoose.Schema.Types.ObjectId, ref: "User", default: [] }],
    trendingScore: { type: Number, default: null, index: true },
    trendingCalculatedAt: { type: Date, default: null, index: true },
    contents: [{ type: String, default: [] }],
    thumbnails: [{ type: String, default: [] }],
    postType: { type: String, enum: ["paid", "public"] },
    savedBy: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
    price: { type: Number, default: 0 },
    canView: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
    pinned: { type: Boolean, default: false },
    sigthengineResults: { type: Object, default: {} },
    commentsAllowed: {
      type: Boolean,
      default: true
    },
    textPost: {
      type: Boolean,
      default: false
    },
    location: { type: String, default: "" },
    taggedUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] },
    restrictedContent: { type: Boolean, default: false },
    abusiveText: { type: Boolean, default: false }
  },
  {
    timestamps: true,
  }
);

postSchema.index({ trendingScore: -1, createdAt: -1 });

module.exports = mongoose.model("Post", postSchema);
