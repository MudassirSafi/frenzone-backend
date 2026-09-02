const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const Payout = require("../models/payoutModel");
const WhishPayoutTransaction = require("../models/whishPayoutTransactionModel");
const { sendNotification } = require("../controllers/notificationController");
const { createActivity } = require("../controllers/activityController");
const { catchAsyncError } = require("../helpers/catchAsyncError");
const { ApiFeatures } = require("../helpers/ApiFeatures");
const { aws } = require("../helpers/otherHelpers");
const { v4: uuidv4 } = require('uuid');
const axios = require("axios");
require("dotenv").config();
// Add after the existing imports at the top
const crypto = require('crypto');
const { createTransaction } = require("./globalTransactionController");

// Wise API Configuration
const WISE_API_BASE = process.env.NODE_ENV === "production" 
  ? "https://api.transferwise.com" 
  : "https://api.sandbox.transferwise.tech";

const wiseHeaders = {
  "Authorization": `Bearer ${process.env.WISE_API_KEY}`,
  "Content-Type": "application/json"
};

// PayPal Configuration
const paypal = require("@paypal/payouts-sdk");
const { wiseSupportedCurrencies, paypalSupportedCurrencies } = require("../helpers/payoutSupportedCurrencies");
const Environment = process.env.NODE_ENV === "production"
  ? paypal.core.LiveEnvironment
  : paypal.core.SandboxEnvironment;
const paypalClient = new paypal.core.PayPalHttpClient(
  new Environment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
  )
);

const WHISH_API_BASE =
  process.env.WHISH_API_ENV === "production"
    ? "https://api.whish.money/itel-service/api"
    : "https://api.sandbox.whish.money/itel-service/api";

function fetchSupportedCurrencies(payoutMethod) {
    if (payoutMethod === "wise") {
        return wiseSupportedCurrencies;
    } else if (payoutMethod === "paypal") {
        return paypalSupportedCurrencies;
    } else {
        throw new Error("Invalid payout method");
    }
};

/**
 * Get required fields for payout method based on country and other params
 */
const getPayoutRequirements = catchAsyncError(async (req, res, next) => {
  const { payoutMethod, country, currency = "USD" } = req.body;

  if (!payoutMethod || !["wise", "paypal"].includes(payoutMethod)) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid payout method (wise/paypal) is required" 
    });
  }

  try {
    if (payoutMethod === "wise") {
      if (!country) {
        return res.status(400).json({ 
          success: false, 
          message: "Country is required for Wise payouts" 
        });
      }

      // Get recipient requirements from Wise API
        const response = await axios.post(
        `${WISE_API_BASE}/v1/quotes`,
        {
            source: process.env.WISE_CURRENCY,
            target: currency,
            sourceAmount: 100,
            rateType: "FIXED",
            profile: process.env.WISE_PROFILE_ID
        },
        { headers: wiseHeaders }
        );
    //   }catch(e){
    //     console.log("Wise quote error:", e.response?.data);
    //   }

      const quoteId = response.data.id;
      console.log("Quote ID:", quoteId);

      // Get account requirements
    //   try{
        const requirementsResponse = await axios.get(
        `${WISE_API_BASE}/v1/quotes/${quoteId}/account-requirements?targetCurrency=${currency}&sourceAmount=100`,
        { headers: wiseHeaders }
        );
        console.log("Requirements Response:", requirementsResponse.data);
    //   }catch(e){
    //     console.log("Wise API error:", e.response?.data);
    //   }

      // Filter requirements for the specified country
      const countryRequirements = requirementsResponse.data && requirementsResponse.data.length > 0 ? requirementsResponse.data[0] : null;

      if (!countryRequirements) {
        return res.status(404).json({
          success: false,
          message: `No payout requirements found for country: ${country}`
        });
      }

      var requirements = [];
      requirements.push({
            key: "accountHolderName",
            name: "Acccount holder name",
            type: "text",
            required: true
        })

        countryRequirements.fields.map(field =>{
            requirements.push({
                key: field.group[0].key,
                name: field.name,
                type: field.group[0].type, // text, select, radio, date
                required: field.group[0].required,
                example: field.group[0].example,
                validationRules: field.group[0].validationRegexp,
                options: field.group[0].valuesAllowed?.map(opt => ({
                    key: opt.key,
                    name: opt.name
                }))
            })
        })

        requirements.push({
            key: "currency",
            name: "Currency",
            type: "select",
            required: true,
            options: wiseSupportedCurrencies.map(cur => ({ key: cur.code, name: cur.name, searchTerms: cur.countryKeywords }))
        })

        return res.status(200).json({
            success: true,
            payoutMethod: "wise",
            country,
            currency,
            type: countryRequirements.type,
            requirements
            // requirementsData: countryRequirements
        });
    } 
    else if (payoutMethod === "paypal") {
      // PayPal requirements are simpler
      return res.status(200).json({
        success: true,
        payoutMethod: "paypal",
        requirements: [
          {
            key: "email",
            name: "PayPal Email",
            type: "text",
            required: true,
            example: "user@example.com",
            validationRules: {
              format: "email"
            }
          },
          {
            key: "recipientType",
            name: "Recipient Type",
            type: "select",
            required: true,
            options: [
              { key: "EMAIL", name: "Email" },
              { key: "PHONE", name: "Phone" },
              { key: "PAYPAL_ID", name: "PayPal ID" }
            ]
          }
        ]
      });
    }
  } catch (error) {
    console.error("Error fetching payout requirements:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch payout requirements",
      error: error.response?.data?.message || error.message
    });
  }
});

