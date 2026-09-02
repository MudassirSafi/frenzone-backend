const mongoose = require("mongoose")

const transactionHistorySchema = new mongoose.Schema({
    userid: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
    amount:{type:Number,required:true},
    transactionType:{type:String,required:true, enum: ["buyCoin", "SendTip", "buyPost"]},
    fee: { type: Number, default: 0},
    adminShare: { type: Number, default: 0},
    userGot: { type: Number, default: 0},
},{timestamps:true})

module.exports = mongoose.model("TransactionHistory", transactionHistorySchema);