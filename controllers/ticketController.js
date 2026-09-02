const axios = require("axios");
const User = require("../models/userModel");

require("dotenv").config();

const liveAgentKey = process.env.LIVE_AGENT_KEY;

const headers = {
  apikey: liveAgentKey,
  "Content-Type": "application/json",
};

const createTicket = async (req, res) => {
  try {
    const { userid, subject, message } = req.body;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const body = {
      useridentifier: user.email,
      subject,
      departmentid: "default",
      recipient: "support@mail.frenzone.ladesk.com",
      message,
    };

    const { data } = await axios.post(
      "https://frenzone.ladesk.com/api/v3/tickets",
      body,
      { headers }
    );

    res.status(200).json({
      message: "Ticket Created",
    });
    console.log(data);
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

module.exports = { createTicket };
