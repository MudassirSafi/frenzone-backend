const express = require("express");
const router = express.Router();
const { songList } = require("../controllers/songListController");
router.get("/songs", songList);

module.exports = router;
