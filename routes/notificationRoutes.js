const express = require('express')
const router = express.Router()

const {sendNotificationUpdated} = require("../controllers/notificationController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)

router.post("/sendNotificationUpdated",sendNotificationUpdated)

module.exports = router