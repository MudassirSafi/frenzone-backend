const mongoose = require("mongoose")

const clubRoomSchema = new mongoose.Schema({
    clubid: { type: mongoose.Schema.Types.ObjectId, required: true },
    userid: { type: mongoose.Schema.Types.ObjectId, required: true },
    members:{ type: [mongoose.Schema.Types.ObjectId], ref: "User", default: [] },
    roomType: {
        type: String,
        default: "primary",
        enum: ["primary", "secondary"]
    },
    channelType: {
        type: String,
        default: "text",
        enum: ["text", "voice"]
    },
    name: {
        type: String,
        default: ""
    },
    image: {
        type: String,
        default: ""
    }
},{timestamps:true})

module.exports = mongoose.model("ClubRoom", clubRoomSchema);
