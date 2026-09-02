const mongoose = require("mongoose")

const clubChatSchema = new mongoose.Schema({
    senderid: { type: mongoose.Schema.Types.ObjectId, required: true },
    clubid: { type: mongoose.Schema.Types.ObjectId, required: true },
    roomid: { type: mongoose.Schema.Types.ObjectId, required: true },
    message:{type:String,default:""},
    media:{type:String,default:""}
},{timestamps:true})

module.exports = mongoose.model("ClubChat", clubChatSchema);