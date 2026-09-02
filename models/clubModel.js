const mongoose = require("mongoose")

const clubSchema = new mongoose.Schema({
    userid: { type: mongoose.Schema.Types.ObjectId, required: true },
    privateChatRooms:{type:Boolean,default:false},
    pictureSharing:{type:Boolean,default:false},
    liveChatRooms:{type:Boolean,default:false},
    voiceCall:{type:Boolean,default:false},
    members:{ type: [mongoose.Schema.Types.ObjectId], default: [] },
    rooms:{ type: [mongoose.Schema.Types.ObjectId], ref: "ClubRoom", default: [] },
    primaryRoom: {
        type: mongoose.Schema.Types.ObjectId,
        default: null,
        ref:"ClubRoom"
    },
    fee:{type:Number,default:0},
    name: {
        type: String,
        default: ""
    },
    image: {
        type: String,
        default: null
    },
    revenuecat_product_id: { // Maps club to RevenueCat product for subs
        type: String,
        default: null
    },
})

module.exports = mongoose.model("Club", clubSchema);