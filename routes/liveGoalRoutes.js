const express = require("express");
const router = express.Router();
const {
    createLiveGoal,
    updateLiveGoal,
    getLiveGoal
} = require("../controllers/liveGoalController");

const requireAuth = require("../middleware/requireAuth");
router.use(requireAuth);

router.post("/createLiveGoal", createLiveGoal);
router.put("/updateLiveGoal", updateLiveGoal);
router.get("/getLiveGoal/:userId", getLiveGoal);

module.exports = router;
