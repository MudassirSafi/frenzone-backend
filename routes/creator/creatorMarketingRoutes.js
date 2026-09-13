const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { requireCreatorAuth } = require("../../middleware/creator/creatorAuthMiddleware");
const {
  getMarketingKits,
  downloadMarketingKit,
} = require("../../controllers/creator/creatorMarketingController");

router.get("/kits", requireAuth, requireCreatorAuth, getMarketingKits);
router.get("/kits/:assetId/download", requireAuth, requireCreatorAuth, downloadMarketingKit);

module.exports = router;
