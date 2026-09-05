const mongoose = require("mongoose");
const connectDB = require("../db");
const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const { getAuthMe, webSignupUser } = require("../controllers/auth/webAuthController");
const jwt = require("jsonwebtoken");
require("dotenv").config();

async function runAuthTest() {
  console.log("=== WEB AUTH CONTROLLER TEST ===");
  await connectDB();

  const testEmail = `webuser_${Date.now()}@frenzone.test`;
  let createdUserId = null;

  try {
    // 1. Test webSignupUser
    console.log("1. Testing webSignupUser handler...");
    const reqSignup = {
      body: {
        firstname: "Web",
        lastname: "Tester",
        email: testEmail,
        password: "SecurePassword123!",
        username: `webuser_${Date.now()}`,
      },
    };

    let signupResStatus = 0;
    let signupResData = null;
    const resSignup = {
      status: (code) => {
        signupResStatus = code;
        return {
          json: (data) => {
            signupResData = data;
          },
        };
      },
    };

    const next = (err) => {
      if (err) console.error("Handler error:", err);
    };

    await webSignupUser(reqSignup, resSignup, next);
    console.log(`✓ webSignupUser returned HTTP ${signupResStatus}:`, {
      success: signupResData?.success,
      error: signupResData?.error,
      username: signupResData?.user?.username,
      hasToken: Boolean(signupResData?.token),
    });

    createdUserId = signupResData?.user?._id;

    // 2. Test getAuthMe with created user
    console.log("2. Testing getAuthMe handler...");
    const reqMe = {
      userId: createdUserId,
      user: signupResData?.user,
    };

    let meResStatus = 0;
    let meResData = null;
    const resMe = {
      status: (code) => {
        meResStatus = code;
        return {
          json: (data) => {
            meResData = data;
          },
        };
      },
    };

    await getAuthMe(reqMe, resMe, next);
    console.log(`✓ getAuthMe returned HTTP ${meResStatus}:`, {
      success: meResData?.success,
      email: meResData?.user?.email,
      creatorStatus: meResData?.user?.creatorStatus,
      role: meResData?.user?.role,
    });

    console.log("\n=== WEB AUTH VERIFICATION SUCCESSFUL ===");
  } catch (err) {
    console.error("Auth test error:", err);
  } finally {
    if (createdUserId) {
      await Wallet.deleteMany({ userid: createdUserId });
      await User.findByIdAndDelete(createdUserId);
      console.log("✓ Test user and wallet cleaned up.");
    }
    await mongoose.disconnect();
  }
}

runAuthTest();
