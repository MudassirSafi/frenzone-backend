const express = require("express");
const router = express.Router();
const { login, me } = require("../controllers/adminAuthController");
const { requireAdmin } = require("../middleware/requireAdmin");

router.post("/login", login);
router.get("/me", requireAdmin, me);

module.exports = router;
