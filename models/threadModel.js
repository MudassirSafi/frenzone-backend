const mongoose = require("mongoose")



const threadSchema = new mongoose.Schema({
    participantOneId:{type:mongoose.Schema.Types.ObjectId},
    participantTwoId:{type:mongoose.Schema.Types.ObjectId},
    contentType:{type:String,default:""},
    last_message:{type:String,default:""},
    last_message_sender_id:{type:mongoose.Schema.Types.ObjectId},
    last_message_Username:{type:String},
    last_message_timestamp:{type:Date},
    mutedBy:[{type:mongoose.Schema.Types.ObjectId, ref:"User"}],
})




module.exports = mongoose.model("Thread", threadSchema);
