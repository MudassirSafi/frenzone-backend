const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const {
  getCreatorTickets,
  createSupportTicket,
  getTicketDetails,
  sendTicketMessage,
  closeSupportTicket,
  adminReplyTicket,
} = require("../../controllers/creator/creatorSupportController");

// Creator Support Desk endpoints
router.get("/tickets", requireAuth, getCreatorTickets);
router.post("/tickets", requireAuth, createSupportTicket);
router.get("/tickets/:ticketId", requireAuth, getTicketDetails);
router.post("/tickets/:ticketId/messages", requireAuth, sendTicketMessage);
router.patch("/tickets/:ticketId/close", requireAuth, closeSupportTicket);

// Admin/Support reply endpoint (can be called with auth)
router.post("/tickets/:ticketId/admin-reply", requireAuth, adminReplyTicket);

module.exports = router;
