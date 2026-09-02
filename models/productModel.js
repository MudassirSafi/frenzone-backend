const mongoose = require("mongoose");

const productSchema = new mongoose.Schema(
  {
    creatorId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    title: { type: String, required: true, trim: true },
    description: { type: String, default: "", trim: true },
    price: { type: Number, required: true, min: 0 },
    images: { type: [String], default: [] },
    externalUrl: { type: String, default: "", trim: true },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Product", productSchema);
