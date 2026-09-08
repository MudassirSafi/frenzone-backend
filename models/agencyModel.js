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
    bank_account: {
      bank_name: { type: String, default: "", trim: true },
      account_holder_name: { type: String, default: "", trim: true },
      account_number_masked: { type: String, default: "", trim: true },
      account_number_last4: { type: String, default: "", trim: true },
      swift_bic: { type: String, default: "", trim: true },
      routing_number: { type: String, default: "", trim: true },
      iban: { type: String, default: "" , trim: true },
      currency: { type: String, default: "USD", trim: true },
      payout_schedule: {
        type: String,
        enum: ["MONTHLY_15TH", "BI_WEEKLY"],
        default: "MONTHLY_15TH",
      },
      status: {
        type: String,
        enum: ["UNREGISTERED", "PENDING_VERIFICATION", "ACTIVE", "REJECTED"],
        default: "UNREGISTERED",
      },
      verified_at: { type: Date, default: null },
      updated_by: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("Agency", agencySchema);
