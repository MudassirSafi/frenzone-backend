const mongoose = require("mongoose");

const payoutSchema = new mongoose.Schema({
  userId: { 
    type: mongoose.Schema.Types.ObjectId, 
    ref: "User",
    required: true 
  },
  payoutMethod: { 
    type: String, 
    enum: ["wise", "paypal", "whish"],
    required: true 
  },
  amount: { 
    type: Number, 
    required: true 
  },
  status: { 
    type: String, 
    enum: ["pending", "processing", "completed", "failed", "cancelled"],
    default: "pending" 
  },
  payoutId: { 
    type: String, // External payout ID from Wise/PayPal
    default: "" 
  },
  recipientDetails: {
    type: mongoose.Schema.Types.Mixed, // Store recipient info snapshot
    default: {}
  },
  fee: { 
    type: Number, 
    default: 0 
  },
  netAmount: { // Amount after fees
    type: Number, 
    required: true 
  },
  currency: { 
    type: String, 
    default: "USD" 
  },
  errorMessage: { 
    type: String, 
    default: "" 
  },
  processedAt: { 
    type: Date 
  },
  completedAt: { 
    type: Date 
  },

  
  // whish pay temporary data:
  // fullname: { 
  //   type: String 
  // },
  // email: { 
  //   type: String 
  // },
  // phoneNumber: { 
  //   type: String 
  // },
  // lebaneseId: { 
  //   type: String 
  // },
  // lebanesePhoneNumber: { 
  //   type: String 
  // }
}, {
  timestamps: true
});

payoutSchema.index({ userId: 1, createdAt: -1 });
payoutSchema.index({ status: 1 });

module.exports = mongoose.model("Payout", payoutSchema);