const mongoose = require("mongoose")

const userReportSchema = new mongoose.Schema(
    {
        userid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
        totalReports: Number,
        reports: {
            type: [{
                reason: String,
                reportedOn: Date,
                reportedBy: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" }
            }]
        }
    },
    {
        timestamps: true
    }
)


module.exports = mongoose.model("UserReport", userReportSchema);