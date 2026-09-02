const express = require('express')
const router = express.Router()

const {createDynamicLink} = require("../controllers/dynamicLinksController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)


router.post("/createDynamicLink",createDynamicLink)

module.exports = router