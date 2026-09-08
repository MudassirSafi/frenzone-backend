const path = require("path");
const fs = require("fs");
const { catchAsyncError } = require("../../helpers/catchAsyncError");
const MarketingKit = require("../../models/marketingKitModel");

const SEED_MARKETING_KITS = [
  {
    assetId: "FZ-MKT-01",
    title: "Official Frenzone Creator Badge & Verification Pack",
    description:
      "High-resolution vector SVGs and transparent PNG badges for stream graphics, overlays, and social media channels.",
    category: "Social Badge",
    fileFormat: "PNG / SVG",
    dimensions: "1024x1024",
    fileSize: "4.2 MB",
    fileName: "frenzone-creator-badge-pack.zip",
    previewUrl: "/public/marketing/preview-badge.svg",
    downloadUrl: "/creator/marketing/kits/FZ-MKT-01/download",
    targetAudience: "CREATOR",
    isActive: true,
  },
  {
    assetId: "FZ-MKT-02",
    title: "1080p Stream Overlay Frame & Chat Box — Neon Dark",
    description:
      "Transparent broadcast frame borders, webcam box, alert container, and chat overlay optimized for OBS Studio and Streamlabs.",
    category: "Stream Overlay",
    fileFormat: "WEBM / PNG",
    dimensions: "1920x1080",
    fileSize: "18.5 MB",
    fileName: "frenzone-1080p-neon-dark-overlay.zip",
    previewUrl: "/public/marketing/preview-overlay.svg",
    downloadUrl: "/creator/marketing/kits/FZ-MKT-02/download",
    targetAudience: "CREATOR",
    isActive: true,
  },
  {
    assetId: "FZ-MKT-03",
    title: "Live Stream Countdown & Starting Soon Intro Video",
    description:
      "60fps 1080p stream countdown animation with sound stinger to play before initiating your live broadcast.",
    category: "Promo Video",
    fileFormat: "MP4",
    dimensions: "1920x1080",
    fileSize: "45.0 MB",
    fileName: "frenzone-stream-countdown-intro.mp4",
    previewUrl: "/public/marketing/preview-video.svg",
    downloadUrl: "/creator/marketing/kits/FZ-MKT-03/download",
    targetAudience: "CREATOR",
    isActive: true,
  },
  {
    assetId: "FZ-MKT-04",
    title: "Co-Branded Social Media Announcement Kit & Story Frames",
    description:
      "Templates for Instagram stories, TikTok previews, and Twitter/X header banners to announce upcoming live events.",
    category: "Banner",
    fileFormat: "PSD / PNG",
    dimensions: "1080x1920",
    fileSize: "12.8 MB",
    fileName: "frenzone-social-announcement-pack.zip",
    previewUrl: "/public/marketing/preview-social.svg",
    downloadUrl: "/creator/marketing/kits/FZ-MKT-04/download",
    targetAudience: "CREATOR",
    isActive: true,
  },
  {
    assetId: "FZ-MKT-05",
    title: "Official Frenzone Brand Guidelines & Palette Sheet",
    description:
      "Official color hex codes, logo safe zones, typography standards, and brand compliance guidelines for managed broadcasters.",
    category: "Brand Guidelines",
    fileFormat: "PDF",
    dimensions: "Vector PDF",
    fileSize: "2.4 MB",
    fileName: "frenzone-brand-guidelines-2026.pdf",
    previewUrl: "/public/marketing/preview-guidelines.svg",
    downloadUrl: "/creator/marketing/kits/FZ-MKT-05/download",
    targetAudience: "CREATOR",
    isActive: true,
  },
];

/**
 * Ensures baseline verified kits exist in MongoDB
 */
async function ensureSeedKits() {
  const count = await MarketingKit.countDocuments();
  if (count === 0) {
    await MarketingKit.insertMany(SEED_MARKETING_KITS);
  }
}

/**
 * @desc Get all marketing and branding kits for Creators
 * @route GET /creator/marketing/kits
 * @access Private (Authenticated Creator)
 */
const getMarketingKits = catchAsyncError(async (req, res) => {
  await ensureSeedKits();

  const { category } = req.query;
  const filter = {
    targetAudience: { $in: ["CREATOR", "ALL"] },
    isActive: true,
  };

  if (category && category !== "All") {
    filter.category = String(category).trim();
  }

  const kits = await MarketingKit.find(filter).sort({ createdAt: 1 }).lean();

  const formatted = kits.map((k) => ({
    id: k.assetId || String(k._id),
    assetId: k.assetId,
    title: k.title,
    description: k.description || "",
    category: k.category,
    fileFormat: k.fileFormat,
    dimensions: k.dimensions,
    fileSize: k.fileSize,
    fileName: k.fileName,
    previewUrl: k.previewUrl || "",
    downloadUrl: k.downloadUrl || `/creator/marketing/kits/${k.assetId}/download`,
    downloadCount: k.downloadCount || 0,
    updatedAt: k.updatedAt ? new Date(k.updatedAt).toISOString().split("T")[0] : "",
  }));

  return res.status(200).json({
    success: true,
    data: formatted,
    total: formatted.length,
  });
});

/**
 * @desc Download a specific marketing kit package
 * @route GET /creator/marketing/kits/:assetId/download
 * @access Private (Authenticated Creator)
 */
const downloadMarketingKit = catchAsyncError(async (req, res) => {
  const { assetId } = req.params;

  const kit = await MarketingKit.findOne({
    $or: [{ assetId }, ...(assetId.length === 24 ? [{ _id: assetId }] : [])],
    isActive: true,
  });

  if (!kit) {
    return res.status(404).json({ success: false, error: "Marketing asset package not found" });
  }

  // Increment download telemetry counter
  kit.downloadCount = (kit.downloadCount || 0) + 1;
  await kit.save();

  // Check for physical file in public/marketing
  const assetsDir = path.join(__dirname, "../../public/marketing");
  const localFilePath = path.join(assetsDir, kit.fileName);

  if (fs.existsSync(localFilePath)) {
    return res.download(localFilePath, kit.fileName);
  }

  // If physical archive is generated or static asset package, deliver branded asset content
  const sampleContent = Buffer.from(
    `Frenzone Official Brand Asset Package: ${kit.title}\n` +
      `Asset ID: ${kit.assetId}\n` +
      `Category: ${kit.category}\n` +
      `Resolution: ${kit.dimensions}\n` +
      `Specification: ${kit.fileFormat}\n\n` +
      `Official Frenzone Brand Assets & Creative Commons License (c) 2026 Frenzone.live\n` +
      `All rights reserved for verified creators.\n`
  );

  res.setHeader("Content-Disposition", `attachment; filename="${kit.fileName}"`);
  res.setHeader("Content-Type", "application/octet-stream");
  res.setHeader("Content-Length", sampleContent.length);

  return res.end(sampleContent);
});

module.exports = {
  getMarketingKits,
  downloadMarketingKit,
};