/**
 * Get supported currencies for a payout method
 */

const getSupportedCurrencies = catchAsyncError(async (req, res, next) => {
  const { payoutMethod } = req.params;

  if (!payoutMethod || !["wise", "paypal"].includes(payoutMethod)) {
    return res.status(400).json({ 
      success: false, 
      message: "Valid payout method (wise/paypal) is required" 
    });
  }

  try {
    return res.status(200).json({
    success: true,
    payoutMethod,
    currencies: fetchSupportedCurrencies(payoutMethod)
    });
  } catch (error) {
    console.error("Error fetching currencies:", error.response?.data || error.message);
    return res.status(500).json({
      success: false,
      message: "Failed to fetch cur",
      error: error.response?.data?.message || error.message
    });
  }
});

/**
 * Validate and save payout account details
 */
const savePayoutAccount = catchAsyncError(async (req, res, next) => {
  const { userId, payoutMethod, accountDetails } = req.body;

  if (!userId || !payoutMethod || !accountDetails) {
    return res.status(400).json({
      success: false,
      message: "userId, payoutMethod, and accountDetails are required"
    });
  }

  if (!["wise", "paypal"].includes(payoutMethod)) {
    return res.status(400).json({
      success: false,
      message: "Invalid payout method. Must be 'wise' or 'paypal'"
    });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    let validationResult;

    if (payoutMethod === "wise") {
      // Validate Wise account
      validationResult = await validateWiseAccount(accountDetails);
      
      if (!validationResult.valid) {
        return res.status(400).json({
          success: false,
          message: "Wise account validation failed",
          errors: validationResult.errors
        });
      }

      // Save to user model
      await User.findByIdAndUpdate(userId, {
        $set: {
          bankAccountPayout: validationResult.recipientId,
          "bankAccountDetails": accountDetails
        }
      });
    } 
    else if (payoutMethod === "paypal") {
      // Validate PayPal account
      validationResult = await validatePayPalAccount(accountDetails);
      
      if (!validationResult.valid) {
        return res.status(400).json({
          success: false,
          message: "PayPal account validation failed",
          errors: validationResult.errors
        });
      }

      // Save to user model
      await User.findByIdAndUpdate(userId, {
        $set: {
          paypalAccountPayout: accountDetails.email || accountDetails.phone || accountDetails.paypalId,
          "paypalAccountDetails": accountDetails
        }
      });
    }

    await sendNotification(
      userId,
      "Payout Account",
      `Your ${payoutMethod.toUpperCase()} payout account has been saved successfully`,
      "payout",
      { payoutMethod }
    );

    return res.status(200).json({
      success: true,
      message: `${payoutMethod.toUpperCase()} account saved successfully`,
      data: validationResult
    });
  } catch (error) {
    console.error("Error saving payout account:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to save payout account",
      error: error.message
    });
  }
});

/**
 * Get user's saved payout accounts
 */
const getPayoutAccounts = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;

  const user = await User.findById(userId).select(
    "bankAccountPayout bankAccountDetails paypalAccountPayout paypalAccountDetails"
  );

  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  return res.status(200).json({
    success: true,
    accounts: {
      wise: {
        saved: !!user.bankAccountPayout,
        details: user.bankAccountDetails || null
      },
      paypal: {
        saved: !!user.paypalAccountPayout,
        details: user.paypalAccountDetails || null
      }
    }
  });
});

/**
 * Update payout account details
 */
const updatePayoutAccount = catchAsyncError(async (req, res, next) => {
  const { userId, payoutMethod, accountDetails } = req.body;

  if (!userId || !payoutMethod || !accountDetails) {
    return res.status(400).json({
      success: false,
      message: "userId, payoutMethod, and accountDetails are required"
    });
  }

  // Reuse the save logic with validation
  return savePayoutAccount(req, res, next);
});

/**
 * Delete payout account
 */
const deletePayoutAccount = catchAsyncError(async (req, res, next) => {
  const { userId, payoutMethod } = req.body;

  if (!userId || !payoutMethod) {
    return res.status(400).json({
      success: false,
      message: "userId and payoutMethod are required"
    });
  }

  const user = await User.findById(userId);
  if (!user) {
    return res.status(404).json({
      success: false,
      message: "User not found"
    });
  }

  if (payoutMethod === "wise") {
    await User.findByIdAndUpdate(userId, {
      $unset: {
        bankAccountPayout: 1,
        bankAccountDetails: 1
      }
    });
  } else if (payoutMethod === "paypal") {
    await User.findByIdAndUpdate(userId, {
      $unset: {
        paypalAccountPayout: 1,
        paypalAccountDetails: 1
      }
    });
  }

  return res.status(200).json({
    success: true,
    message: `${payoutMethod.toUpperCase()} account deleted successfully`
  });
});

