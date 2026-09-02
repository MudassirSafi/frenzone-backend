const User = require("../models/userModel");
const Admin = require("../models/adminModel");
const Post = require("../models/postModel");
const Reel = require("../models/reelModel");
const { getPicUrl } = require("./userController");
const { sendNotification, sendBroadcast } = require("./notificationController");
const nodemailer = require("nodemailer");
require("dotenv").config();

const godaddyEmail = process.env.EMAIL;
const godaddyPassword = process.env.PASSWORD;

const mailTransport = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // STARTTLS
  auth: {
    user: godaddyEmail,
    pass: godaddyPassword,
  },
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: false,
  },
});
const blockUserByAdmin = async (req, res) => {
  try {
    const { adminId, usertoBlockId } = req.body;
    const admin = await Admin.findById(adminId);
    const usertoBlock = await User.findById(usertoBlockId);

    if (!admin) {
      throw Error("Admin does not exist");
    }
    if (!usertoBlock) {
      throw Error("User to block does not exist");
    }
    if (!usertoBlock.isAdminBlocked) {
      await User.updateOne(
        { _id: usertoBlock._id },
        { $set: { isAdminBlocked: true } }
      );
      await Admin.updateOne(
        { _id: admin._id },
        { $push: { blocked: usertoBlock._id } }
      );
      return res
        .status(200)
        .json({ message: "User has been blocked by admin" });
    } else {
      await User.updateOne(
        { _id: usertoBlock._id },
        { $set: { isAdminBlocked: false } }
      );
      await Admin.updateOne(
        { _id: admin._id },
        { $pull: { blocked: usertoBlock._id } }
      );
      return res
        .status(200)
        .json({ message: "User has been unblocked by admin" });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const searchUsers = async (req, res) => {
  try {
    const perPage = req.params.perPage;
    const page = req.params.page;
    const search = req.params.search || "";

    let users = await User.find({
      $or: [
        { username: { $regex: search, $options: "i" } },
        { firstname: { $regex: search, $options: "i" } },
        { lastname: { $regex: search, $options: "i" } },
      ],
    })
      .select("-password")
      .skip((page - 1) * perPage)
      .limit(perPage);

    users = await Promise.all(
      users.map(async (user) => {
        user = user.toObject();
        try {
          const url = await getPicUrl(user._id);
          user.url = url;
          return user;
        } catch (error) {
          throw error;
        }
      })
    );

    res.status(200).json({
      users: users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllUsers = async (req, res) => {
  try {
    let users = await User.find({});
    users = await Promise.all(
      users.map(async (user) => {
        user = user.toObject();
        user.profilePicUrl = await getPicUrl(user._id);
        return user;
      })
    );

    res.status(200).json({
      users,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const broadcast = async (req, res) => {
  try {
    const message = req.body.message;
    var users = await User.find({});

    // var users = [
    //   {
    //     _id: "6641f13e10b0fafe0b1e5d4a"
    //   }
    // ]
    await Promise.all(
      users.map(async (user) => {
        await sendBroadcast(user._id, "Frenzone.live", message);
      })
    );

    res.status(200).json({
      success: true,
      message: "message sent"
    })
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const broadcastEmail = async (req, res) => {
  try {
    const subject = req.body.subject;
    const body = req.body.body;

    if (!subject || String(subject).trim() === "") {
      return res.status(400).json({ success: false, message: "subject is required" });
    }
    if (!body || String(body).trim() === "") {
      return res.status(400).json({ success: false, message: "body is required" });
    }

    const users = await User.find({ email: { $exists: true, $ne: "" } }).select("email").lean();
    const emails = users.map((u) => u.email).filter(Boolean);

    const chunkSize = 25;
    for (let i = 0; i < emails.length; i += chunkSize) {
      const chunk = emails.slice(i, i + chunkSize);
      await Promise.all(
        chunk.map(async (email) => {
          try {
            await mailTransport.sendMail({
              from: `Frenzone Live <${godaddyEmail}>`,
              to: email,
              subject: String(subject),
              html: String(body),
              text: String(body).replace(/<[^>]*>/g, ""),
            });
          } catch (e) {
            // swallow per-email failures so broadcast continues
            console.log("broadcastEmail send error:", email, e.message);
          }
        }),
      );
    }

    res.status(200).json({ success: true, message: "email broadcast sent", count: emails.length });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const liveAccess = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    let message = "";

    if (user.liveAccess) {
      await user.updateOne({
        liveAccess: false,
      });
      message = "Live Access Revoked";
    } else {
      await user.updateOne({
        liveAccess: true,
      });
      message = "Live Access Granted";
    }

    res.status(200).json({
      message,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const setVerified = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    let message = "";

    if (user.isVerified) {
      await user.updateOne({
        isVerified: false,
      });
      message = "User UnVerified";
    } else {
      await user.updateOne({
        isVerified: true,
      });
      message = "User Verified";
    }
    res.status(200).json({
      message,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const ban = async (req, res) => {
  try {
    const userid = req.body.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    let message = "";

    if (user.banned) {
      await user.updateOne({
        banned: false,
      });
      message = "User UnBanned";
    } else {
      await user.updateOne({
        banned: true,
      });
      message = "User Banned";
    }
    res.status(200).json({
      message,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getStats = async (req, res) => {
  try {

    var usersCount = await User.countDocuments({})
    var postsCount = await Post.countDocuments({})
    var reelsCount = await Reel.countDocuments({})
    var nudityPostsCount = await Post.countDocuments({ sigthengineResults: { $exists: true, $ne: null,  $not: { $size: 0 } } })
    var nudityReelsCount = await Reel.countDocuments({ sightengineResults: { $exists: true, $ne: null,  $not: { $size: 0 } } })


    res.status(200).json({
      usersCount,
      postsCount,
      reelsCount,
      nudityPostsCount,
      nudityReelsCount
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};



module.exports = {
  searchUsers,
  getAllUsers,
  broadcast,
  broadcastEmail,
  setVerified,
  liveAccess,
  ban,
  blockUserByAdmin,
  getStats
};
