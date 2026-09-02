const express = require("express");
const router = express.Router();

const {
  searchUsers,
  getAllUsers,
  broadcast,
  broadcastEmail,
  setVerified,
  liveAccess,
  ban,
  blockUserByAdmin,
  getStats
} = require("../controllers/adminController");


const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)

router.get("/getAllUsers", getAllUsers);
router.get("/searchUsers/:perPage/:page/:search", searchUsers);
router.get("/searchUsers/:perPage/:page", searchUsers);
router.post("/broadcast", broadcast);
router.post("/broadcastEmail", broadcastEmail);
router.patch("/setVerified", setVerified);
router.patch("/liveAccess", liveAccess);
router.patch("/ban", ban);
router.patch("/blockUserByAdmin", blockUserByAdmin);
router.get("/getStats", getStats)

module.exports = router;