/**
 * Request payout
 */
const requestPayout = catchAsyncError(async (req, res, next) => {
  const { userId, payoutMethod, amount, currency = "USD" } = req.body;

  if (!userId || !payoutMethod || !amount) {
    return res.status(400).json({
      success: false,
      message: "userId, payoutMethod, and amount are required"
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Amount must be greater than 0"
    });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const wallet = await Wallet.findOne({ userid: userId });
    if (!wallet || wallet.diamonds < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    // Check if payout account is saved
    if (payoutMethod === "wise" && !user.bankAccountPayout) {
      return res.status(400).json({
        success: false,
        message: "WISE_ACCOUNT_NOT_SAVED",
        error: "Please save your bank account details before requesting payout"
      });
    }

    if (payoutMethod === "paypal" && !user.paypalAccountPayout) {
      return res.status(400).json({
        success: false,
        message: "PAYPAL_ACCOUNT_NOT_SAVED",
        error: "Please save your PayPal account details before requesting payout"
      });
    }

    let payoutResult;
    let fee = 0;
    let netAmount = amount;

    if (payoutMethod === "wise") {
      payoutResult = await processWisePayout(user, amount, user.bankAccountDetails.currency);
      fee = payoutResult.fee;
      netAmount = payoutResult.netAmount;
    } else if (payoutMethod === "paypal") {
      payoutResult = await processPayPalPayout(user, amount, currency);
      fee = payoutResult.fee;
      netAmount = payoutResult.netAmount;
    }

    // Deduct from wallet
    wallet.diamonds -= amount;
    await wallet.save();

    // Create payout record
    const payout = await Payout.create({
      userId,
      payoutMethod,
      amount,
      fee,
      netAmount,
      currency,
      status: payoutResult.status,
      payoutId: payoutResult.payoutId,
      recipientDetails: payoutResult.recipientDetails,
      processedAt: new Date()
    });

    await sendNotification(
      userId,
      "Payout Request",
      `Your payout request of $${amount} via ${payoutMethod.toUpperCase()} has been initiated`,
      "payout",
      { payoutId: payout._id }
    );

    await createActivity(
      userId,
      undefined,
      `Payout request of $${amount} via ${payoutMethod.toUpperCase()}`,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "payout",
      { payoutId: payout._id }
    );

    return res.status(200).json({
      success: true,
      message: "Payout request initiated successfully",
      payout: {
        id: payout._id,
        amount,
        fee,
        netAmount,
        status: payout.status,
        payoutMethod
      }
    });
  } catch (error) {
    console.error("Error requesting payout:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process payout request",
      error: error.message
    });
  }
});

const requestWhishPayout = catchAsyncError(async (req, res, next) => {
  const {
    userId,
    payoutMethod = "whish",
    amount,
    currency = "USD",
    fullname,
    email,
    phoneNumber,
    lebaneseId,
    lebanesePhoneNumber,
    successRedirectUrl,
    failureRedirectUrl
  } = req.body;

  if (!userId || !amount) {
    return res.status(400).json({
      success: false,
      message: "userId and amount are required"
    });
  }

  if (amount <= 0) {
    return res.status(400).json({
      success: false,
      message: "Amount must be greater than 0"
    });
  }

  if (!successRedirectUrl || !failureRedirectUrl) {
    return res.status(400).json({
      success: false,
      message: "successRedirectUrl and failureRedirectUrl are required"
    });
  }

  if (!process.env.WHISH_WEBHOOK_BASE_URL) {
    return res.status(500).json({
      success: false,
      message: "WHISH_WEBHOOK_BASE_URL is not configured"
    });
  }

  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: "User not found"
      });
    }

    const wallet = await Wallet.findOne({ userid: userId });
    if (!wallet || wallet.diamonds < amount) {
      return res.status(400).json({
        success: false,
        message: "Insufficient balance"
      });
    }

    let fee = 0;
    let netAmount = amount;

    const globalTransaction = await createTransaction({
      creator_id: userId,
      type: "withdrawal",
      amount: -amount,
      status: "pending"
    });

    const whishPayoutTransaction = await WhishPayoutTransaction.create({
      userId,
      amount,
      globalTransactionId: globalTransaction._id,
      status: "pending"
    });

    const successCallbackUrl = `${process.env.WHISH_WEBHOOK_BASE_URL}/global-transactions/whish-money-webhook?id=${whishPayoutTransaction._id}&type=success`;
    const failureCallbackUrl = `${process.env.WHISH_WEBHOOK_BASE_URL}/global-transactions/whish-money-webhook?id=${whishPayoutTransaction._id}&type=failure`;

    const whishRequestPayload = {
      amount: String(amount),
      currency: "USD",
      invoice: "Frenzone payout",
      externalId: String(userId),
      successCallbackUrl,
      failureCallbackUrl,
      successRedirectUrl,
      failureRedirectUrl
    };

    await WhishPayoutTransaction.findByIdAndUpdate(whishPayoutTransaction._id, {
      $set: { whishRequestPayload }
    });

    let whishResponse;
    try {
      whishResponse = await axios.post(`${WHISH_API_BASE}/payment/whish`, whishRequestPayload, {
        headers: {
          "Content-Type": "application/json",
          channel: process.env.WHISH_CHANNEL,
          secret: process.env.WHISH_SECRET,
          websiteUrl: process.env.WHISH_WEBSITE_URL,
          "User-Agent": process.env.WHISH_USERAGENT
        }
      });
    } catch (whishError) {
      globalTransaction.status = "failed";
      await globalTransaction.save();
      await WhishPayoutTransaction.findByIdAndUpdate(whishPayoutTransaction._id, {
        $set: {
          status: "failed",
          whishResponsePayload: whishError.response?.data || { message: whishError.message }
        }
      });
      throw new Error(whishError.response?.data?.message || "Whish payout request failed");
    }

    await WhishPayoutTransaction.findByIdAndUpdate(whishPayoutTransaction._id, {
      $set: {
        whishResponsePayload: whishResponse.data || null
      }
    });

    wallet.diamonds -= amount;
    await wallet.save();

    // Create payout record
    const payout = await Payout.create({
      userId,
      payoutMethod,
      amount,
      fee,
      netAmount,
      currency,
      status: "pending",
      payoutId: whishResponse.data?.id || Math.random().toString(36).substring(2, 15),
      recipientDetails: { fullname, email, phoneNumber, lebaneseId, lebanesePhoneNumber },
      processedAt: new Date()
    });

    await sendNotification(
      userId,
      "Payout Request",
      `Your payout request of $${amount} via ${payoutMethod.toUpperCase()} has been initiated`,
      "payout",
      { payoutId: payout._id }
    );

    await createActivity(
      userId,
      undefined,
      `Payout request of $${amount} via ${payoutMethod.toUpperCase()}`,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "payout",
      { payoutId: payout._id }
    );

    return res.status(200).json({
      success: true,
      message: "Payout request initiated successfully",
      payout: {
        id: payout._id,
        amount,
        fee,
        netAmount,
        status: payout.status,
        payoutMethod,
        whishPayoutTrackingId: whishPayoutTransaction._id,
        globalTransactionId: globalTransaction._id
      },
      whishResponse: whishResponse.data
    });
  } catch (error) {
    console.error("Error requesting payout:", error);
    return res.status(500).json({
      success: false,
      message: "Failed to process payout request",
      error: error.message
    });
  }
});

