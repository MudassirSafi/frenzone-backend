// models/LiveGoal.js
const mongoose = require('mongoose');

const ReceivedGiftSchema = new mongoose.Schema({
    giftId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'Gift',
        required: true
    },
    senderId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    }
}, { _id: false });

const LiveGoalSchema = new mongoose.Schema({
    hostId: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
        required: true
    },

    giftIds: {
        type: [{
            type: mongoose.Schema.Types.ObjectId,
            ref: 'Gift'
        }],
        required: true,
        validate: [
            arr => arr.length === 8,
            'You must target exactly 8 gifts'
        ]
    },

    receivedGiftIds: {
        type: [ReceivedGiftSchema],
        default: []
    },

    status: {
        type: String,
        enum: ['pending', 'completed'],
        default: 'pending'
    },

    createdAt: {
        type: Date,
        default: () => new Date()
    },

    expiresAt: {
        type: Date,
        required: true
    }
});

// TTL index to auto-expire old goals
LiveGoalSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('LiveGoal', LiveGoalSchema);
