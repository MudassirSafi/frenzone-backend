const express = require("express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

const {
  postReel,
  deleteReel,
  likeReel,
  getUserReels,
  getAllPostedReels,
  upgradedGetAllPostedReels,
  viewReel,
  makeComment,
  getComments,
  likeComment,
  deleteComment,
  makeReply,
  getReplies,
  likeReply,
  deleteReply,
  getTotalReels,
  acceptReel,
  editReel,
  getReelById,
  getRecommendedReels,
  getAllNudityReels,
  shareReel,
  streamReelVideo
} = require("../controllers/reelController");
router.get("/getTotalReels", getTotalReels);
router.post("/acceptReel", acceptReel);
router.get("/getAllNudityReels", getAllNudityReels);
const requireAuth = require("../middleware/requireAuth");
router.use(requireAuth);

router.post(
  "/postReel",
  upload.fields([{ name: "video" }, { name: "thumbnail" }]),
  postReel
);
router.delete("/deleteReel", deleteReel);

router.patch("/likeReel", likeReel);
router.patch("/shareReel", shareReel)
router.get("/getUserReels/:userid", getUserReels);

router.get("/getReelById/:reelid", getReelById);
router.patch("/editReel", editReel)

router.get("/getAllPostedReels", getAllPostedReels);
router.get("/upgradedGetAllPostedReels/:pageNo/:perPage/:userid?", upgradedGetAllPostedReels);
router.patch("/viewReel", viewReel);

router.post("/makeComment", makeComment);
router.get("/getComments/:reelid", getComments);
router.patch("/likeComment", likeComment);
router.delete("/deleteComment", deleteComment);

router.post("/makeReply", makeReply);
router.get("/getReplies/:commentid", getReplies);
router.get("/getRecommendedReels/:userid", getRecommendedReels);
router.patch("/likeReply", likeReply);
router.delete("/deleteReply", deleteReply);

// Video streaming endpoint - supports HTTP Range requests for chunked delivery
router.get("/stream/:reelid", streamReelVideo);

module.exports = router;
