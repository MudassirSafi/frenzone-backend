const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const {
  getCoinPackages,
  createWebCheckoutOrder,
  verifyWebPurchase,
} = require("../../controllers/coins/coinStoreController");

// Public & Authenticated Web Coin Store Endpoints
router.get("/packages", getCoinPackages);
router.post("/checkout", requireAuth, createWebCheckoutOrder);
router.post("/verify-purchase", requireAuth, verifyWebPurchase);

module.exports = router;
