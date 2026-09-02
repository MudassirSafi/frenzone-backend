const mongoose = require("mongoose");
const walletSchema = new mongoose.Schema({
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
  },
  hourlyReceivedDiamonds: { type: Number, default: 0 },
  weeklyReceivedDiamonds: { type: Number, default: 0 },
  monthlyReceivedDiamonds: { type: Number, default: 0 },


  hourlySentCoins: { type: Number, default: 0 },
  weeklySentCoins: { type: Number, default: 0 },
  monthlySentCoins: { type: Number, default: 0 },
  totalSentCoins: { type: Number, default: 0 },
});

module.exports = mongoose.model("Wallet", walletSchema);