/**
 * Get user payouts
 */
const getUserPayouts = catchAsyncError(async (req, res, next) => {
  const { userId } = req.params;

  let apiFeature = new ApiFeatures(
    Payout.find({ userId }).populate({
      path: "userId",
      select: "username firstname lastname profilePicture"
    }),
    req.query
  )
    .filteration()
    .search();

  const count = await apiFeature.getTotalCount();

  apiFeature.pagination().sort();
  const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
  let result = await apiFeature.mongooseQuery;

  result = await Promise.all(
    result.map(async (payout) => {
      payout = payout.toObject();
      if (payout.userId && payout.userId.profilePicture) {
        payout.userId.profilePicture = await aws.getLinkFromAWS(
          payout.userId.profilePicture
        );
      }
      return payout;
    })
  );

  res.status(200).json({
    success: true,
    count,
    page: PAGE_NUMBER,
    payouts: result
  });
});

/**
 * Get all payouts (Admin)
 */
const getAllPayouts = catchAsyncError(async (req, res, next) => {
  let apiFeature = new ApiFeatures(
    Payout.find({}).populate({
      path: "userId",
      select: "username firstname lastname profilePicture"
    }),
    req.query
  )
    .filteration()
    .search();

  const count = await apiFeature.getTotalCount();

  apiFeature.pagination().sort();
  const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
  let result = await apiFeature.mongooseQuery;

  result = await Promise.all(
    result.map(async (payout) => {
      payout = payout.toObject();
      if (payout.userId && payout.userId.profilePicture) {
        payout.userId.profilePicture = await aws.getLinkFromAWS(
          payout.userId.profilePicture
        );
      }
      return payout;
    })
  );

  res.status(200).json({
    success: true,
    count,
    page: PAGE_NUMBER,
    payouts: result
  });
});

/**
 * Get payout by ID
 */
const getPayoutById = catchAsyncError(async (req, res, next) => {
  const { payoutId } = req.params;

  const payout = await Payout.findById(payoutId).populate({
    path: "userId",
    select: "username firstname lastname profilePicture"
  });

  if (!payout) {
    return res.status(404).json({
      success: false,
      message: "Payout not found"
    });
  }

  if (payout.userId.profilePicture) {
    payout.userId.profilePicture = await aws.getLinkFromAWS(
      payout.userId.profilePicture
    );
  }

  res.status(200).json({
    success: true,
    payout
  });
});

/**
 * Cancel payout
 */
