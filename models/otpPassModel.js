const mongoose = require("mongoose")


const otpPassSchema = new mongoose.Schema({
    email: { type: String, required: true },
    otp: {
        type: Number,
        required: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // Automatically delete documents after 10 minutes (600 seconds)
    },
});

module.exports = mongoose.model("OtpPass", otpPassSchema);