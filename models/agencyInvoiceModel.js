const mongoose = require("mongoose");

const agencyInvoiceSchema = new mongoose.Schema(
  {
    agency_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Agency",
      required: true,
      index: true,
    },
    invoice_number: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      index: true,
    },
    period: {
      type: String,
      required: true, // e.g. "August 2026"
      trim: true,
    },
    issue_date: {
      type: Date,
      required: true,
      default: Date.now,
    },
    due_date: {
      type: Date,
      required: true,
    },
    gross_creator_revenue: {
      type: Number,
      required: true,
      default: 0,
    },
    commission_rate: {
      type: Number,
      required: true,
      default: 20, // standard 20% commission
    },
    amount: {
      type: Number,
      required: true, // net 20% agency cut
      default: 0,
    },
    platform_fees: {
      type: Number,
      default: 0,
    },
    currency: {
      type: String,
      default: "USD",
      trim: true,
    },
    status: {
      type: String,
      enum: ["PAID", "PROCESSING", "PENDING", "OVERDUE"],
      default: "PENDING",
      index: true,
    },
    payout_date: {
      type: Date,
      default: null,
    },
    wire_reference: {
      type: String,
      default: "", // e.g. "WIRE-TR-982147"
      trim: true,
    },
    download_url: {
      type: String,
      default: "",
    },
    creator_breakdown: [
      {
        creator_id: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
        creator_name: { type: String, default: "" },
        username: { type: String, default: "" },
        gross_revenue: { type: Number, default: 0 },
        commission_amount: { type: Number, default: 0 },
      },
    ],
    notes: {
      type: String,
      default: "",
    },
  },
  { timestamps: true }
);

agencyInvoiceSchema.index({ agency_id: 1, period: 1 });

module.exports = mongoose.model("AgencyInvoice", agencyInvoiceSchema);
