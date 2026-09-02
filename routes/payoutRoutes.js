const express = require("express");
const router = express.Router();

const {
    getPayoutRequirements,
    savePayoutAccount,
    getPayoutAccounts,
    updatePayoutAccount,
    deletePayoutAccount,
    requestPayout,
    getUserPayouts,
    getAllPayouts,
    getPayoutById,
    cancelPayout,
    getSupportedCurrencies,
    // Webhook handlers
    handleWiseWebhook,
    handlePayPalWebhook,
    // Webhook registration
    registerWiseWebhook,
    registerPayPalWebhook,
    listWiseWebhooks,
    listPayPalWebhooks,
    deleteWiseWebhook,
    deletePayPalWebhook,
    requestWhishPayout
} = require("../controllers/payoutController");

// Webhook endpoints (PUBLIC - no auth required)
router.post("/webhook/wise", handleWiseWebhook);
router.post("/webhook/paypal", handlePayPalWebhook);

const requireAuth = require("../middleware/requireAuth");

// Public routes
router.post("/getPayoutRequirements", getPayoutRequirements);
router.post("/savePayoutAccount", savePayoutAccount);
router.get("/getPayoutAccounts/:userId", getPayoutAccounts);
router.patch("/updatePayoutAccount", updatePayoutAccount);
router.delete("/deletePayoutAccount", deletePayoutAccount);
router.post("/requestPayout", requestPayout);
router.post("/requestWhishPayout", requestWhishPayout);
router.get("/getUserPayouts/:userId", getUserPayouts);
router.get("/getSupportedCurrencies/:payoutMethod", getSupportedCurrencies);

// Protected routes (require authentication)
router.use(requireAuth);
router.get("/getAllPayouts", getAllPayouts);
router.get("/getPayoutById/:payoutId", getPayoutById);
router.patch("/cancelPayout", cancelPayout);

router.post("/registerWiseWebhook", registerWiseWebhook);
router.post("/registerPayPalWebhook", registerPayPalWebhook);
router.get("/listWiseWebhooks", listWiseWebhooks);
router.get("/listPayPalWebhooks", listPayPalWebhooks);
router.delete("/deleteWiseWebhook", deleteWiseWebhook);
router.delete("/deletePayPalWebhook", deletePayPalWebhook);

module.exports = router;