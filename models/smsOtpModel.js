const mongoose = require("mongoose")


const smsOtpSchema = new mongoose.Schema({
    phone: { type: String, required: true },
    otp: {
        type: Number,
        required: true
    },
    dob: {type: String, required: true},
    createdAt: {
        type: Date,
        default: Date.now,
        expires: 600 // Automatically delete documents after 10 minutes (600 seconds)
    },
    userid: {type: mongoose.Schema.Types.ObjectId, required: true}
});

module.exports = mongoose.model("smsOtp", smsOtpSchema);
