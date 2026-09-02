const mongoose = require("mongoose");

const otpSchema = new mongoose.Schema({
  email: { type: String, required: true },
  otp: {
    type: Number,
    required: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
    expires: 600,
  },
  firstname: { type: String, required: true },
  dob: { type: String, default: "" },
  ipAddress: { type: String, default: "" },
  lastname: { type: String, required: true },
  password: { type: String },
  address: { type: String, required: true },
});

module.exports = mongoose.model("Otp", otpSchema);
