const mongoose = require("mongoose");
const crypto = require("crypto");
const User = require("../models/userModel");
const Admin = require("../models/adminModel");
const Club = require("../models/clubModel");
const Post = require("../models/postModel");
const Wallet = require("../models/walletModel");
const GlobalTransaction = require("../models/globalTransactionsModel");
const WhishPayoutTransaction = require("../models/whishPayoutTransactionModel");
const { ApiFeatures } = require("../helpers/ApiFeatures");
const { aws } = require("../helpers/otherHelpers");
require("dotenv").config();

const LIVE_SHOP_PRODUCT_IDS = [
  process.env.REVENUECAT_LIVE_SHOP_MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  process.env.REVENUECAT_LIVE_SHOP_YEARLY_SUBSCRIPTION_PRODUCT_ID,
].filter((v) => typeof v === "string" && v.trim() !== "");

const RC_COMPLETED_EVENTS = new Set([
  "INITIAL_PURCHASE",
  "NON_RENEWING_PURCHASE",
  "RENEWAL",
  "UNCANCELLATION",
  "PRODUCT_CHANGE",
  "TEMPORARY_ENTITLEMENT_GRANT",
  "TRANSFER",
]);
const RC_INFO_ONLY_EVENTS = new Set(["SUBSCRIBER_ALIAS", "TEST"]);

const parseMsToDate = (ms) => {
  if (!ms) return null;
  const n = Number(ms);
  if (Number.isNaN(n) || n <= 0) return null;
  return new Date(n);
};

const isFutureDate = (dateValue) => !!dateValue && new Date(dateValue) > new Date();

const verifyRevenueCatWebhook = (req) => {
  const secret = process.env.REVENUECAT_WEBHOOK_SECRET;
  if (!secret) return true;

  const authHeader = req.headers.authorization || "";
  if (authHeader.startsWith("Bearer ")) {
    const token = authHeader.slice(7).trim();
    if (token === secret) return true;
  }

  // Backward-compatible fallback to HMAC verification
  const signature = authHeader.split(" ")[1];
  if (!signature) return false;
  const computedSignature = crypto
    .createHmac("sha256", secret)
    .update(JSON.stringify(req.body))
    .digest("hex");

  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(computedSignature));
  } catch (error) {
    return false;
  }
};

const findUserByAppUserId = async (appUserId, originalAppUserId = null) => {
  if (!appUserId && !originalAppUserId) return null;

  const candidateIds = [appUserId, originalAppUserId].filter(Boolean);
  for (const candidate of candidateIds) {
    let user = await User.findOne({ _id: candidate });
    if (user) return user;
    if (mongoose.isValidObjectId(candidate)) {
      user = await User.findById(candidate);
      if (user) return user;
    }
  }
  return null;
};

const applyLiveShopState = async (user, event, eventType, productId, session) => {
  if (!user) return;

  const expirationDate = parseMsToDate(event.expiration_at_ms);
  const graceExpiry = parseMsToDate(event.grace_period_expiration_at_ms);

  const update = {};

  if (RC_COMPLETED_EVENTS.has(eventType)) {
    update.liveShoppingActive = true;
    update.$addToSet = { subscribedProducts: productId };

    if (expirationDate) {
      if (!user.liveShoppingExpirationAt || expirationDate > user.liveShoppingExpirationAt) {
        update.liveShoppingExpirationAt = expirationDate;
      }
    }
  } else if (eventType === "CANCELLATION") {
    update.$addToSet = { subscribedProducts: productId };
    if (expirationDate) update.liveShoppingExpirationAt = expirationDate;
    update.liveShoppingActive = isFutureDate(expirationDate) || isFutureDate(user.liveShoppingExpirationAt);
  } else if (eventType === "SUBSCRIPTION_PAUSED" || eventType === "BILLING_ISSUE") {
    if (expirationDate) update.liveShoppingExpirationAt = expirationDate;
    update.liveShoppingActive = isFutureDate(expirationDate) || isFutureDate(graceExpiry);
  } else if (eventType === "EXPIRATION" || eventType === "REFUND") {
    update.$pull = { subscribedProducts: productId };
    const userExpiryAfterEvent = user.liveShoppingExpirationAt && expirationDate
      ? user.liveShoppingExpirationAt > expirationDate
      : isFutureDate(user.liveShoppingExpirationAt);
    update.liveShoppingActive = userExpiryAfterEvent;
    if (expirationDate && !userExpiryAfterEvent) update.liveShoppingExpirationAt = expirationDate;
  }

  if (Object.keys(update).length > 0) {
    await User.updateOne({ _id: user._id }, update, { session });
  }
};

const mapStatusFromEventType = (eventType) => {
  if (eventType === "REFUND") return "refunded";
  if (eventType === "EXPIRATION" || eventType === "BILLING_ISSUE" || eventType === "SUBSCRIPTION_PAUSED") {
    return "failed";
  }
  if (eventType === "TRANSFER") return "completed";
  if (RC_COMPLETED_EVENTS.has(eventType) || eventType === "CANCELLATION") return "completed";
  return "pending";
};

