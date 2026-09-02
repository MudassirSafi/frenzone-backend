const mongoose = require("mongoose");

const verificationSchema = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, required: true },
    lemid: {
      type: String,
      default: ""
    },
    friendlyId: {
      type: String,
      default: ""
    },
    url: {
      type: String,
      default: ""
    },
    deliveryMethods: [{
      type: String,
      default: []
    }]
  },
  { timestamps: true }
);

module.exports = mongoose.model("Verification", verificationSchema);
