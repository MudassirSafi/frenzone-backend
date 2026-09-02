const express = require("express")
const router = express.Router()

const {createTicket} = require("../controllers/ticketController")

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)

router.post("/createTicket",createTicket)


module.exports = router


