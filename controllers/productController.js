const mongoose = require("mongoose");
const crypto = require("crypto");
const Product = require("../models/productModel");
const User = require("../models/userModel");
const { aws } = require("../helpers/otherHelpers");
const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

require("dotenv").config();

const bucketRegion = process.env.BUCKET_REGION;
const accessKey = process.env.ACCESS_KEY;
const secretAccessKey = process.env.SECRET_ACCESS_KEY;
const LIVE_SHOP_PRODUCT_IDS = [
  process.env.REVENUECAT_LIVE_SHOP_MONTHLY_SUBSCRIPTION_PRODUCT_ID,
  process.env.REVENUECAT_LIVE_SHOP_YEARLY_SUBSCRIPTION_PRODUCT_ID,
].filter((v) => typeof v === "string" && v.trim() !== "");

const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const hasActiveLiveShoppingAccess = (user) => {
  if (!user || !user.liveShoppingActive) return false;
  if (!user.liveShoppingExpirationAt) return true;
  return new Date(user.liveShoppingExpirationAt) > new Date();
};
const isUserCurrentlyLive = (user) => !!user?.isLive;

const parseRemoveImages = (removeImages) => {
  if (!removeImages) return [];
  if (Array.isArray(removeImages)) return removeImages.filter(Boolean);
  if (typeof removeImages === "string") {
    try {
      const parsed = JSON.parse(removeImages);
      if (Array.isArray(parsed)) return parsed.filter(Boolean);
    } catch (error) {
      return removeImages
        .split(",")
        .map((i) => i.trim())
        .filter(Boolean);
    }
  }
  return [];
};

const getSignedProduct = async (productDoc) => {
  const product = productDoc.toObject ? productDoc.toObject() : productDoc;
  const imageUrls = await Promise.all((product.images || []).map((img) => aws.getLinkFromAWS(img)));
  if (product.creatorId?.profilePicture) {
    product.creatorId.profilePicture = await aws.getLinkFromAWS(product.creatorId.profilePicture);
    product.creatorId.profilePic = product.creatorId.profilePicture;
  }
  return {
    ...product,
    imageUrls,
  };
};

const parsePagination = (query) => {
  const page = Math.max(parseInt(query.page, 10) || 1, 1);
  const limit = Math.max(parseInt(query.limit, 10) || 10, 1);
  return { page, limit, skip: (page - 1) * limit };
};

const buildProductFilters = async (query) => {
  const {
    creatorId,
    title,
    description,
    externalUrl,
    minPrice,
    maxPrice,
    keyword,
    createdFrom,
    createdTo,
    creatorSearch,
  } = query;

  const filter = {};

  if (creatorId && mongoose.isValidObjectId(creatorId)) {
    filter.creatorId = creatorId;
  }
  if (title) filter.title = { $regex: title, $options: "i" };
  if (description) filter.description = { $regex: description, $options: "i" };
  if (externalUrl) filter.externalUrl = { $regex: externalUrl, $options: "i" };

  if (minPrice !== undefined || maxPrice !== undefined) {
    filter.price = {};
    if (minPrice !== undefined && !Number.isNaN(Number(minPrice))) {
      filter.price.$gte = Number(minPrice);
    }
    if (maxPrice !== undefined && !Number.isNaN(Number(maxPrice))) {
      filter.price.$lte = Number(maxPrice);
    }
    if (Object.keys(filter.price).length === 0) {
      delete filter.price;
    }
  }

  if (createdFrom || createdTo) {
    filter.createdAt = {};
    if (createdFrom) filter.createdAt.$gte = new Date(createdFrom);
    if (createdTo) filter.createdAt.$lte = new Date(createdTo);
  }

  if (keyword) {
    filter.$or = [
      { title: { $regex: keyword, $options: "i" } },
      { description: { $regex: keyword, $options: "i" } },
      { externalUrl: { $regex: keyword, $options: "i" } },
    ];
  }

  if (creatorSearch) {
    const users = await User.find({
      $or: [
        { username: { $regex: creatorSearch, $options: "i" } },
        { firstname: { $regex: creatorSearch, $options: "i" } },
        { lastname: { $regex: creatorSearch, $options: "i" } },
      ],
    }).select("_id");
    const ids = users.map((u) => u._id);
    filter.creatorId = { $in: ids };
  }

  return filter;
};

