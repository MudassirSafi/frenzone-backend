const mongoose = require("mongoose");

const transactionSchema = new mongoose.Schema(
  {
    user_id: {
      // Who paid / initiated the transaction
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    creator_id: {
      // Who earns (usually the content creator / club owner)
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      index: true,
    },
    type: {
      type: String,
      enum: [
        "tip",
        "club_subscription",
        "live_shop_subscription",
        "paywall",
        "coin_purchase", // when user buys coins
        "withdrawal", // creator withdraws earnings
        "admin_credit", // rare - manual admin adjustment
        "refund", // optional future
      ],
      required: true,
      index: true,
    },
    amount: {
      // Gross amount paid by user (in USD or your main currency)
      type: Number,
      required: true,
    },
    platform_fee: {
      // Your platform cut (e.g. 28%)
      type: Number,
      default: 0,
    },
    net_creator_amount: {
      // Amount that actually goes to creator after fee
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["pending", "completed", "failed", "refunded"],
      default: "pending",
      index: true,
    },
    payment_provider_tx_id: {
      // Stripe, PayPal, Apple, Google receipt id
      type: String,
      sparse: true,
    },
    product_id: {
      // RevenueCat product identifier
      type: String,
      default: null,
      index: true,
    },
    content_id: {
      // For paywall posts/club content (Post._id or other)
      type: mongoose.Schema.Types.ObjectId,
      refPath: "content_model",
      default: null,
    },
    content_model: {
      // Dynamic ref - 'Post' for paywall, future other types
      type: String,
      enum: ["Post", "Club", null],
      default: null,
    },
    subscription_period: {
      // 'monthly', 'yearly', etc for club subs
      type: String,
      default: null,
    },
    metadata: {
      // Flexible field for extra info
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    app_user_id: {
      // RevenueCat's app_user_id for the user
      type: String,
      default: null,
      index: true,
    },
    original_app_user_id: {
      // RevenueCat's original_app_user_id (for transfers/aliases)
      type: String,
      default: null,
    },
    store: {
      // 'APP_STORE', 'PLAY_STORE', 'STRIPE', 'PROMOTIONAL', etc.
      type: String,
      default: null,
    },
    environment: {
      // 'PRODUCTION' or 'SANDBOX'
      type: String,
      default: null,
    },
    revenuecat_event_id: {
      // Unique ID from RevenueCat webhook event
      type: String,
      unique: true, // To prevent duplicates on retries
      sparse: true,
    },
    entitlement_id: {
      // RevenueCat entitlement (e.g., for access levels)
      type: String,
      default: null,
    },
    original_transaction_id: {
      // For subscription chains (e.g., renewals link back)
      type: String,
      default: null,
    },
    purchased_at: {
      // Date of purchase (from purchased_at_ms)
      type: Date,
      default: null,
    },
    expiration_at: {
      // Expiration date for subscriptions (from expiration_at_ms)
      type: Date,
      default: null,
      index: true, // For querying active/expired
    },
    is_family_share: {
      // If shared via family sharing
      type: Boolean,
      default: false,
    },
    offer_code: {
      // Discount/offer code used
      type: String,
      default: null,
    },
    cancel_reason: {
      // For CANCELLATION events (e.g., 'BILLING_ERROR')
      type: String,
      default: null,
    },
    expiration_reason: {
      // For EXPIRATION events (e.g., 'CUSTOMER_SUPPORT')
      type: String,
      default: null,
    },
    grace_period_expiration_at: {
      // For BILLING_ISSUE grace periods
      type: Date,
      default: null,
    },
    subscriber_attributes: {
      // Custom attributes from RevenueCat
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    is_renewal: {
      // Flag for RENEWAL events
      type: Boolean,
      default: false,
    },
    club_id: {
      // Link to Club for subscriptions (if applicable)
      type: mongoose.Schema.Types.ObjectId,
      ref: "Club",
      default: null,
    },
    post_id: {
      // Link to Post for paywalls (replaces content_id/content_model for simplicity)
      type: mongoose.Schema.Types.ObjectId,
      ref: "Post",
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

// Important compound indexes for dashboard & reports
transactionSchema.index({ creator_id: 1, status: 1, createdAt: -1 });
transactionSchema.index({ user_id: 1, creator_id: 1, status: 1 });
transactionSchema.index({ type: 1, status: 1, createdAt: -1 });
transactionSchema.index({ app_user_id: 1, status: 1 });
transactionSchema.index({ revenuecat_event_id: 1 });
transactionSchema.index({ expiration_at: 1, status: 1 }); // For managing expirations
transactionSchema.index({ purchased_at: 1, type: 1 }); // For period-based filters

module.exports = mongoose.model("GlobalTransaction", transactionSchema);
