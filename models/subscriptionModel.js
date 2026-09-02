const mongoose = require("mongoose");

const subscriptionSchema = new mongoose.Schema(
  {
    userid: { type: mongoose.Schema.Types.ObjectId, required: true },
    clubid: {
      type: mongoose.Schema.Types.ObjectId
    },
    status: {
      type: String,
      enum: [
        "subscribed",
        "cancelled"
      ]
    },
    product_id: {
      type: String,
      required: true
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("Subscription", subscriptionSchema);
