const mongoose = require("mongoose")

const callSchema = new mongoose.Schema(
    {
        clubid: { type: mongoose.Schema.Types.ObjectId, required: true },
        channelName:{type:String},
        members: [{ type: mongoose.Schema.Types.ObjectId }],
        token:{type:String,default:""}
    }
)


module.exports = mongoose.model("Call", callSchema);