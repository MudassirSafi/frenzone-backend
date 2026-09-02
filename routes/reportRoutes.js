const express = require("express");
const router = express.Router();
const {
  reportUser,
  getReportedUserById,
  removeReportedUser,
} = require("../controllers/reportController");
router.post("/reportUser", reportUser);
router.get("/getReportedUserById/:userid", getReportedUserById);
router.delete("/removeReportedUser/:reportedUserId", removeReportedUser);

module.exports = router;
