const Badge = require("../models/badgeModel");
const User = require("../models/userModel");
require("dotenv").config();

const crypto = require("crypto");
const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

const bucketName = process.env.BUCKET_NAME;
const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const getBadgeImageUrl = async (key) => {
  if (!key) return "";
  const command = new GetObjectCommand({ Bucket: bucketName, Key: key });
  return getSignedUrl(s3, command, { expiresIn: "604800" });
};

const createBadge = async (req, res) => {
  try {
    const { title, text } = req.body;
    if (!title || String(title).trim() === "") {
      return res.status(400).json({ success: false, message: "title is required" });
    }

    let imageKey = "";
    if (req.file) {
      imageKey = randomName();
      const command = new PutObjectCommand({
        Bucket: bucketName,
        Key: imageKey,
        Body: req.file.buffer,
        ContentType: req.file.mimetype,
      });
      await s3.send(command);
    }

    const badge = await Badge.create({
      title: String(title).trim(),
      text: text ? String(text) : "",
      image: imageKey,
    });

    res.status(201).json({ success: true, badge });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateBadge = async (req, res) => {
  try {
    const { badgeId, title, text } = req.body;
    if (!badgeId) return res.status(400).json({ success: false, message: "badgeId is required" });

    const badge = await Badge.findById(badgeId);
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });

    let newImageKey = badge.image;
    if (req.file) {
      newImageKey = randomName();
      await s3.send(
        new PutObjectCommand({
          Bucket: bucketName,
          Key: newImageKey,
          Body: req.file.buffer,
          ContentType: req.file.mimetype,
        }),
      );

      if (badge.image) {
        await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: badge.image }));
      }
    }

    badge.title = title != null ? String(title).trim() : badge.title;
    badge.text = text != null ? String(text) : badge.text;
    badge.image = newImageKey;
    await badge.save();

    res.status(200).json({ success: true, badge });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteBadge = async (req, res) => {
  try {
    const { badgeId } = req.body;
    if (!badgeId) return res.status(400).json({ success: false, message: "badgeId is required" });

    const badge = await Badge.findById(badgeId);
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });

    if (badge.image) {
      await s3.send(new DeleteObjectCommand({ Bucket: bucketName, Key: badge.image }));
    }

    await Badge.deleteOne({ _id: badgeId });
    await User.updateMany({ badges: badgeId }, { $pull: { badges: badgeId } });

    res.status(200).json({ success: true, message: "Badge deleted" });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAllBadges = async (req, res) => {
  try {
    let badges = await Badge.find({}).sort({ createdAt: -1 }).lean();
    badges = await Promise.all(
      badges.map(async (b) => ({
        ...b,
        imageUrl: await getBadgeImageUrl(b.image),
      })),
    );
    res.status(200).json({ success: true, badges });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getBadgeById = async (req, res) => {
  try {
    const { badgeId } = req.params;
    const badge = await Badge.findById(badgeId).lean();
    if (!badge) return res.status(404).json({ success: false, message: "Badge not found" });
    badge.imageUrl = await getBadgeImageUrl(badge.image);
    res.status(200).json({ success: true, badge });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getBadgeImageUrl,
  createBadge,
  updateBadge,
  deleteBadge,
  getAllBadges,
  getBadgeById,
};