const createTransaction = async (data) => {
  const session = await mongoose.startSession();
  session.startTransaction();
  try {
    const transaction = await GlobalTransaction.create(
      [
        {
          ...data,
          status: data.status || "pending",
          purchased_at: data.purchased_at || new Date(),
        },
      ],
      { session }
    );
    await session.commitTransaction();
    return transaction[0];
  } catch (error) {
    await session.abortTransaction();
    throw error;
  } finally {
    session.endSession();
  }
};

const getTransactions = async (req, res) => {
  try {
    const query = {};
    if (req.query.type) query.type = req.query.type;
    if (req.query.status) query.status = req.query.status;
    if (req.query.period_start && req.query.period_end) {
      query.purchased_at = {
        $gte: new Date(req.query.period_start),
        $lte: new Date(req.query.period_end),
      };
    }
    if (req.query.user_id) query.user_id = req.query.user_id;
    if (req.query.creator_id) query.creator_id = req.query.creator_id;

    const apiFeature = new ApiFeatures(
      GlobalTransaction.find(query)
        .populate({
          path: "user_id",
          select: "profilePicture username firstname lastname email",
        })
        .populate({
          path: "creator_id",
          select: "profilePicture username firstname lastname email",
        })
        .populate("club_id")
        .populate("post_id"),
      req.query
    )
      .filteration()
      .search();

    const count = await apiFeature.getTotalCount();
    apiFeature.pagination().sort({ createdAt: -1 });
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    let transactions = await apiFeature.mongooseQuery;

    transactions = transactions.map((tx) => tx.toObject());
    await Promise.all(
      transactions.map(async (tx) => {
        if (tx.user_id) {
          tx.user_id.profilePicture = await aws.getLinkFromAWS(tx.user_id.profilePicture);
        }
        if (tx.creator_id) {
          tx.creator_id.profilePicture = await aws.getLinkFromAWS(tx.creator_id.profilePicture);
        }
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, transactions });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

const revenuecatWebhookHandler = async (req, res) => {
  if (!verifyRevenueCatWebhook(req)) {
    return res.status(401).json({ error: "Invalid signature" });
  }

  const event = req.body.event || req.body;
  if (!event || !event.type) {
    return res.status(400).json({ error: "Invalid RevenueCat event payload" });
  }

  const eventType = event.type;
  const appUserId = event.app_user_id || req.body.app_user_id;
  const originalAppUserId = event.original_app_user_id || req.body.original_app_user_id;
  const productId = event.product_id || null;

  if (RC_INFO_ONLY_EVENTS.has(eventType)) {
    return res.status(200).json({ success: true, message: "Informational event ignored" });
  }

  if (event.id) {
    const existingTx = await GlobalTransaction.findOne({ revenuecat_event_id: event.id }).select("_id");
    if (existingTx) {
      return res.status(200).json({ success: true, message: "Event already processed" });
    }
  }

  const user = await findUserByAppUserId(appUserId, originalAppUserId);
  if (!user) return res.status(404).json({ error: "User not found" });

  if (!productId && !event.transaction_id && !event.original_transaction_id && !event.price) {
    return res.status(200).json({ success: true, message: "Event ignored (no product or transaction)" });
  }

  const expirationAt = parseMsToDate(event.expiration_at_ms);
  const graceExpiry = parseMsToDate(event.grace_period_expiration_at_ms);

  const session = await mongoose.startSession();
  session.startTransaction();

  try {
    const isLiveShopEvent = !!productId && LIVE_SHOP_PRODUCT_IDS.includes(productId);

    const transactionData = {
      app_user_id: appUserId || user.app_user_id || user._id.toString(),
      original_app_user_id: originalAppUserId || null,
      user_id: user._id,
      amount: Number(event.price || event.price_in_purchased_currency || 0),
      currency: event.currency || null,
      store: event.store || null,
      environment: event.environment || null,
      revenuecat_event_id: event.id || null,
      entitlement_id: event.entitlement_id || null,
      payment_provider_tx_id: event.transaction_id || null,
      original_transaction_id: event.original_transaction_id || null,
      purchased_at: parseMsToDate(event.purchased_at_ms) || new Date(),
      expiration_at: expirationAt,
      is_family_share: !!event.is_family_share,
      offer_code: event.offer_code || null,
      subscriber_attributes: event.subscriber_attributes || {},
      platform_fee: Number(event.price || 0) * (1 - Number(event.takehome_percentage || 1)),
      net_creator_amount: Number(event.price || 0) * Number(event.takehome_percentage || 1),
      status: mapStatusFromEventType(eventType),
      product_id: productId,
      metadata: {
        revenuecat_event_type: eventType,
        period_type: event.period_type || null,
        cancel_reason: event.cancel_reason || null,
        expiration_reason: event.expiration_reason || null,
        grace_period_expiration_at_ms: event.grace_period_expiration_at_ms || null,
        transferred_from: event.transferred_from || [],
        transferred_to: event.transferred_to || [],
      },
    };

    if (eventType === "RENEWAL") transactionData.is_renewal = true;
    if (eventType === "CANCELLATION") transactionData.cancel_reason = event.cancel_reason || null;
    if (eventType === "EXPIRATION") transactionData.expiration_reason = event.expiration_reason || null;
    if (graceExpiry) transactionData.grace_period_expiration_at = graceExpiry;

    if (isLiveShopEvent) {
      transactionData.type = "live_shop_subscription";
      transactionData.subscription_period = (event.period_type || "").toLowerCase() || null;
      await applyLiveShopState(user, event, eventType, productId, session);
    } else {
      const club = productId ? await Club.findOne({ revenuecat_product_id: productId }).session(session) : null;
      const post = productId ? await Post.findOne({ revenuecat_product_id: productId }).session(session) : null;

      if (club) {
        transactionData.club_id = club._id;
        transactionData.creator_id = club.userid;
        transactionData.type = "club_subscription";
        transactionData.subscription_period = event.period_type || null;

        const userIsClubOwner = club.userid?.toString() === user._id.toString();

        if (!userIsClubOwner && RC_COMPLETED_EVENTS.has(eventType)) {
          await Club.updateOne({ _id: club._id }, { $addToSet: { members: user._id } }, { session });
          await User.updateOne(
            { _id: user._id },
            { $addToSet: { clubsJoined: club._id, subscribedProducts: productId } },
            { session }
          );
        } else if (
          eventType === "CANCELLATION" ||
          eventType === "EXPIRATION" ||
          eventType === "REFUND"
        ) {
          await Club.updateOne({ _id: club._id }, { $pull: { members: user._id } }, { session });
          await User.updateOne(
            { _id: user._id },
            { $pull: { clubsJoined: club._id, subscribedProducts: productId } },
            { session }
          );
        }
      } else if (post) {
        transactionData.post_id = post._id;
        transactionData.creator_id = post.userid;
        transactionData.type = "paywall";

        if (RC_COMPLETED_EVENTS.has(eventType)) {
          await Post.updateOne({ _id: post._id }, { $addToSet: { canView: user._id } }, { session });
        }
      } else {
        transactionData.type = "coin_purchase";
        transactionData.platform_fee = Number(event.price || 0);
        transactionData.net_creator_amount = 0;
        if (RC_COMPLETED_EVENTS.has(eventType)) {
          const wallet = await Wallet.findOne({ userid: user._id }).session(session);
          if (wallet) {
            wallet.coins += Number(event.price || 0);
            await wallet.save({ session });
          }

          const mainAdmin = await Admin.findOne({ mainAdmin: true }).session(session);
          if (mainAdmin && mainAdmin.walletid) {
            await Wallet.updateOne(
              { _id: mainAdmin.walletid },
              { $inc: { currentAmount: Number(event.price || 0), earnedAmount: Number(event.price || 0) } },
              { session }
            );
          }
        }
      }
    }

    await GlobalTransaction.create([transactionData], { session });
    await session.commitTransaction();
    return res.status(200).json({ success: true, message: "Webhook processed" });
  } catch (error) {
    await session.abortTransaction();
    return res.status(500).json({ error: error.message });
  } finally {
    session.endSession();
  }
};

const whishWebhookHandler = async (req, res) => {
  try {
    const { id, type } = req.query;

    if (!id || !type) {
      return res.status(400).json({
        success: false,
        message: "id and type query params are required",
      });
    }

    const normalizedType = String(type).toLowerCase();
    const mappedType = normalizedType === "success" ? "success" : (normalizedType === "failure" || normalizedType === "failuer" ? "failure" : null);

    if (!mappedType) {
      return res.status(400).json({
        success: false,
        message: "type must be success or failure",
      });
    }

    const whishPayoutTransaction = await WhishPayoutTransaction.findById(id);
    if (!whishPayoutTransaction) {
      return res.status(404).json({
        success: false,
        message: "Whish payout tracking not found",
      });
    }

    const nextStatus = mappedType === "success" ? "completed" : "failed";
    const wasAlreadyFailed = whishPayoutTransaction.status === "failed";

    await GlobalTransaction.findByIdAndUpdate(whishPayoutTransaction.globalTransactionId, {
      $set: { status: nextStatus },
    });

    if (nextStatus === "failed" && !wasAlreadyFailed) {
      await Wallet.findOneAndUpdate(
        { userid: whishPayoutTransaction.userId },
        { $inc: { diamonds: Number(whishPayoutTransaction.amount || 0) } }
      );
    }

    whishPayoutTransaction.status = nextStatus;
    whishPayoutTransaction.callbackType = mappedType;
    await whishPayoutTransaction.save();

    return res.status(200).json({
      success: true,
      message: "Whish webhook processed successfully",
    });
  } catch (error) {
    return res.status(500).json({
      success: false,
      message: "Failed to process Whish webhook",
      error: error.message,
    });
  }
};
const addTransaction = async (req, res) => {
  try {
    const transaction = await createTransaction(req.body);
    res.status(201).json({ success: true, transaction });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};

module.exports = {
  createTransaction,
  addTransaction,
  getTransactions,
  revenuecatWebhookHandler,
  whishWebhookHandler
};
