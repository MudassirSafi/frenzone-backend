const express = require('express')
const router = express.Router()

const multer = require('multer')
const storage = multer.memoryStorage()
const upload = multer({storage:storage})


const {createGift,getAllGifts, uploadBulkGift, emptyGifts, createGiftFile, getAllNewGifts}= require("../controllers/GiftController")


router.post("/createGift", upload.single("gif"), createGift)
router.post("/createGiftFile", upload.fields([{ name: "giftFile" }, { name: "thumbnail" }]), createGiftFile)
router.get("/getAllGifts",getAllGifts)
router.get("/getAllNewGifts",getAllNewGifts)
router.get("/uploadBulkGift",uploadBulkGift)
router.get("/emptyGifts",emptyGifts)


module.exports = router
