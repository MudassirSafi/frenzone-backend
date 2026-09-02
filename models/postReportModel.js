const mongoose = require("mongoose");

const postReportSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  reported: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  postid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "Post" },
  message: {
    type: String,
    default: ""
  },
  type: {
    type: String,
    enum: ["nudity", "harmful"],
    default: "harmful"
  }
},{
  timestamps: true
});

module.exports = mongoose.model("PostReport", postReportSchema);
