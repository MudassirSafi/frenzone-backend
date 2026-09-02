const express = require("express");
const router = express.Router();

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({
  storage, // or diskStorage
  limits: {
    fileSize: 500 * 1024 * 1024,   // e.g. 500MB — must be larger than your expected max video
    // fields: 20,         // optional: max number of non-file fields
    // parts: 50           // optional: total multipart parts
  }
});

const {
  createPost,
  getAllPostDescriptions,
  editPost,
  pinPost,
  deletePost,
  getAllposts,
  getAllPostsLatest,
  getUserPosts,
  likePost,
  makeComment,
  getComments,
  likeComment,
  deleteComment,
  makeReply,
  getReplies,
  likeReply,
  deleteReply,
  bookmarkPost,
  getBookmarked,
  buyPost,
  getPostById,
  getTotalPosts,
  acceptPost,
  getAllNudityPosts,
  sharePost
} = require("../controllers/postController");

const requireAuth = require("../middleware/requireAuth");
const { getTrendingPosts } = require("../controllers/trendingPostController");
// router.use(requireAuth)

router.post(
  "/createPost",
  upload.fields([{ name: "contents" }, { name: "thumbnails" }]),
  createPost
);
router.patch("/editPost", editPost);

router.delete("/deletePost", deletePost);
router.get("/getAllposts/:userid/:pageNo/:perPage", getAllposts);
router.get("/getAllPostsLatest/:userid/:pageNo/:perPage", getAllPostsLatest);
router.get("/getPostById/:postid", getPostById);
router.get("/trending", getTrendingPosts);

router.get("/getUserPosts/:userid", getUserPosts);
router.get("/description", getAllPostDescriptions);
router.get("/getAllNudityPosts", getAllNudityPosts);

router.patch("/pinPost", pinPost);

router.patch("/bookmarkPost", bookmarkPost);
router.patch("/sharePost", sharePost);
router.get("/getBookmarked/:userid", getBookmarked);

router.patch("/likePost", likePost);

router.patch("/buyPost", buyPost);

router.post("/makeComment", makeComment);
router.get("/getComments/:postid", getComments);
router.patch("/likeComment", likeComment);
router.delete("/deleteComment", deleteComment);

router.post("/makeReply", makeReply);
router.get("/getReplies/:commentid", getReplies);
router.patch("/likeReply", likeReply);
router.delete("/deleteReply", deleteReply);
router.get("/getTotalPosts", getTotalPosts);
router.post("/acceptPost", acceptPost);

module.exports = router;
