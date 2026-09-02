const mongoose = require("mongoose");

const bankAccountSchema = new mongoose.Schema({
  userid: { type: mongoose.Schema.Types.ObjectId, required: true },
  name: {
    type: String,
    default: ""
  },
  accountNumber: {
    type: String,
    default: ""
  },
  addressLine1: {
    type: String,
    default: ""
  },
  addressLine2: {
    type: String,
    default: ""
  },
  city: {
    type: String,
    default: ""
  },
  province: {
    type: String,
    default: ""
  },
  postalCode: {
    type: String,
    default: ""
  },
  receivingBank: {
    type: String,
    default: ""
  },
  routingNumber: {
    type: String,
    default: ""
  },
  swiftCode: {
    type: String,
    default: ""
  },
  intermediaryBankName: {
    type: String,
    default: ""
  },
  internationalBankName: {
    type: String,
    default: ""
  },
  referenceInformation: {
    type: String,
    default: ""
  },
  purposeOfPayment: {
    type: String,
    default: ""
  }
});

module.exports = mongoose.model("BankAccount", bankAccountSchema);
