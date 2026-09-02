const mongoose = require("mongoose");

const reviewSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  review: { type: String, required: true },
  rating: { type: Number, default: 1 }
},
{
  timestamps: true
});

module.exports = mongoose.model("Review", reviewSchema);
