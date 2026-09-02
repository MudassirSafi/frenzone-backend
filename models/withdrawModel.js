const mongoose = require("mongoose");

const withdrawSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  amount: { type: Number, required: true },
  status: { type: String, default: "pending", enum: ["pending", "cancelled", "processed"] },
  createdAt: { type: Date, default: Date.now },
});

const Withdraw = mongoose.model("Withdraw", withdrawSchema);

module.exports = Withdraw;
