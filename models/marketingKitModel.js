const mongoose = require("mongoose");

const marketingKitSchema = new mongoose.Schema(
  {
    assetId: {
      type: String,
      required: true,
      unique: true,
      index: true,
      trim: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
      default: "",
      trim: true,
    },
    category: {
      type: String,
      enum: ["Social Badge", "Stream Overlay", "Promo Video", "Banner", "Brand Guidelines"],
      required: true,
      index: true,
    },
    fileFormat: {
      type: String,
      required: true,
      trim: true,
    },
    dimensions: {
      type: String,
      required: true,
      trim: true,
    },
    fileSize: {
      type: String,
      required: true,
      trim: true,
    },
    fileName: {
      type: String,
      required: true,
      trim: true,
    },
    previewUrl: {
      type: String,
      default: "",
      trim: true,
    },
    downloadUrl: {
      type: String,
      default: "",
      trim: true,
    },
    targetAudience: {
      type: String,
      enum: ["CREATOR", "AGENCY", "ALL"],
      default: "CREATOR",
      index: true,
    },
    isActive: {
      type: Boolean,
      default: true,
      index: true,
    },
    downloadCount: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

marketingKitSchema.index({ targetAudience: 1, isActive: 1, category: 1 });

module.exports = mongoose.model("MarketingKit", marketingKitSchema);
