const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: {
    type: String,
    default: ""
  },
  email: {
    type: String,
    default: ""
  }
  
});

module.exports = mongoose.model("PaypalAccount", bankAccountSchema);
