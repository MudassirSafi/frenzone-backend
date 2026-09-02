const express = require("express")
const router = express.Router()


const {contactUs,agencyForm} = require("../controllers/formControllers")

router.post("/contactUs",contactUs)
router.post("/agencyForm",agencyForm)

module.exports = router
