const mongoose = require("mongoose");
const connectDB = require("../db");
const User = require("../models/userModel");
const Referral = require("../models/referralModel");
const {
  getReferralCode,
  getReferralStats,
} = require("../controllers/referral/referralController");
require("dotenv").config();

async function runReferralTest() {
  console.log("=== REFERRAL CONTROLLER E2E TEST ===");
  await connectDB();

  let referrerId = null;

  try {
    const testUsername = `ref_tester_${Date.now()}`;
    const user = await User.create({
      firstname: "Ref",
      lastname: "Tester",
      username: testUsername,
      email: `${testUsername}@frenzone.test`,
      loginFrom: "Web",
      app_user_id: testUsername,
      onboarding: { active: true },
    });
    referrerId = user._id;

    // 1. Test getReferralCode
    console.log("1. Testing getReferralCode...");
    let codeData = null;
    const resCode = {
      status: () => ({
        json: (data) => {
          codeData = data;
        },
      }),
    };
    await getReferralCode({ userId: referrerId }, resCode);
    console.log("✓ Referral code retrieved:", {
      success: codeData?.success,
      code: codeData?.referralCode,
      link: codeData?.referralLink,
    });

    // 2. Test getReferralStats
    console.log("2. Testing getReferralStats...");
    let statsData = null;
    const resStats = {
      status: () => ({
        json: (data) => {
          statsData = data;
        },
      }),
    };
    await getReferralStats({ userId: referrerId }, resStats);
    console.log("✓ Referral stats retrieved:", {
      success: statsData?.success,
      totalReferred: statsData?.stats?.totalReferred,
      conversionRate: statsData?.stats?.conversionRate,
    });

    // Cleanup
    await User.findByIdAndDelete(referrerId);
    console.log("✓ Test user cleaned up.");

    console.log("\n=== REFERRAL CONTROLLER E2E TEST COMPLETED 100% ===");
  } catch (err) {
    console.error("Referral test error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runReferralTest();
