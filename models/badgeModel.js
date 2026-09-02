const mongoose = require("mongoose");

const badgeSchema = new mongoose.Schema(
  {
    image: { type: String, default: "" }, // S3 key
    title: { type: String, required: true },
    text: { type: String, default: "" },
  },
  { timestamps: true },
);

module.exports = mongoose.model("Badge", badgeSchema);

