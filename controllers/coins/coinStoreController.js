const Wallet = require("../../models/walletModel");
const GlobalTransaction = require("../../models/globalTransactionsModel");
const { catchAsyncError } = require("../../helpers/catchAsyncError");

// Server-authoritative package definitions
const PUBLIC_WEB_PACKAGES = [
  { id: "pub_50", coins: 50, priceUSD: 0.63, discountPercent: 10, popular: false },
  { id: "pub_100", coins: 100, priceUSD: 1.16, discountPercent: 10, popular: false },
  { id: "pub_500", coins: 500, priceUSD: 5.8, discountPercent: 10, popular: true },
  { id: "pub_1000", coins: 1000, priceUSD: 23.22, discountPercent: 10, popular: false },
  { id: "pub_5000", coins: 5000, priceUSD: 58.05, discountPercent: 10, popular: true },
  { id: "pub_20000", coins: 20000, priceUSD: 232.2, discountPercent: 10, popular: false },
  { id: "pub_50000", coins: 50000, priceUSD: 580.5, discountPercent: 10, popular: false },
];

const AGENCY_WEB_PACKAGES = [
  { id: "agency_500", coins: 500, priceUSD: 5.16, discountPercent: 20, popular: false },
  { id: "agency_1000", coins: 1000, priceUSD: 20.64, discountPercent: 20, popular: false },
  { id: "agency_5000", coins: 5000, priceUSD: 51.6, discountPercent: 20, popular: true },
  { id: "agency_20000", coins: 20000, priceUSD: 206.4, discountPercent: 20, popular: false },
  { id: "agency_50000", coins: 50000, priceUSD: 516.0, discountPercent: 20, popular: true },
  { id: "agency_100000", coins: 100000, priceUSD: 1032.0, discountPercent: 20, popular: false },
];

/**
 * @desc Get available Web Coin Store packages
 * @route GET /coins/packages
 * @access Public / Authenticated
 */
const getCoinPackages = catchAsyncError(async (req, res) => {
  const isAgency = req.query.store === "agency";
  const packages = isAgency ? AGENCY_WEB_PACKAGES : PUBLIC_WEB_PACKAGES;

  return res.status(200).json({
    success: true,
    store: isAgency ? "WEB_AGENCY" : "WEB_PUBLIC",
    discountTier: isAgency ? "20%" : "10%",
    packages,
  });
});

/**
 * @desc Create server-authoritative checkout order for web coin purchase
 * @route POST /coins/checkout
 * @access Private (Authenticated User)
 */
const createWebCheckoutOrder = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const { package_id, store_type } = req.body;

  const packageList = store_type === "WEB_AGENCY" ? AGENCY_WEB_PACKAGES : PUBLIC_WEB_PACKAGES;
  const targetPackage = packageList.find((p) => p.id === package_id);

  if (!targetPackage) {
    return res.status(400).json({ success: false, error: "Invalid coin package selected" });
  }

  const orderId = `WEB_ORDER_${Date.now()}_${Math.random().toString(36).substring(2, 9).toUpperCase()}`;

  return res.status(201).json({
    success: true,
    order: {
      order_id: orderId,
      user_id: userId,
      package_id: targetPackage.id,
      coins: targetPackage.coins,
      amount_usd: targetPackage.priceUSD,
      currency: "USD",
      store_type: store_type || "WEB_PUBLIC",
    },
  });
});

/**
 * @desc Verify and capture coin purchase idempotently
 * @route POST /coins/verify-purchase
 * @access Private (Authenticated User)
 */
const verifyWebPurchase = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  const { order_id, package_id, store_type, payment_id } = req.body;

  if (!order_id || !package_id) {
    return res.status(400).json({ success: false, error: "Missing order or package details" });
  }

  // Idempotency check: verify order hasn't already been processed
  const existingTx = await GlobalTransaction.findOne({
    transaction_id: order_id,
  });

  if (existingTx) {
    return res.status(200).json({
      success: true,
      message: "Purchase already verified.",
      alreadyProcessed: true,
      transaction: existingTx,
    });
  }

  const packageList = store_type === "WEB_AGENCY" ? AGENCY_WEB_PACKAGES : PUBLIC_WEB_PACKAGES;
  const targetPackage = packageList.find((p) => p.id === package_id);

  if (!targetPackage) {
    return res.status(400).json({ success: false, error: "Invalid package reference" });
  }

  // Log transaction
  const transaction = await GlobalTransaction.create({
    transaction_id: order_id,
    user_id: userId,
    type: "coin_purchase",
    amount: targetPackage.priceUSD,
    coins: targetPackage.coins,
    payment_method: payment_id ? "paypal" : "web_checkout",
    payment_status: "completed",
    status: "completed",
    store_type: store_type || "WEB_PUBLIC",
    discount_applied: targetPackage.discountPercent,
  });

  // Credit coins to user wallet
  let wallet = await Wallet.findOne({ userid: userId });
  if (!wallet) {
    wallet = await Wallet.create({ userid: userId, coins: 0, diamonds: 0 });
  }

  wallet.coins = (wallet.coins || 0) + targetPackage.coins;
  wallet.boughtAmount = (wallet.boughtAmount || 0) + targetPackage.priceUSD;
  await wallet.save();

  return res.status(200).json({
    success: true,
    message: `Successfully credited ${targetPackage.coins} coins to your wallet!`,
    coinsCredited: targetPackage.coins,
    newBalance: wallet.coins,
    transaction,
  });
});

module.exports = {
  getCoinPackages,
  createWebCheckoutOrder,
  verifyWebPurchase,
  PUBLIC_WEB_PACKAGES,
  AGENCY_WEB_PACKAGES,
};
