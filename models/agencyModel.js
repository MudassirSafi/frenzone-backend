const mongoose = require("mongoose");

const agencySchema = new mongoose.Schema(
  {
    agency_name: {
      type: String,
      required: true,
      trim: true,
    },
    country: {
      type: String,
      required: true,
      trim: true,
    },
    business_address: {
      type: String,
      required: true,
      trim: true,
    },
    registration_number: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    tax_id: {
      type: String,
      default: "",
      trim: true,
    },
    website: {
      type: String,
      default: "",
      trim: true,
    },
    main_contact: {
      name: { type: String, required: true, trim: true },
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, default: "", trim: true },
    },
    owner_user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["pending", "approved", "rejected", "suspended"],
      default: "pending",
      index: true,
    },
    admin_review: {
      reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      reviewed_at: { type: Date, default: null },
      review_notes: { type: String, default: "" },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Agency", agencySchema);
