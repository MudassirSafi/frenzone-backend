const mongoose = require("mongoose");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const SupportTicket = require("../../models/supportTicketModel");
const User = require("../../models/userModel");

/**
 * Helper to generate human-readable unique ticket ID
 * e.g., TICK-8492
 */
async function generateUniqueTicketId() {
  for (let i = 0; i < 10; i++) {
    const randomNum = Math.floor(1000 + Math.random() * 9000);
    const candidate = `TICK-${randomNum}`;
    const exists = await SupportTicket.findOne({ ticketId: candidate }).lean();
    if (!exists) return candidate;
  }
  return `TICK-${Date.now().toString().slice(-4)}${Math.floor(10 + Math.random() * 90)}`;
}

/**
 * @desc Get all support tickets for authenticated creator
 * @route GET /creator/support/tickets
 * @access Private (Authenticated Creator)
 */
const getCreatorTickets = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const tickets = await SupportTicket.find({ user_id: new mongoose.Types.ObjectId(userId) })
    .sort({ lastActivityAt: -1 })
    .lean();

  const formatted = tickets.map((t) => ({
    id: t.ticketId,
    ticketNumber: t.ticketId,
    subject: t.subject,
    category: t.category,
    status: t.status,
    priority: t.priority,
    createdAt: t.createdAt ? new Date(t.createdAt).toISOString().split("T")[0] : "",
    updatedAt: t.lastActivityAt ? new Date(t.lastActivityAt).toISOString().split("T")[0] : "",
    messagesCount: Array.isArray(t.messages) ? t.messages.length : 0,
    lastMessageSnippet:
      Array.isArray(t.messages) && t.messages.length > 0
        ? t.messages[t.messages.length - 1].message.slice(0, 80)
        : "",
  }));

  return res.status(200).json({
    success: true,
    data: formatted,
  });
});

/**
 * @desc Create a new support ticket with initial message
 * @route POST /creator/support/tickets
 * @access Private (Authenticated Creator)
 */
const createSupportTicket = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const { subject, category, message, priority } = req.body;

  if (!subject || typeof subject !== "string" || !subject.trim()) {
    return res.status(400).json({ success: false, error: "Ticket subject is required" });
  }

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, error: "Initial message details are required" });
  }

  const validCategories = ["Technical", "Payouts", "Compliance", "General"];
  const finalCategory = validCategories.includes(category) ? category : "General";

  const validPriorities = ["LOW", "MEDIUM", "HIGH"];
  const finalPriority = validPriorities.includes(priority) ? priority : "MEDIUM";

  const user = await User.findById(userId).select("firstname lastname username name").lean();
  const senderName =
    user?.username || user?.name || `${user?.firstname || ""} ${user?.lastname || ""}`.trim() || "Creator";

  const ticketId = await generateUniqueTicketId();

  const newTicket = await SupportTicket.create({
    ticketId,
    user_id: new mongoose.Types.ObjectId(userId),
    subject: subject.trim(),
    category: finalCategory,
    status: "OPEN",
    priority: finalPriority,
    messages: [
      {
        senderId: new mongoose.Types.ObjectId(userId),
        senderRole: "CREATOR",
        senderName,
        message: message.trim(),
        createdAt: new Date(),
      },
    ],
    lastActivityAt: new Date(),
  });

  // Emit real-time notification if Socket.IO is initialized
  if (global.io) {
    global.io.emit("new_support_ticket_created", {
      ticketId: newTicket.ticketId,
      category: newTicket.category,
      subject: newTicket.subject,
      senderName,
    });
  }

  return res.status(201).json({
    success: true,
    message: "Support ticket submitted successfully",
    data: {
      id: newTicket.ticketId,
      ticketNumber: newTicket.ticketId,
      subject: newTicket.subject,
      category: newTicket.category,
      status: newTicket.status,
      priority: newTicket.priority,
      createdAt: new Date(newTicket.createdAt).toISOString().split("T")[0],
      updatedAt: new Date(newTicket.lastActivityAt).toISOString().split("T")[0],
      messagesCount: 1,
    },
  });
});

/**
 * @desc Get ticket details including complete chronological message thread
 * @route GET /creator/support/tickets/:ticketId
 * @access Private (Authenticated Creator)
 */
const getTicketDetails = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const { ticketId } = req.params;
  const userObjectId = new mongoose.Types.ObjectId(userId);

  // Allow lookup by custom ticketId (e.g. TICK-1234) or ObjectId
  const query = mongoose.Types.ObjectId.isValid(ticketId)
    ? { $or: [{ _id: ticketId }, { ticketId }] }
    : { ticketId };

  const ticket = await SupportTicket.findOne(query).lean();

  if (!ticket) {
    return res.status(404).json({ success: false, error: "Support ticket not found" });
  }

  // BOLA / IDOR Defense: Only ticket owner can view ticket
  if (ticket.user_id.toString() !== userObjectId.toString()) {
    return res.status(403).json({ success: false, error: "Forbidden: You do not have permission to view this ticket" });
  }

  return res.status(200).json({
    success: true,
    data: {
      id: ticket.ticketId,
      ticketNumber: ticket.ticketId,
      subject: ticket.subject,
      category: ticket.category,
      status: ticket.status,
      priority: ticket.priority,
      createdAt: new Date(ticket.createdAt).toISOString(),
      updatedAt: new Date(ticket.lastActivityAt).toISOString(),
      messages: (ticket.messages || []).map((m) => ({
        id: m._id ? m._id.toString() : "",
        senderId: m.senderId ? m.senderId.toString() : "",
        senderRole: m.senderRole,
        senderName: m.senderName,
        message: m.message,
        createdAt: new Date(m.createdAt).toISOString(),
      })),
    },
  });
});

