const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  firebaseUid: { type: String, unique: true, sparse: true, index: true },
  username: { type: String, required: true },
  firstname: { type: String, default: "" },
  lastname: { type: String, default: "" },
  email: { type: String },
  phone: { type: String, default: "" },
  address: { type: String, default: "" },
  dob: { type: String, default: "" },
  password: { type: String, default: "" },
  appleId: { type: String },
  twitterId: { type: String },
  about: { type: String, default: "" },
  profilePicture: { type: String, default: "" },

  followers: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  following: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  posts: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  stories: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  reels: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  blocked: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  blockedBy: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],

  twitterUrl: { type: String, default: "" },
  facebookUrl: { type: String, default: "" },
  instagramUrl: { type: String, default: "" },
  linkedinUrl: { type: String, default: "" },
  WebsiteUrl: { type: String, default: "" },
  tiktokUrl: { type: String, default: "" },
  youtubeUrl: { type: String, default: "" },
  country: { type: String, default: "" },
  language: { type: String, default: "" },
  bio: { type: String, default: "" },

  walletid: { type: mongoose.Schema.Types.ObjectId },
  is_online: { type: String, default: "0" },
  savedPosts: [{ type: mongoose.Schema.Types.ObjectId, default: [] }],
  isVerified: { type: Boolean, default: false },

  clubid: { type: mongoose.Schema.Types.ObjectId, ref: "Club", default: null },
  clubsJoined: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  fcmtoken: [{ type: String, default: [] }],

  liveAccess: { type: Boolean, default: true },
  banned: { type: Boolean, default: false },
  isLive: { type: Boolean, default: false },
  isOnCall: { type: Boolean, default: false },

  pliadAccessToken: { type: String, default: "" },
  plaidItemId: { type: String, default: "" },
  liveRemoteId: { type: String, default: "" },

  presentModerators: { type: [mongoose.Schema.Types.ObjectId], default: [] },
  presentBroadcasters: { type: [mongoose.Schema.Types.ObjectId], default: [] },

  tag: { type: String, default: "" },
  isAdminBlocked: { type: Boolean, default: false },
  paymentVerified: { type: Boolean, default: false },
  loginFrom: { type: String, default: "" },

  bankAccount: { type: mongoose.Schema.Types.ObjectId, default: null },
  paypalAccount: { type: mongoose.Schema.Types.ObjectId, default: null },

  subscribedProducts: { type: [String], default: [] },

  lemVerified: { type: Boolean, default: false },
  lemVerifyRejected: { type: Boolean, default: false },
  verifiedExpiration: { type: Date, default: null },

  signupType: { type: String, default: "" },
  ipAddress: { type: String, default: "" },

  interactedReels: [
    {
      reelId: { type: mongoose.Schema.Types.ObjectId, ref: "Reel" },
      interactionType: { type: String, enum: ["like", "comment", "view"] },
      timestamp: { type: Date, default: Date.now },
    },
  ],

  identityVerified: { type: Boolean, default: false },

  identifyApprovalStatus: {
    type: String,
    enum: ["pending", "none", "temporary_rejected", "permanent_rejected", "approved"],
    default: "none"
  },

  identifyApprovalMessage: { type: String, default: "" },
  diditSessionId: { type: String, default: "" },
  diditLastEventId: { type: String, default: "" },
  diditLastEventTimestamp: { type: Number, default: 0 },

  underStrike: { type: Boolean, default: false },
  systemBlocked: { type: Boolean, default: false },

  isPhantom: { type: Boolean, default: false },
  phantomExpiresAt: { type: Date, default: null },
  phantomId: { type: Number, default: null },
  todaysPrivateStreamingMinutes: { type: Number, default: 0 },
  isVIP: { type: Boolean, default: false },

  strikeHistory: {
    type: [
      {
        reason: String,
        startDate: Date,
        endDate: Date,
        status: {
          type: String,
          enum: ["active", "lifted"],
          default: "active"
        }
      }
    ],
    default: []
  },

  bankAccountDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  paypalAccountDetails: { type: mongoose.Schema.Types.Mixed, default: null },
  paypalAccountPayout: { type: String, default: "" },

  app_user_id: {
    type: String,
    default: null,
  },

  liveShoppingActive: {
    type: Boolean,
    default: false,
  },

  liveShoppingExpirationAt: {
    type: Date,
    default: null,
  },

  onboarding: {
    active: { type: Boolean, default: false },
    completed: { type: Boolean, default: false },
    likes: { type: Number, default: 0 },
    follows: { type: Number, default: 0 },
    sentGift: { type: Boolean, default: false },
    createdClub: { type: Boolean, default: false },
    completedAt: { type: Date, default: null },
  },

  minutesSpentInApp: { type: Number, default: 0 },
  lastAppMinutePingAt: { type: Date, default: null },

  rankingPoints: { type: Number, default: 0 },

  creatorScore: { type: Number, default: null, index: true },
  creatorScoreCalculatedAt: { type: Date, default: null, index: true },
  creatorScoreMetrics: {
    followers: { type: Number, default: 0 },
    postsLast30Days: { type: Number, default: 0 },
    averageLikes: { type: Number, default: 0 },
    averageComments: { type: Number, default: 0 },
    averageShares: { type: Number, default: 0 },
    uniqueGifters: { type: Number, default: 0 },
    clubSubscribers: { type: Number, default: 0 },
  },

  badges: [{ type: mongoose.Schema.Types.ObjectId, ref: "Badge", default: [] }],
  hideFollowersFollowing: { type: Boolean, default: false },
  isPrivate: { type: Boolean, default: false },
  acceptMessages: { type: Boolean, default: true },

  followRequests: {
    type: [
      {
        from: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        createdAt: { type: Date, default: Date.now },
      },
    ],
    default: [],
  },

  bankAccountPayout: { type: String, default: "" },
});

userSchema.index({ "interactedReels.reelId": 1, "interactedReels.timestamp": -1 });

module.exports = mongoose.model("User", userSchema);
