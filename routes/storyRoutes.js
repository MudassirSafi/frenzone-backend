const express = require("express")
const router = express.Router()

const multer = require('multer')
const storage = multer.memoryStorage()
const upload = multer({storage:storage})


const {postStory,getStories , getUserStory,deleteStory, getStoryById, likeStory, replyStory, viewStory} = require("../controllers/storyController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)

router.post("/postStory",upload.array('contents'),postStory)
router.get("/getStories/:userid",getStories)
router.get("/getUserStory/:userid",getUserStory)
router.get("/getStoryById/:storyid",getStoryById)
router.delete("/deleteStory",deleteStory)
router.patch("/likeStory", likeStory)
router.patch("/replyStory", replyStory)
router.patch("/viewStory", viewStory)


module.exports = router