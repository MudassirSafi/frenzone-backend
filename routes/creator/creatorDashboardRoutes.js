const express = require("express");
const router = express.Router();
const multer = require("multer");
const requireAuth = require("../../middleware/requireAuth");
const {
  getCreatorDashboard,
  getCreatorPerformance,
  getCreatorProfile,
  updateCreatorProfile,
  uploadCreatorAvatar,
} = require("../../controllers/creator/creatorDashboardController");

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 },
});

router.get("/dashboard", requireAuth, getCreatorDashboard);
router.get("/performance", requireAuth, getCreatorPerformance);
router.get("/profile", requireAuth, getCreatorProfile);
router.patch("/profile", requireAuth, updateCreatorProfile);
router.post("/avatar", requireAuth, upload.single("image"), uploadCreatorAvatar);

module.exports = router;
