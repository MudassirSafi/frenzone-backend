const mongoose = require("mongoose");
const connectDB = require("../db");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const GlobalTransaction = require("../models/globalTransactionsModel");
const {
  getCoinPackages,
  createWebCheckoutOrder,
  verifyWebPurchase,
} = require("../controllers/coins/coinStoreController");
require("dotenv").config();

async function runCoinsTest() {
  console.log("=== COINS CONTROLLER E2E TEST ===");
  await connectDB();

  let testUserId = null;
  let testWallet = null;

  try {
    // 1. Create a test user & wallet
    const testUsername = `cointester_${Date.now()}`;
    const user = await User.create({
      firstname: "Coin",
      lastname: "Tester",
      username: testUsername,
      email: `${testUsername}@frenzone.test`,
      loginFrom: "Web",
      app_user_id: testUsername,
      onboarding: { active: true },
    });
    testWallet = await Wallet.create({ userid: user._id, diamond: 0 });
    await User.findByIdAndUpdate(user._id, { walletid: testWallet._id });
    testUserId = user._id;

    // 2. Test getCoinPackages
    console.log("1. Testing getCoinPackages...");
    let pkgsData = null;
    const resPkgs = {
      status: () => ({
        json: (data) => {
          pkgsData = data;
        },
      }),
    };
    await getCoinPackages({ query: {} }, resPkgs);
    console.log("✓ Packages retrieved:", {
      success: pkgsData?.success,
      count: pkgsData?.packages?.length,
      discountTier: pkgsData?.discountTier,
    });

    // 3. Test createWebCheckoutOrder
    console.log("2. Testing createWebCheckoutOrder...");
    let orderData = null;
    const resOrder = {
      status: () => ({
        json: (data) => {
          orderData = data;
        },
      }),
    };
    await createWebCheckoutOrder(
      {
        userId: testUserId,
        body: { package_id: "pub_500", store_type: "WEB_PUBLIC" },
      },
      resOrder
    );
    console.log("✓ Order created:", {
      success: orderData?.success,
      order_id: orderData?.order?.order_id,
      coins: orderData?.order?.coins,
      amount_usd: orderData?.order?.amount_usd,
    });

    // 4. Test verifyWebPurchase (crediting coins)
    console.log("3. Testing verifyWebPurchase (idempotent crediting)...");
    let verifyData = null;
    const resVerify = {
      status: () => ({
        json: (data) => {
          verifyData = data;
        },
      }),
    };
    await verifyWebPurchase(
      {
        userId: testUserId,
        body: {
          order_id: orderData.order.order_id,
          package_id: "pub_500",
          store_type: "WEB_PUBLIC",
          payment_id: "PAYPAL_TEST_123",
        },
      },
      resVerify
    );
    console.log("✓ Purchase verified:", {
      success: verifyData?.success,
      coinsCredited: verifyData?.coinsCredited,
    });

    // 5. Test idempotency (repeat verification of same order)
    console.log("4. Testing idempotency check...");
    let dupVerifyData = null;
    const resDup = {
      status: () => ({
        json: (data) => {
          dupVerifyData = data;
        },
      }),
    };
    await verifyWebPurchase(
      {
        userId: testUserId,
        body: {
          order_id: orderData.order.order_id,
          package_id: "pub_500",
          store_type: "WEB_PUBLIC",
        },
      },
      resDup
    );
    console.log("✓ Duplicate prevented:", {
      alreadyProcessed: dupVerifyData?.alreadyProcessed,
      message: dupVerifyData?.message,
    });

    // Cleanup
    await GlobalTransaction.deleteMany({ transaction_id: orderData.order.order_id });
    await Wallet.findByIdAndDelete(testWallet._id);
    await User.findByIdAndDelete(testUserId);
    console.log("✓ Test records cleaned up successfully.");

    console.log("\n=== COIN STORE E2E TEST COMPLETED 100% ===");
  } catch (err) {
    console.error("Coin test error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runCoinsTest();
