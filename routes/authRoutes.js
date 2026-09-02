const express = require("express");
const router = express.Router();
const {
  signupUser,
  appleLogin,
  setFcmToken,
  deleteFcmToken,
  loginUser,
  verifyOTP,
  googleLogin,
  linkedInLogin,
  Redirect,
  VerifyUserResult,
  VerifyUser,
  twitterLogin,
  sendVerifySms,
  VerifySmsOtp,
  signupAdmin,
  loginAdmin,
  getLamVerifyData,
  togglePaymentVerified,
  getLamVerifyDataById,
  linkedinSignup
} = require("../controllers/authController");
router.post("/login", loginUser);
router.post("/appleLogin", appleLogin);
router.post("/twitterLogin", twitterLogin);
router.post("/signup", signupUser);
router.post("/googleLogin", googleLogin);
router.patch("/setFcmToken", setFcmToken);
router.patch("/deleteFcmToken", deleteFcmToken);
router.patch("/verifyOTP", verifyOTP);
router.get("/linkedInLogin", linkedInLogin);
router.get("/Redirect", Redirect);
router.post("/VerifyUserResult", VerifyUserResult);
router.post("/verifyUser", VerifyUser);
router.post("/sendVerifySms", sendVerifySms);
router.patch("/VerifySmsOtp", VerifySmsOtp);
router.post("/signupAdmin", signupAdmin);
router.post("/loginAdmin", loginAdmin);
router.get("/getLamVerifyData", getLamVerifyData);
router.get("/getLamVerifyDataById/:userid", getLamVerifyDataById);
router.patch("/togglePaymentVerified/:id", togglePaymentVerified);
router.post("/linkedinSignup", linkedinSignup)
module.exports = router;