const cancelPayout = catchAsyncError(async (req, res, next) => {
  const { payoutId } = req.body;

  const payout = await Payout.findById(payoutId);
  if (!payout) {
    return res.status(404).json({
      success: false,
      message: "Payout not found"
    });
  }

  if (payout.status !== "pending" && payout.status !== "processing") {
    return res.status(400).json({
      success: false,
      message: "Only pending or processing payouts can be cancelled"
    });
  }

  // Refund to wallet
  const wallet = await Wallet.findOne({ userid: payout.userId });
  wallet.diamonds += payout.amount;
  await wallet.save();

  payout.status = "cancelled";
  await payout.save();

  await sendNotification(
    payout.userId.toString(),
    "Payout Cancelled",
    `Your payout request of $${payout.amount} has been cancelled`,
    "payout",
    { payoutId: payout._id }
  );

  return res.status(200).json({
    success: true,
    message: "Payout cancelled successfully"
  });
});

// ==================== Helper Functions ====================

/**
 * Validate Wise account details
 */
async function validateWiseAccount(accountDetails) {
  try {
    // Create a test quote
    const quoteResponse = await axios.post(
      `${WISE_API_BASE}/v1/quotes`,
      {
        source: accountDetails.currency,
        target: process.env.WISE_CURRENCY,
        sourceAmount: 100,
        rateType: "FIXED",
        profile: process.env.WISE_PROFILE_ID
      },
      { headers: wiseHeaders }
    );

    const quoteId = quoteResponse.data.id;

    // Create recipient
    const recipientResponse = await axios.post(
      `${WISE_API_BASE}/v1/accounts`,
      {
        currency: accountDetails.currency || "USD",
        type: accountDetails.type,
        profile: process.env.WISE_PROFILE_ID,
        ownedByCustomer: false,
        details: accountDetails.details
      },
      { headers: wiseHeaders }
    );

    return {
      valid: true,
      recipientId: recipientResponse.data.id,
      quoteId
    };
  } catch (error) {
    console.error("Wise validation error:", error.response?.data);
    return {
      valid: false,
      errors: error.response?.data?.errors || [error.message]
    };
  }
}

/**
 * Validate PayPal account
 */
async function validatePayPalAccount(accountDetails) {
  try {
    // Basic email/phone validation
    if (accountDetails.recipientType === "EMAIL") {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(accountDetails.email)) {
        return {
          valid: false,
          errors: ["Invalid email format"]
        };
      }
    }

    return {
      valid: true,
      recipientIdentifier: accountDetails.email || accountDetails.phone || accountDetails.paypalId
    };
  } catch (error) {
    return {
      valid: false,
      errors: [error.message]
    };
  }
}

/**
 * Process Wise payout
 */
async function processWisePayout(user, amount, currency) {
  try {
    // Create quote
    const quoteResponse = await axios.post(
      `${WISE_API_BASE}/v1/quotes`,
      {
        source: process.env.WISE_CURRENCY,
        target: currency,
        sourceAmount: amount,
        rateType: "FIXED",
        profile: process.env.WISE_PROFILE_ID
      },
      { headers: wiseHeaders }
    );

    const quote = quoteResponse.data;
    const fee = quote.fee;
    const netAmount = amount - fee;

    // Create transfer
    const transferResponse = await axios.post(
      `${WISE_API_BASE}/v1/transfers`,
      {
        targetAccount: user.bankAccountPayout,
        quoteUuid: quote.id,
        customerTransactionId: uuidv4(),
        details: {
          reference: `Payout to ${user.username}`
        }
      },
      { headers: wiseHeaders }
    );

    // Fund transfer
    await axios.post(
      `${WISE_API_BASE}/v3/profiles/${process.env.WISE_PROFILE_ID}/transfers/${transferResponse.data.id}/payments`,
      {
        type: "BALANCE"
      },
      { headers: wiseHeaders }
    );

    return {
      status: "processing",
      payoutId: transferResponse.data.id,
      fee,
      netAmount,
      recipientDetails: user.bankAccountDetails
    };
  } catch (error) {
    console.error("Wise payout error:", error.response?.data);
    throw new Error(error.response?.data?.errors?.[0]?.message || "Wise payout failed");
  }
}

/**
 * Process PayPal payout
 */
async function processPayPalPayout(user, amount, currency) {
  try {
    const requestBody = {
      sender_batch_header: {
        sender_batch_id: `payout-${user._id}-${Date.now()}`,
        email_subject: "You have received a payout!",
        email_message: "You have received a payout from our platform."
      },
      items: [
        {
          recipient_type: user.paypalAccountDetails?.recipientType || "EMAIL",
          amount: {
            value: amount.toFixed(2),
            currency: currency
          },
          receiver: user.paypalAccountPayout,
          note: `Payout to ${user.username}`,
          sender_item_id: `item-${Date.now()}`
        }
      ]
    };

    const request = new paypal.payouts.PayoutsPostRequest();
    request.requestBody(requestBody);

    const response = await paypalClient.execute(request);

    // PayPal fee is typically 2% or $0.25 minimum
    const fee = Math.max(amount * 0.02, 0.25);
    const netAmount = amount - fee;

    return {
      status: "processing",
      payoutId: response.result.batch_header.payout_batch_id,
      fee,
      netAmount,
      recipientDetails: user.paypalAccountDetails
    };
  } catch (error) {
    console.error("PayPal payout error:", error);
    throw new Error(error.message || "PayPal payout failed");
  }
}





// ==================== WEBHOOK HANDLERS ====================

