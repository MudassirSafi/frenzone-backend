const express = require("express");
const router = express.Router();
const { requireAdmin, requireAdminPermission } = require("../middleware/requireAdmin");
const { getStats, getUsers, getReports, getActiveLives, stopLive, getTransactions, getContent, broadcastNotification, resolveReport } = require("../controllers/adminApiController");

router.use(requireAdmin);
router.get("/dashboard/stats", requireAdminPermission("dashboard.read"), getStats);
router.get("/users", requireAdminPermission("users.read"), getUsers);
router.get("/reports", requireAdminPermission("reports.read"), getReports);
router.get("/live/active", requireAdminPermission("live.read"), getActiveLives);
router.delete("/live/:id", requireAdminPermission("live.manage"), stopLive);
router.get("/transactions", requireAdminPermission("finance.read"), getTransactions);
router.get("/content", requireAdminPermission("users.read"), getContent);
router.post("/notifications/broadcast", requireAdminPermission("notifications.send"), broadcastNotification);
router.delete("/reports/:type/:id", requireAdminPermission("reports.manage"), resolveReport);

module.exports = router;