/**
 * @desc Send a reply message in an existing support ticket
 * @route POST /creator/support/tickets/:ticketId/messages
 * @access Private (Authenticated Creator)
 */
const sendTicketMessage = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const { ticketId } = req.params;
  const { message } = req.body;

  if (!message || typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ success: false, error: "Message content cannot be empty" });
  }

  const userObjectId = new mongoose.Types.ObjectId(userId);
  const query = mongoose.Types.ObjectId.isValid(ticketId)
    ? { $or: [{ _id: ticketId }, { ticketId }] }
    : { ticketId };

  const ticket = await SupportTicket.findOne(query);

  if (!ticket) {
    return res.status(404).json({ success: false, error: "Support ticket not found" });
  }

  // BOLA / IDOR Defense
  if (ticket.user_id.toString() !== userObjectId.toString()) {
    return res.status(403).json({ success: false, error: "Forbidden: You do not own this ticket" });
  }

  if (ticket.status === "CLOSED") {
    return res.status(400).json({ success: false, error: "This ticket is closed and cannot receive new messages" });
  }

  const user = await User.findById(userId).select("firstname lastname username name").lean();
  const senderName =
    user?.username || user?.name || `${user?.firstname || ""} ${user?.lastname || ""}`.trim() || "Creator";

  const newMessage = {
    senderId: userObjectId,
    senderRole: "CREATOR",
    senderName,
    message: message.trim(),
    createdAt: new Date(),
  };

  ticket.messages.push(newMessage);
  ticket.lastActivityAt = new Date();

  // If ticket was marked RESOLVED, sending a reply re-opens it to IN_PROGRESS
  if (ticket.status === "RESOLVED") {
    ticket.status = "IN_PROGRESS";
  }

  await ticket.save();

  const savedMessage = ticket.messages[ticket.messages.length - 1];
  const formattedMessage = {
    id: savedMessage._id.toString(),
    senderId: savedMessage.senderId.toString(),
    senderRole: savedMessage.senderRole,
    senderName: savedMessage.senderName,
    message: savedMessage.message,
    createdAt: new Date(savedMessage.createdAt).toISOString(),
  };

  // Real-time broadcast via Socket.IO
  if (global.io) {
    global.io.to(`ticket_${ticket.ticketId}`).emit("support_ticket_message", {
      ticketId: ticket.ticketId,
      message: formattedMessage,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Message sent successfully",
    data: formattedMessage,
  });
});

/**
 * @desc Close / resolve support ticket
 * @route PATCH /creator/support/tickets/:ticketId/close
 * @access Private (Authenticated Creator)
 */
const closeSupportTicket = catchAsyncError(async (req, res) => {
  const userId = req.userId || req.user?._id;
  if (!userId) {
    return res.status(401).json({ success: false, error: "Authentication required" });
  }

  const { ticketId } = req.params;
  const userObjectId = new mongoose.Types.ObjectId(userId);
  const query = mongoose.Types.ObjectId.isValid(ticketId)
    ? { $or: [{ _id: ticketId }, { ticketId }] }
    : { ticketId };

  const ticket = await SupportTicket.findOne(query);

  if (!ticket) {
    return res.status(404).json({ success: false, error: "Support ticket not found" });
  }

  if (ticket.user_id.toString() !== userObjectId.toString()) {
    return res.status(403).json({ success: false, error: "Forbidden: You do not own this ticket" });
  }

  ticket.status = "RESOLVED";
  ticket.lastActivityAt = new Date();
  await ticket.save();

  return res.status(200).json({
    success: true,
    message: "Ticket marked as resolved",
    data: {
      id: ticket.ticketId,
      status: ticket.status,
    },
  });
});

/**
 * @desc Admin / Support Specialist reply to ticket (for live testing & support staff)
 * @route POST /creator/support/tickets/:ticketId/admin-reply
 * @access Private
 */
const adminReplyTicket = catchAsyncError(async (req, res) => {
  const { ticketId } = req.params;
  const { message, staffName } = req.body;

  if (!message || !message.trim()) {
    return res.status(400).json({ success: false, error: "Message content is required" });
  }

  const query = mongoose.Types.ObjectId.isValid(ticketId)
    ? { $or: [{ _id: ticketId }, { ticketId }] }
    : { ticketId };

  const ticket = await SupportTicket.findOne(query);
  if (!ticket) {
    return res.status(404).json({ success: false, error: "Ticket not found" });
  }

  const adminId = req.userId || req.user?._id || new mongoose.Types.ObjectId();

  const newMessage = {
    senderId: adminId,
    senderRole: "SUPPORT",
    senderName: staffName || "Frenzone Support Specialist",
    message: message.trim(),
    createdAt: new Date(),
  };

  ticket.messages.push(newMessage);
  ticket.status = "IN_PROGRESS";
  ticket.lastActivityAt = new Date();
  await ticket.save();

  const savedMessage = ticket.messages[ticket.messages.length - 1];
  const formattedMessage = {
    id: savedMessage._id.toString(),
    senderId: savedMessage.senderId.toString(),
    senderRole: savedMessage.senderRole,
    senderName: savedMessage.senderName,
    message: savedMessage.message,
    createdAt: new Date(savedMessage.createdAt).toISOString(),
  };

  if (global.io) {
    global.io.to(`ticket_${ticket.ticketId}`).emit("support_ticket_message", {
      ticketId: ticket.ticketId,
      message: formattedMessage,
    });
  }

  return res.status(200).json({
    success: true,
    message: "Support reply posted successfully",
    data: formattedMessage,
  });
});

module.exports = {
  getCreatorTickets,
  createSupportTicket,
  getTicketDetails,
  sendTicketMessage,
  closeSupportTicket,
  adminReplyTicket,
};
