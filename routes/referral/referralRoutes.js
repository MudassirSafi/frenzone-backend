const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const {
  getReferralCode,
  trackReferralScan,
  getReferralStats,
} = require("../../controllers/referral/referralController");

router.get("/code", requireAuth, getReferralCode);
router.get("/stats", requireAuth, getReferralStats);
router.post("/track-scan", trackReferralScan);

module.exports = router;
