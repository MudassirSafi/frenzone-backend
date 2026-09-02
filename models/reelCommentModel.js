const mongoose = require("mongoose")


const reelCommentSchema = new mongoose.Schema(
    {
        userid: { type: mongoose.Schema.Types.ObjectId, required: true },
        reelid: { type: mongoose.Schema.Types.ObjectId, required: true },
        description: {type:String,required:true},
        likes: [{ type: mongoose.Schema.Types.ObjectId,default:[] }],
        replies: [{ type: mongoose.Schema.Types.ObjectId,default:[] }],
        taggedUsers: { type: [mongoose.Schema.Types.ObjectId], default: [] }
    },
    {timestamps:true}
)


module.exports = mongoose.model("ReelComment", reelCommentSchema);