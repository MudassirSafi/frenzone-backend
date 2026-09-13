const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { requireCreatorAuth } = require("../../middleware/creator/creatorAuthMiddleware");
const {
  getCreatorTickets,
  createSupportTicket,
  getTicketDetails,
  sendTicketMessage,
  closeSupportTicket,
  adminReplyTicket,
} = require("../../controllers/creator/creatorSupportController");

// Creator Support Desk endpoints
router.get("/tickets", requireAuth, requireCreatorAuth, getCreatorTickets);
router.post("/tickets", requireAuth, requireCreatorAuth, createSupportTicket);
router.get("/tickets/:ticketId", requireAuth, requireCreatorAuth, getTicketDetails);
router.post("/tickets/:ticketId/messages", requireAuth, requireCreatorAuth, sendTicketMessage);
router.patch("/tickets/:ticketId/close", requireAuth, requireCreatorAuth, closeSupportTicket);

// Admin/Support reply endpoint (can be called with auth)
router.post("/tickets/:ticketId/admin-reply", requireAuth, adminReplyTicket);

module.exports = router;
