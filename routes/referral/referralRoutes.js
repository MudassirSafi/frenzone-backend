const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const {
  getReferralCode,
  getReferralStats,
} = require("../../controllers/referral/referralController");

router.get("/code", requireAuth, getReferralCode);
router.get("/stats", requireAuth, getReferralStats);

module.exports = router;
