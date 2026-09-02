    const mongoose = require("mongoose")

    const transactionSchema = new mongoose.Schema({
        senderid: { type: mongoose.Schema.Types.ObjectId, required: true },
        receiverid: { type: mongoose.Schema.Types.ObjectId, required: true },
        amount:{type:Number,required:true}
    },{timestamps:true})

    module.exports = mongoose.model("Transaction", transactionSchema);