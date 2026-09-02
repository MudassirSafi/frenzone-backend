const mongoose = require("mongoose");

const userPowerUpSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    hostId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    powerUp: { type: String, required: true },
    status: { type: String, enum: ['active', 'used', 'expired'], default: 'active' },
    acquiredAt: { type: Date, default: Date.now },
    expiresAt: { type: Date },
    usedAt: { type: Date }
});

userPowerUpSchema.index({ userId: 1, hostId: 1 });

module.exports = mongoose.model("UserPowerUp", userPowerUpSchema);