const parseSort = (query) => {
  const sortBy = query.sortBy || "createdAt";
  const sortOrder = String(query.sortOrder || "desc").toLowerCase() === "asc" ? 1 : -1;
  return { [sortBy]: sortOrder };
};

const createProduct = async (req, res) => {
  try {
    const { creatorId, title, description, price, externalUrl } = req.body;
    if (!creatorId || !mongoose.isValidObjectId(creatorId)) {
      return res.status(400).json({ success: false, message: "Valid creatorId is required" });
    }
    if (!title || !title.trim()) {
      return res.status(400).json({ success: false, message: "title is required" });
    }
    if (price === undefined || price === null || Number.isNaN(Number(price))) {
      return res.status(400).json({ success: false, message: "Valid price is required" });
    }

    const creator = await User.findById(creatorId);
    if (!creator) {
      return res.status(404).json({ success: false, message: "Creator not found" });
    }

    if (!hasActiveLiveShoppingAccess(creator)) {
      return res.status(403).json({
        success: false,
        message: "Live shopping subscription is required to create products",
      });
    }
    if (isUserCurrentlyLive(creator)) {
      return res.status(403).json({
        success: false,
        message: "You cannot create products while you are live",
      });
    }

    if (LIVE_SHOP_PRODUCT_IDS.length > 0) {
      const hasLiveShopProduct = (creator.subscribedProducts || []).some((p) =>
        LIVE_SHOP_PRODUCT_IDS.includes(p)
      );
      if (!hasLiveShopProduct) {
        return res.status(403).json({
          success: false,
          message: "Live shopping subscription is required to create products",
        });
      }
    }

    const productCount = await Product.countDocuments({ creatorId: creator._id });
    if (productCount >= 30) {
      return res.status(400).json({
        success: false,
        message: "You can add a maximum of 30 products",
      });
    }

    const imageKeys = [];
    if (req.files && req.files.length > 0) {
      for (const image of req.files) {
        const imageName = randomName();
        image.originalname = imageName;
        const key = await aws.uploadToAWS(image);
        imageKeys.push(key);
      }
    }

    const product = await Product.create({
      creatorId,
      title: title.trim(),
      description: description || "",
      price: Number(price),
      images: imageKeys,
      externalUrl: externalUrl || "",
    });

    const payload = await getSignedProduct(product);
    return res.status(201).json({ success: true, product: payload });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const getAllUserProducts = async (req, res) => {
  try {
    const { creatorId } = req.query;
    if (!creatorId || !mongoose.isValidObjectId(creatorId)) {
      return res.status(400).json({ success: false, message: "Valid creatorId is required" });
    }

    const { page, limit, skip } = parsePagination(req.query);
    const query = { creatorId };

    const total = await Product.countDocuments(query);
    const products = await Product.find(query)
      .populate("creatorId", "username firstname lastname profilePicture isVerified")
      .skip(skip)
      .limit(limit)
      .sort({ createdAt: -1 });

    const signed = await Promise.all(products.map((product) => getSignedProduct(product)));

    return res.status(200).json({
      success: true,
      count: total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
      products: signed,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const getAllProducts = async (req, res) => {
  try {
    const { page, limit, skip } = parsePagination(req.query);
    const filter = await buildProductFilters(req.query);
    const sort = parseSort(req.query);

    const total = await Product.countDocuments(filter);
    const products = await Product.find(filter)
      .populate("creatorId", "username firstname lastname profilePicture")
      .skip(skip)
      .limit(limit)
      .sort(sort);

    const signed = await Promise.all(products.map((product) => getSignedProduct(product)));

    return res.status(200).json({
      success: true,
      count: total,
      page,
      totalPages: Math.ceil(total / limit),
      limit,
      filtersApplied: filter,
      products: signed,
    });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const getProductById = async (req, res) => {
  try {
    const { productId } = req.params;
    const product = await Product.findById(productId).populate(
      "creatorId",
      "username firstname lastname profilePicture isVerified"
    );
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }

    const payload = await getSignedProduct(product);
    if (payload.creatorId?.profilePicture) {
      payload.creatorId.profilePicture = await aws.getLinkFromAWS(payload.creatorId.profilePicture);
    }
    return res.status(200).json({ success: true, product: payload });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const updateProduct = async (req, res) => {
  try {
    const { productId, creatorId, title, description, price, externalUrl, removeImages } = req.body;
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Valid productId is required" });
    }
    if (!creatorId || !mongoose.isValidObjectId(creatorId)) {
      return res.status(400).json({ success: false, message: "Valid creatorId is required" });
    }

    const creator = await User.findById(creatorId).select("isLive");
    if (!creator) {
      return res.status(404).json({ success: false, message: "Creator not found" });
    }
    if (isUserCurrentlyLive(creator)) {
      return res.status(403).json({
        success: false,
        message: "You cannot edit products while you are live",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    if (product.creatorId.toString() !== creatorId.toString()) {
      return res.status(403).json({ success: false, message: "Not allowed to update this product" });
    }

    const removeList = parseRemoveImages(removeImages);
    if (removeList.length > 0) {
      product.images = product.images.filter((img) => !removeList.includes(img));
      await Promise.all(
        removeList.map(async (key) => {
          if (!key) return;
          const cmd = new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key });
          await s3.send(cmd);
        })
      );
    }

    if (req.files && req.files.length > 0) {
      for (const image of req.files) {
        const imageName = randomName();
        image.originalname = imageName;
        const key = await aws.uploadToAWS(image);
        product.images.push(key);
      }
    }

    if (title !== undefined) product.title = title;
    if (description !== undefined) product.description = description;
    if (price !== undefined && price !== null && !Number.isNaN(Number(price))) {
      product.price = Number(price);
    }
    if (externalUrl !== undefined) product.externalUrl = externalUrl;

    await product.save();
    const updated = await Product.findById(product._id).populate(
      "creatorId",
      "username firstname lastname profilePicture isVerified"
    );
    const payload = await getSignedProduct(updated);
    if (payload.creatorId?.profilePicture) {
      payload.creatorId.profilePicture = await aws.getLinkFromAWS(payload.creatorId.profilePicture);
    }

    return res.status(200).json({ success: true, message: "Product updated", product: payload });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

const deleteProduct = async (req, res) => {
  try {
    const { productId, creatorId } = req.body;
    if (!productId || !mongoose.isValidObjectId(productId)) {
      return res.status(400).json({ success: false, message: "Valid productId is required" });
    }
    if (!creatorId || !mongoose.isValidObjectId(creatorId)) {
      return res.status(400).json({ success: false, message: "Valid creatorId is required" });
    }

    const creator = await User.findById(creatorId).select("isLive");
    if (!creator) {
      return res.status(404).json({ success: false, message: "Creator not found" });
    }
    if (isUserCurrentlyLive(creator)) {
      return res.status(403).json({
        success: false,
        message: "You cannot delete products while you are live",
      });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ success: false, message: "Product not found" });
    }
    if (product.creatorId.toString() !== creatorId.toString()) {
      return res.status(403).json({ success: false, message: "Not allowed to delete this product" });
    }

    await Promise.all(
      (product.images || []).map(async (key) => {
        if (!key) return;
        const cmd = new DeleteObjectCommand({ Bucket: process.env.BUCKET_NAME, Key: key });
        await s3.send(cmd);
      })
    );

    await Product.findByIdAndDelete(productId);
    return res.status(200).json({ success: true, message: "Product deleted" });
  } catch (error) {
    return res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  createProduct,
  getAllUserProducts,
  getAllProducts,
  getProductById,
  updateProduct,
  deleteProduct,
};
