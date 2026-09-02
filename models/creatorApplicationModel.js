const mongoose = require("mongoose");

const creatorApplicationSchema = new mongoose.Schema(
  {
    user_id: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    legal_name: {
      firstname: { type: String, required: true, trim: true },
      lastname: { type: String, required: true, trim: true },
    },
    contact_info: {
      email: { type: String, required: true, trim: true, lowercase: true },
      phone: { type: String, default: "", trim: true },
    },
    demographics: {
      country: { type: String, required: true, trim: true },
      language: { type: String, required: true, trim: true },
      dob: { type: Date, required: true },
    },
    content_profile: {
      category: {
        type: String,
        enum: ["gaming", "music", "lifestyle", "fitness", "art", "education", "other"],
        required: true,
      },
      primary_platform: { type: String, default: "", trim: true },
      social_links: {
        instagram: { type: String, default: "", trim: true },
        tiktok: { type: String, default: "", trim: true },
        youtube: { type: String, default: "", trim: true },
        twitter: { type: String, default: "", trim: true },
      },
      estimated_audience_size: { type: Number, default: 0 },
    },
    legal_agreements: {
      terms_accepted: { type: Boolean, required: true, default: false },
      privacy_accepted: { type: Boolean, required: true, default: false },
      accepted_at: { type: Date, default: Date.now },
    },
    status: {
      type: String,
      enum: ["pending", "more_info_required", "approved", "rejected", "suspended"],
      default: "pending",
      index: true,
    },
    admin_review: {
      reviewed_by: { type: mongoose.Schema.Types.ObjectId, ref: "Admin", default: null },
      reviewed_at: { type: Date, default: null },
      review_notes: { type: String, default: "" },
      more_info_requested_message: { type: String, default: "" },
    },
  },
  {
    timestamps: true,
  }
);

// Prevent duplicate active/pending/approved applications for the same user
creatorApplicationSchema.index(
  { user_id: 1 },
  {
    unique: true,
    partialFilterExpression: {
      status: { $in: ["pending", "more_info_required", "approved"] },
    },
  }
);

module.exports = mongoose.model("CreatorApplication", creatorApplicationSchema);
