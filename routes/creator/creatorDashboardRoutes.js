const express = require("express");
const router = express.Router();
const multer = require("multer");
const requireAuth = require("../../middleware/requireAuth");
const { requireCreatorAuth } = require("../../middleware/creator/creatorAuthMiddleware");
const {
  getCreatorDashboard,
  getCreatorPerformance,
  getCreatorProfile,
  updateCreatorProfile,
  uploadCreatorAvatar,
  getCreatorCompliance,
  getCreatorReferrals,
  getCreatorEarnings,
  getCreatorAgency,
  getCreatorActivities,
} = require("../../controllers/creator/creatorDashboardController");
const { respondAgencyInvite } = require("../../controllers/agency/agencyController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get("/dashboard", requireAuth, requireCreatorAuth, getCreatorDashboard);
router.get("/activities", requireAuth, requireCreatorAuth, getCreatorActivities);
router.get("/earnings", requireAuth, requireCreatorAuth, getCreatorEarnings);
router.get("/performance", requireAuth, requireCreatorAuth, getCreatorPerformance);
router.get("/compliance", requireAuth, requireCreatorAuth, getCreatorCompliance);
router.get("/referrals", requireAuth, requireCreatorAuth, getCreatorReferrals);
router.get("/profile", requireAuth, requireCreatorAuth, getCreatorProfile);
router.patch("/profile", requireAuth, requireCreatorAuth, updateCreatorProfile);
router.post("/avatar", requireAuth, requireCreatorAuth, upload.single("image"), uploadCreatorAvatar);
router.get("/agency", requireAuth, requireCreatorAuth, getCreatorAgency);
router.post("/agency/respond", requireAuth, requireCreatorAuth, respondAgencyInvite);

module.exports = router;
