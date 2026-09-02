const mongoose = require("mongoose");
const reportSchema = new mongoose.Schema({
  reportedUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },
  reason: {
    type: String,
    required: true,
  },
  reportedAt: {
    type: Date,
    default: Date.now,
  },
});

const Report = mongoose.model("Report", reportSchema);
module.exports = Report;
