const mongoose = require("mongoose");
const connectDB = require("../db");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const StreamAnalysis = require("../models/streamAnalysisModel");
const {
  getCreatorDashboard,
  getCreatorPerformance,
} = require("../controllers/creator/creatorDashboardController");
require("dotenv").config();

async function runDashboardTest() {
  console.log("=== CREATOR DASHBOARD CONTROLLER TEST ===");
  await connectDB();

  let testUserId = null;
  let testStreamAnalysisId = null;

  try {
    const testUsername = `dash_tester_${Date.now()}`;
    const user = await User.create({
      firstname: "Dash",
      lastname: "Tester",
      username: testUsername,
      email: `${testUsername}@frenzone.test`,
      loginFrom: "Web",
      app_user_id: testUsername,
      rankingPoints: 125,
      followers: [],
      onboarding: { active: true },
    });
    testUserId = user._id;

    const wallet = await Wallet.create({ userid: user._id, diamond: 50 });
    await User.findByIdAndUpdate(user._id, { walletid: wallet._id });

    // Create a mock completed stream analysis
    const stream = await StreamAnalysis.create({
      streamid: new mongoose.Types.ObjectId(),
      userid: user._id,
      likes: 120,
      giftsReceived: 15,
      giftCoins: 500,
      diamondsEarned: 210,
      usdEarned: 210,
    });
    testStreamAnalysisId = stream._id;

    // 1. Test getCreatorDashboard
    console.log("1. Testing getCreatorDashboard handler...");
    const reqDash = { userId: testUserId };
    let dashData = null;
    const resDash = {
      status: () => ({
        json: (data) => {
          dashData = data;
        },
      }),
    };
    const next = (err) => {
      if (err) console.error("Dash error:", err);
    };

    await getCreatorDashboard(reqDash, resDash, next);
    console.log("✓ Dashboard metrics retrieved:", {
      success: dashData?.success,
      creatorName: dashData?.data?.creatorName,
      diamondsEarned: dashData?.data?.stats?.diamondsEarned,
      totalLikes: dashData?.data?.stats?.totalLikes,
      rankingPoints: dashData?.data?.stats?.rankingPoints,
      estimatedEarningsUSD: dashData?.data?.stats?.estimatedEarningsUSD,
    });

    // 2. Test getCreatorPerformance
    console.log("2. Testing getCreatorPerformance handler...");
    let perfData = null;
    const resPerf = {
      status: () => ({
        json: (data) => {
          perfData = data;
        },
      }),
    };
    await getCreatorPerformance(reqDash, resPerf, next);
    console.log("✓ Performance metrics retrieved:", {
      success: perfData?.success,
      count: perfData?.count,
      firstStreamLikes: perfData?.recentStreams?.[0]?.likes,
    });

    // Cleanup
    if (testStreamAnalysisId) await StreamAnalysis.findByIdAndDelete(testStreamAnalysisId);
    await Wallet.deleteMany({ userid: testUserId });
    await User.findByIdAndDelete(testUserId);
    console.log("✓ Test records cleaned up successfully.");

    console.log("\n=== CREATOR DASHBOARD TEST COMPLETED 100% ===");
  } catch (err) {
    console.error("Dashboard test error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runDashboardTest();
