const express = require("express");
const router = express.Router();

const {
  giveReview,
  getAllReviews,
  getUserAllReviews
} = require("../controllers/reviewController");

router.post("/giveReview", giveReview);
router.get("/getAllReviews", getAllReviews);
router.get("/getUserAllReviews/:userid", getUserAllReviews);

module.exports = router;
