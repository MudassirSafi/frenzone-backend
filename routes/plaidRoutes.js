const express = require('express')
const router = express.Router()

const plaids  = require("../controllers/plaidController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)


router.post("/createLinkToken",plaids.createLinkToken)
router.post("/exchangePublicToken",plaids.exchangePublicToken)
router.get("/getAccounts",plaids.getAccounts)

module.exports = router