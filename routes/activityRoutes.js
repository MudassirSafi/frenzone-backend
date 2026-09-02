const express = require('express')
const router = express.Router()

const {getActivities, deleteActivity, markAsRead, getUnreadCount, getUpdatedActivities} = require("../controllers/activityController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)


router.get("/getActivities/:userid/:pageNo/:perPage",getActivities)
router.patch("/getUpdatedActivities", getUpdatedActivities);

router.delete("/deleteActivity",deleteActivity)
router.patch("/markAsRead", markAsRead)
router.get("/getUnreadCount/:userid", getUnreadCount);

module.exports = router