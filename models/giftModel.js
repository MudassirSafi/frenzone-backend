const mongoose = require("mongoose");

const giftSchema = new mongoose.Schema({
  name: {
    type: String,
    default: ""
  },
  thumbnail: {
    type: String,
    required: true
  },
  gif: {
    type: String,
    default: ""
  },
  price: {
    type: Number,
    required: true
  },
  isSvga: {
    type: Boolean,
    default: false
  },
  giftFile: {
    type: String,
    default: ""
  },

  isExclusive: {
    type: Boolean,
    default: false
  },
});

module.exports = mongoose.model("Gift", giftSchema);
