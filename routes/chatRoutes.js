const express = require('express')
const router = express.Router()

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)

const {getChatHistory,getThreads, markAsRead, getUnreadCount, deleteChat, getMessageAccess, getMessageRequestStatus, acceptMessageRequest, getMessageRequests, declineMessageRequest, setConversationMuted, getConversationMuteStatus} = require("../controllers/chatController")

router.get("/getChatHistory",getChatHistory)
router.get("/getThreads/:userid",getThreads)
router.patch("/markAsRead", markAsRead);
router.get("/getUnreadCount/:userid", getUnreadCount);
router.get("/messageAccess/:receiverId/:senderId", getMessageAccess);
router.get("/messageRequestStatus/:ownerId/:requesterId", getMessageRequestStatus);
router.patch("/acceptMessageRequest", acceptMessageRequest);
router.get("/messageRequests", getMessageRequests);
router.patch("/declineMessageRequest", declineMessageRequest);
router.patch("/conversationMute", setConversationMuted);
router.get("/conversationMute/:otherUserId", getConversationMuteStatus);
router.delete("/deleteChat", deleteChat)



module.exports = router
