const express = require("express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage });

const requireAuth = require("../middleware/requireAuth");
router.use(requireAuth);

const {
  createBadge,
  updateBadge,
  deleteBadge,
  getAllBadges,
  getBadgeById,
} = require("../controllers/badgeController");

router.post("/createBadge", upload.single("image"), createBadge);
router.patch("/updateBadge", upload.single("image"), updateBadge);
router.delete("/deleteBadge", deleteBadge);
router.get("/getAllBadges", getAllBadges);
router.get("/getBadgeById/:badgeId", getBadgeById);

module.exports = router;

