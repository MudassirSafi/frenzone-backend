const express = require('express')
const router = express.Router()

const {getActivities, deleteActivity} = require("../controllers/activityController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)


router.get("/getActivities/:userid",getActivities)

router.delete("/deleteActivity",deleteActivity)

module.exports = router