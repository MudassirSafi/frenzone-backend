const mongoose = require("mongoose");

const systemSchema = new mongoose.Schema(
  {
    title: {
      type: String,
      default: "Frenzone"
    },
    version: {
      type: String,
      default: ""
    },
    os: {
      type: String,
      enum: ["android", "apple"],
      default: ""
    },
    latestUser: {
      type: Number,
      default: 0
    },
    mustSubscribeUsers: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "User" }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("System", systemSchema);
