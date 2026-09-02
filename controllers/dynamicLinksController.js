require("dotenv").config();

const axios = require('axios');

const createDynamicLink = async (req, res) => {
  const {link} = req.body;
  const apiKey = process.env.FIREBASE_WEB_API_KEY; // Get this from your Firebase project settings
  const dynamicLinkDomain = process.env.FIREBASE_BASE_URL; // Your Dynamic Links domain

  const requestBody = {
    dynamicLinkInfo: {
      domainUriPrefix: dynamicLinkDomain,
      link: link,
      androidInfo: {
        androidPackageName: 'com.sheesX.Frenzone', // Your Android package name
      },
      iosInfo: {
        iosBundleId: 'app.Frenzone.sheesX',
      }
    },
    suffix: {
      option: 'SHORT' // You can also use 'UNGUESSABLE'
    }
  };

  try {
    const response = await axios.post(`https://firebasedynamiclinks.googleapis.com/v1/shortLinks?key=${apiKey}`, requestBody);
    res.status(200).json({shortLink: response.data.shortLink});
  } catch (error) {
    console.error('Error creating dynamic link:', error);
    throw error;
  }
};


module.exports = {
  createDynamicLink
};
