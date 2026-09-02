require("dotenv").config();
const fetch = require("node-fetch");

const apiKey = process.env.SOUNDSTRIPE_API_KEY;

const songList = async (req, res) => {
  try {
    const queryString = req.url.split('?')[1];
    var soundstripeUrl = `https://api.soundstripe.com/v1/songs?${queryString}`;
    const response = await fetch(soundstripeUrl, {
      method: "GET",
      headers: {
        accept: "application/json",
        "Content-Type": "application/vnd.api+json",
        Accept: "application/vnd.api+json",
        Authorization: `Bearer ${apiKey}`,
      },
    });

    const data = await response.json();
    res.json(data);
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ error: "Internal Server Error" });
  }
};

module.exports = { songList };
