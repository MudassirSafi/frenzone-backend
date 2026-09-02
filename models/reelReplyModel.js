const mongoose = require("mongoose")

const reelReplySchema = new mongoose.Schema(
    {
        userid: { type: mongoose.Schema.Types.ObjectId, required: true },
        commentid: { type: mongoose.Schema.Types.ObjectId, required: true },
        description: {type:String,required:true},
        likes: [{ type: mongoose.Schema.Types.ObjectId,default:[] }],
    }
)


module.exports = mongoose.model("ReelReply", reelReplySchema);