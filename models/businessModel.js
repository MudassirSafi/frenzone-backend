const mongoose = require("mongoose");

const businessSchema = new mongoose.Schema(
  {
    version: String,
    mustSubscribeUsers: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "User" }],
    topInfluencers: [{ type: mongoose.Schema.Types.ObjectId, default: [], ref: "User" }],
  },
  { timestamps: true }
);

module.exports = mongoose.model("Business", businessSchema);
