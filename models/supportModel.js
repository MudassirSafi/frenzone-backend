const mongoose = require("mongoose");

const supportSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, required: true },
  currentAmount: { type: Number, default: 0 },
  earnedAmount: { type: Number, default: 0 },
  boughtAmount: {
    type: Number,
    default: 0,
  },
  diamonds: {
    type: Number,
    default: 0,
  },
  coins: {
    type: Number,
    default: 0,
  },
  cash: {
    type: Number,
    default: 0
  }
});

module.exports = mongoose.model("Support", supportSchema);
