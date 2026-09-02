const mongoose = require("mongoose")

const scheduledStreamSchema = new mongoose.Schema(
    {
        userid: { type: mongoose.Schema.Types.ObjectId, required: true },
        clubid: { type: mongoose.Schema.Types.ObjectId, required: true },
        scheduleTime: {
            type: Date,
            required: true
        },
    }
)


module.exports = mongoose.model("ScheduledStream", scheduledStreamSchema);