/**
 * Wise Webhook Handler
 * Handles transfer status updates from Wise
 */
const handleWiseWebhook = catchAsyncError(async (req, res, next) => {
  try {
    // Verify Wise webhook signature
    const signature = req.headers['x-signature'];
    const payload = JSON.stringify(req.body);
    
    // Verify signature (recommended for production)
    // const expectedSignature = crypto
    //   .createHmac('sha256', process.env.WISE_WEBHOOK_SECRET)
    //   .update(payload)
    //   .digest('base64');
    
    // if (signature !== expectedSignature) {
    //   return res.status(401).json({ message: "Invalid signature" });
    // }

    const event = req.body;
    console.log("Wise webhook received:", event);

    // Handle different event types
    if (event.data && event.data.resource && event.data.resource.type === 'transfer') {
      const transferId = event.data.resource.id;
      const status = event.data.current_state;

      // Find payout by Wise transfer ID
      const payout = await Payout.findOne({ payoutId: transferId });
      
      if (!payout) {
        console.log(`Payout not found for transfer ID: ${transferId}`);
        return res.status(200).json({ received: true });
      }

      // Map Wise status to our status
      let newStatus = payout.status;
      let completedAt = null;

      switch (status) {
        case 'outgoing_payment_sent':
        case 'processing':
          newStatus = 'processing';
          break;
        case 'funds_converted':
        case 'outgoing_payment_completed':
          newStatus = 'completed';
          completedAt = new Date();
          break;
        case 'bounced_back':
        case 'funds_refunded':
        case 'cancelled':
          newStatus = 'failed';
          // Refund to wallet
          const wallet = await Wallet.findOne({ userid: payout.userId });
          if (wallet) {
            wallet.diamonds += payout.amount;
            await wallet.save();
          }
          break;
      }

      // Update payout status
      payout.status = newStatus;
      if (completedAt) payout.completedAt = completedAt;
      if (event.data.occurred_at) payout.processedAt = new Date(event.data.occurred_at);
      await payout.save();

      // Send notification to user
      await sendNotification(
        payout.userId.toString(),
        "Payout Update",
        `Your payout status has been updated to: ${newStatus}`,
        "payout",
        { payoutId: payout._id, status: newStatus }
      );

      await createActivity(
        payout.userId.toString(),
        undefined,
        `Payout ${newStatus}`,
        null,
        null,
        null,
        null,
        null,
        null,
        null,
        "payout",
        { payoutId: payout._id, status: newStatus }
      );

      console.log(`Payout ${payout._id} updated to ${newStatus}`);
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("Wise webhook error:", error);
    return res.status(200).json({ received: true }); // Always return 200 to Wise
  }
});

/**
 * PayPal Webhook Handler
 * Handles payout status updates from PayPal
 */
const handlePayPalWebhook = catchAsyncError(async (req, res, next) => {
  try {
    // Verify PayPal webhook signature
    const transmissionId = req.headers['paypal-transmission-id'];
    const transmissionTime = req.headers['paypal-transmission-time'];
    const certUrl = req.headers['paypal-cert-url'];
    const authAlgo = req.headers['paypal-auth-algo'];
    const transmissionSig = req.headers['paypal-transmission-sig'];
    const webhookId = process.env.PAYPAL_WEBHOOK_ID;

    // For production, implement PayPal signature verification
    // See: https://developer.paypal.com/api/rest/webhooks/#verify-signature

    const event = req.body;
    console.log("PayPal webhook received:", event.event_type);

    // Handle different event types
    switch (event.event_type) {
      case 'PAYMENT.PAYOUTS-ITEM.SUCCEEDED':
      case 'PAYMENT.PAYOUTS-ITEM.COMPLETED':
        await handlePayPalPayoutSuccess(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.FAILED':
      case 'PAYMENT.PAYOUTS-ITEM.BLOCKED':
      case 'PAYMENT.PAYOUTS-ITEM.DENIED':
        await handlePayPalPayoutFailure(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.UNCLAIMED':
        await handlePayPalPayoutUnclaimed(event);
        break;
      
      case 'PAYMENT.PAYOUTS-ITEM.RETURNED':
      case 'PAYMENT.PAYOUTS-ITEM.REFUNDED':
        await handlePayPalPayoutRefunded(event);
        break;
    }

    return res.status(200).json({ received: true });
  } catch (error) {
    console.error("PayPal webhook error:", error);
    return res.status(200).json({ received: true }); // Always return 200 to PayPal
  }
});

// PayPal webhook helper functions
async function handlePayPalPayoutSuccess(event) {
  const batchId = event.resource.payout_batch_id;
  const itemId = event.resource.payout_item_id;

  const payout = await Payout.findOne({ payoutId: batchId });
  if (!payout) {
    console.log(`Payout not found for batch ID: ${batchId}`);
    return;
  }

  payout.status = 'completed';
  payout.completedAt = new Date();
  payout.processedAt = new Date(event.resource.time_processed);
  await payout.save();

  await sendNotification(
    payout.userId.toString(),
    "Payout Completed",
    `Your payout of $${payout.amount} has been completed successfully`,
    "payout",
    { payoutId: payout._id, status: 'completed' }
  );

  await createActivity(
    payout.userId.toString(),
    undefined,
    `Payout completed successfully`,
    null,
    null,
    null,
    null,
    null,
    null,
    null,
    "payout",
    { payoutId: payout._id, status: 'completed' }
  );
}

async function handlePayPalPayoutFailure(event) {
  const batchId = event.resource.payout_batch_id;
  const errorMessage = event.resource.errors?.message || 'Payout failed';

  const payout = await Payout.findOne({ payoutId: batchId });
  if (!payout) return;

  payout.status = 'failed';
  payout.errorMessage = errorMessage;
  await payout.save();

  // Refund to wallet
  const wallet = await Wallet.findOne({ userid: payout.userId });
  if (wallet) {
    wallet.diamonds += payout.amount;
    await wallet.save();
  }

  await sendNotification(
    payout.userId.toString(),
    "Payout Failed",
    `Your payout of $${payout.amount} has failed: ${errorMessage}`,
    "payout",
    { payoutId: payout._id, status: 'failed' }
  );
}

async function handlePayPalPayoutUnclaimed(event) {
  const batchId = event.resource.payout_batch_id;

  const payout = await Payout.findOne({ payoutId: batchId });
  if (!payout) return;

  await sendNotification(
    payout.userId.toString(),
    "Payout Unclaimed",
    `Your payout of $${payout.amount} is unclaimed. Please claim it in your PayPal account.`,
    "payout",
    { payoutId: payout._id }
  );
}

async function handlePayPalPayoutRefunded(event) {
  const batchId = event.resource.payout_batch_id;

  const payout = await Payout.findOne({ payoutId: batchId });
  if (!payout) return;

  payout.status = 'failed';
  payout.errorMessage = 'Payout was returned/refunded';
  await payout.save();

  // Refund to wallet
  const wallet = await Wallet.findOne({ userid: payout.userId });
  if (wallet) {
    wallet.diamonds += payout.amount;
    await wallet.save();
  }

  await sendNotification(
    payout.userId.toString(),
    "Payout Refunded",
    `Your payout of $${payout.amount} has been refunded to your wallet`,
    "payout",
    { payoutId: payout._id, status: 'failed' }
  );
}

// ==================== WEBHOOK REGISTRATION ====================

/**
 * Register Wise Webhook
 * Must be called once to set up webhook with Wise
 */
const registerWiseWebhook = catchAsyncError(async (req, res, next) => {
  const { webhookUrl } = req.body; // Your server URL e.g., https://yourdomain.com/api/payout/webhook/wise

  if (!webhookUrl) {
    return res.status(400).json({
      success: false,
      message: "webhookUrl is required"
    });
  }

  try {
    // List existing subscriptions
    const listResponse = await axios.get(
      `${WISE_API_BASE}/v3/profiles/${process.env.WISE_PROFILE_ID}/subscriptions`,
      { headers: wiseHeaders }
    );

    console.log("Existing Wise subscriptions:", listResponse.data);

    // Create new subscription
    const response = await axios.post(
      `${WISE_API_BASE}/v3/profiles/${process.env.WISE_PROFILE_ID}/subscriptions`,
      {
        name: "Transfer Status Updates",
        trigger_on: "transfers#state-change",
        delivery: {
          version: "2.0.0",
          url: webhookUrl
        }
      },
      { headers: wiseHeaders }
    );

    return res.status(200).json({
      success: true,
      message: "Wise webhook registered successfully",
      subscription: response.data
    });
  } catch (error) {
    console.error("Wise webhook registration error:", error.response?.data);
    return res.status(500).json({
      success: false,
      message: "Failed to register Wise webhook",
      error: error.response?.data || error.message
    });
  }
});

/**
 * Register PayPal Webhook
 * Must be called once to set up webhook with PayPal
 */
const registerPayPalWebhook = catchAsyncError(async (req, res, next) => {
  const { webhookUrl } = req.body; // Your server URL e.g., https://yourdomain.com/api/payout/webhook/paypal

  if (!webhookUrl) {
    return res.status(400).json({
      success: false,
      message: "webhookUrl is required"
    });
  }

  try {
    const paypalApiBase = process.env.NODE_ENV === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    // Get access token
    const authResponse = await axios.post(
      `${paypalApiBase}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        auth: {
          username: process.env.PAYPAL_CLIENT_ID,
          password: process.env.PAYPAL_CLIENT_SECRET
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = authResponse.data.access_token;

    // Create webhook
    const webhookResponse = await axios.post(
      `${paypalApiBase}/v1/notifications/webhooks`,
      {
        url: webhookUrl,
        event_types: [
          { name: "PAYMENT.PAYOUTS-ITEM.SUCCEEDED" },
          { name: "PAYMENT.PAYOUTS-ITEM.FAILED" },
          { name: "PAYMENT.PAYOUTS-ITEM.BLOCKED" },
          { name: "PAYMENT.PAYOUTS-ITEM.DENIED" },
          { name: "PAYMENT.PAYOUTS-ITEM.UNCLAIMED" },
          { name: "PAYMENT.PAYOUTS-ITEM.RETURNED" },
          { name: "PAYMENT.PAYOUTS-ITEM.REFUNDED" },
          { name: "PAYMENT.PAYOUTSBATCH.SUCCESS" }
        ]
      },
      {
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    // Save webhook ID to .env for verification
    console.log("IMPORTANT: Add this to your .env file:");
    console.log(`PAYPAL_WEBHOOK_ID=${webhookResponse.data.id}`);

    return res.status(200).json({
      success: true,
      message: "PayPal webhook registered successfully",
      webhook: webhookResponse.data,
      note: `Add PAYPAL_WEBHOOK_ID=${webhookResponse.data.id} to your .env file`
    });
  } catch (error) {
    console.error("PayPal webhook registration error:", error.response?.data);
    return res.status(500).json({
      success: false,
      message: "Failed to register PayPal webhook",
      error: error.response?.data || error.message
    });
  }
});

/**
 * List Wise Webhooks
 */
const listWiseWebhooks = catchAsyncError(async (req, res, next) => {
  try {
    const response = await axios.get(
      `${WISE_API_BASE}/v3/profiles/${process.env.WISE_PROFILE_ID}/subscriptions`,
      { headers: wiseHeaders }
    );

    return res.status(200).json({
      success: true,
      subscriptions: response.data
    });
  } catch (error) {
    console.error("Error listing Wise webhooks:", error.response?.data);
    return res.status(500).json({
      success: false,
      message: "Failed to list Wise webhooks",
      error: error.response?.data || error.message
    });
  }
});

/**
 * Delete Wise Webhook
 */
const deleteWiseWebhook = catchAsyncError(async (req, res, next) => {
  const { subscriptionId } = req.body;

  if (!subscriptionId) {
    return res.status(400).json({
      success: false,
      message: "subscriptionId is required"
    });
  }

  try {
    await axios.delete(
      `${WISE_API_BASE}/v3/profiles/${process.env.WISE_PROFILE_ID}/subscriptions/${subscriptionId}`,
      { headers: wiseHeaders }
    );

    return res.status(200).json({
      success: true,
      message: "Wise webhook deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting Wise webhook:", error.response?.data);
    return res.status(500).json({
      success: false,
      message: "Failed to delete Wise webhook",
      error: error.response?.data || error.message
    });
  }
});

/**
 * List PayPal Webhooks
 */
const listPayPalWebhooks = catchAsyncError(async (req, res, next) => {
  try {
    const paypalApiBase = process.env.NODE_ENV === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    // Get access token
    const authResponse = await axios.post(
      `${paypalApiBase}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        auth: {
          username: process.env.PAYPAL_CLIENT_ID,
          password: process.env.PAYPAL_CLIENT_SECRET
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = authResponse.data.access_token;

    const response = await axios.get(
      `${paypalApiBase}/v1/notifications/webhooks`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    return res.status(200).json({
      success: true,
      webhooks: response.data.webhooks
    });
  } catch (error) {
    console.error("Error listing PayPal webhooks:", error.response?.data);
    return res.status(500).json({
      success: false,
      message: "Failed to list PayPal webhooks",
      error: error.response?.data || error.message
    });
  }
});

/**
 * Delete PayPal Webhook
 */
const deletePayPalWebhook = catchAsyncError(async (req, res, next) => {
  const { webhookId } = req.body;

  if (!webhookId) {
    return res.status(400).json({
      success: false,
      message: "webhookId is required"
    });
  }

  try {
    const paypalApiBase = process.env.NODE_ENV === "production"
      ? "https://api.paypal.com"
      : "https://api.sandbox.paypal.com";

    // Get access token
    const authResponse = await axios.post(
      `${paypalApiBase}/v1/oauth2/token`,
      "grant_type=client_credentials",
      {
        auth: {
          username: process.env.PAYPAL_CLIENT_ID,
          password: process.env.PAYPAL_CLIENT_SECRET
        },
        headers: {
          "Content-Type": "application/x-www-form-urlencoded"
        }
      }
    );

    const accessToken = authResponse.data.access_token;

    await axios.delete(
      `${paypalApiBase}/v1/notifications/webhooks/${webhookId}`,
      {
        headers: {
          "Authorization": `Bearer ${accessToken}`
        }
      }
    );

    return res.status(200).json({
      success: true,
      message: "PayPal webhook deleted successfully"
    });
  } catch (error) {
    console.error("Error deleting PayPal webhook:", error.response?.data);
    return res.status(500).json({
      success: false,
      message: "Failed to delete PayPal webhook",
      error: error.response?.data || error.message
    });
  }
});



module.exports = {
  getPayoutRequirements,
  savePayoutAccount,
  getPayoutAccounts,
  updatePayoutAccount,
  deletePayoutAccount,
  requestPayout,
  getUserPayouts,
  getAllPayouts,
  getPayoutById,
  cancelPayout,
  getSupportedCurrencies,

  // Webhook handlers
  handleWiseWebhook,
  handlePayPalWebhook,
  
  // Webhook registration
  registerWiseWebhook,
  registerPayPalWebhook,
  listWiseWebhooks,
  listPayPalWebhooks,
  deleteWiseWebhook,
  deletePayPalWebhook,
  requestWhishPayout
};
