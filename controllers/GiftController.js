const Gift = require("../models/giftModel");
const sharp  = require("sharp")
const fs = require("fs")
const path = require("path")
const gifFrames = require('gif-frames');
const {aws} = require("../helpers/otherHelpers");


function streamToBuffer(stream) {
  return new Promise((resolve, reject) => {
      const chunks = [];
      stream.on('data', chunk => chunks.push(chunk));
      stream.on('end', () => resolve(Buffer.concat(chunks)));
      stream.on('error', reject);
  });
}

const getGiftName = (gift) => {
  return String(gift.name || gift.giftName || gift.gift_name || gift.title || gift.label || "Gift").trim();
};

const createGift = async (req, res) => {
  try {
    let { price, name = "" } = req.body;
    price = parseInt(price, 10);

    if (!req.file || !price) {
      throw new Error("Image and price are required.");
    }

    var gif = await aws.uploadToAWS(req.file);

    var gifBuffer = req.file.buffer;
    const frames = await gifFrames({ url: gifBuffer, frames: 'all', outputType: 'png' });

    const middleFrameIndex = Math.floor(frames.length / 2);

    const middleFrame = frames[middleFrameIndex].getImage();

    const middleFrameBuffer = await streamToBuffer(middleFrame);
    var thumbnail = await sharp(middleFrameBuffer).resize(300, 300).png().toBuffer();
  
    var thumbnailFie = {
      buffer: thumbnail,
      mimetype: 'image/png'
    }
    
    thumbnail = await aws.uploadToAWS(thumbnailFie);

    const newGift = await Gift.create({
      name: name.trim(),
      price,
      gif,
      thumbnail
    });

    res.status(200).json({
      message: "Gift created successfully",
      gift: newGift,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const createGiftFile = async (req, res) => {
  try {
    let { price, name = "", isSvga = false } = req.body;
    price = parseInt(price, 10);

    if (!req.files["thumbnail"] || !req.files["giftFile"] || !price) {
      throw new Error("Gift File, thumbnail and price are required.");
    }

    var giftFile = await aws.uploadToAWS(req.files["giftFile"][0]);

    var thumbnail = await aws.uploadToAWS(req.files["thumbnail"][0]);

    const newGift = await Gift.create({
      name: name.trim(),
      price,
      giftFile,
      thumbnail,
      isSvga
    });

    res.status(200).json({
      message: "Gift created successfully",
      gift: newGift,
    });
  } catch (error) {
    console.log("error: ", error)
    res.status(400).json({
      error: error.message,
    });
  }
};

const uploadBulkGift = async (req, res) => {
  try {
    const parentDir = 'C:/Users/khawa/Downloads/Gifts/Gifts'; 
    const folders = fs.readdirSync(parentDir).filter(folder => fs.statSync(path.join(parentDir, folder)).isDirectory());

    for (const folder of folders) {
      const folderPath = path.join(parentDir, folder);
      const images = fs.readdirSync(folderPath).filter(file => /\.(jpg|jpeg|png|gif)$/i.test(file)); // Filter for image files

      for (const image of images) {
        const imagePath = path.join(folderPath, image);
        price = parseInt(folder);

        var gifFile = {
          buffer: fs.readFileSync(imagePath),
          mimetype: 'image/gif'
        }
        var gif = await aws.uploadToAWS(gifFile);

        const frames = await gifFrames({ url: imagePath, frames: 'all', outputType: 'png' });

        const middleFrameIndex = Math.floor(frames.length / 2);

        const middleFrame = frames[middleFrameIndex].getImage();

        const middleFrameBuffer = await streamToBuffer(middleFrame);

        var thumbnail = await sharp(middleFrameBuffer).resize(300, 300).png().toBuffer();
      
        var thumbnailFie = {
          buffer: thumbnail,
          mimetype: 'image/png'
        }
        thumbnail = await aws.uploadToAWS(thumbnailFie);

        const newGift = await Gift.create({
          name: path.parse(image).name,
          price,
          gif,
          thumbnail
        });
      }
    }






    

    res.status(200).json({
      message: "Gift created successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const emptyGifts = async (req, res) => {
  try {
    var gifts = await Gift.find({});
    await Promise.all(
      gifts.map(async gift => {
        await Gift.deleteOne({_id: gift._id});
      })
    )
    res.status(200).json({
      message: "Gifts deleted successfully"
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
}
const getAllGifts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const totalGifts = await Gift.countDocuments();
    const gifts = await Gift.find().skip(skip).limit(limit).lean();
    var giftsUpdated = [];
    await Promise.all(
      gifts.map(async gift => {
        var newGift = {};
        if (gift.isSvga) {
          newGift.name = getGiftName(gift);
          newGift.giftName = newGift.name;
          newGift.price = gift.price;
          newGift.id = gift._id;
          newGift.isSvga = gift.isSvga ?? false;
          newGift.thumbnail = await aws.getLinkFromAWS(gift.thumbnail);

          if (!gift.giftFile || gift.giftFile.trim() === "") {
            newGift.giftFile = await aws.getLinkFromAWS(gift.gif || "");
          } else {
            newGift.giftFile = await aws.getLinkFromAWS(gift.giftFile);
          }

          newGift.gif = gift.gif ? await aws.getLinkFromAWS(gift.gif) : "";
          newGift.isExclusive = gift.isExclusive ?? false;
          giftsUpdated.push(newGift);
        }
      })
    )
    res.status(200).json({
      message: "All gifts retrieved successfully",
      gifts: giftsUpdated,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalGifts / limit),
        totalItems: totalGifts,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllNewGifts = async (req, res) => {
  try {
    const page = parseInt(req.query.page, 10) || 1;
    const limit = parseInt(req.query.limit, 10) || 10;
    const skip = (page - 1) * limit;
    const totalGifts = await Gift.countDocuments();
    const gifts = await Gift.find().skip(skip).limit(limit).lean();
    var giftsUpdated = [];
    await Promise.all(
      gifts.map(async gift => {
        var newGift = {};
        if(gift.thumbnail && (gift.giftFile || gift.gif)){
          newGift.name = getGiftName(gift);
          newGift.giftName = newGift.name;
          newGift.price = gift.price;
          newGift.id = gift._id;
          if(!gift.giftFile || gift.giftFile.trim() == ""){
            newGift.giftFile = await aws.getLinkFromAWS(gift.gif)
            newGift.isSvga = false;
          }else{
            newGift.isSvga = gift.isSvga;
            newGift.giftFile = await aws.getLinkFromAWS(gift.giftFile)
          }
          newGift.thumbnail = await aws.getLinkFromAWS(gift.thumbnail)
          giftsUpdated.push(newGift);
        }
      })
    )
    res.status(200).json({
      message: "All gifts retrieved successfully",
      gifts: giftsUpdated,
      pagination: {
        currentPage: page,
        totalPages: Math.ceil(totalGifts / limit),
        totalItems: totalGifts,
        itemsPerPage: limit,
      },
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getGiftImageUrl = async (imageId) => {
  try {
    const getObjectParams = {
      Bucket: bucketName,
      Key: imageId,
    };
    const command = new GetObjectCommand(getObjectParams);
    const imageUrl = await getSignedUrl(s3, command, { expiresIn: "604800" });
    return imageUrl;
  } catch (error) {
    throw error.message;
  }
};

module.exports = {
  getAllGifts,
  createGift,
  uploadBulkGift,
  emptyGifts,
  getAllNewGifts,
  createGiftFile
};
