const User = require("../models/userModel");
const Wallet = require("../models/walletModel");
const Otp = require("../models/otpModel");
const Verification = require("../models/verificationModel");
const nodemailer = require("nodemailer");
const twilio = require("twilio");
const smsOtp = require("../models/smsOtpModel");
const Admin = require("../models/adminModel");
const {aws, getNewUsername} = require("../helpers/otherHelpers.js")

const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const axios = require("axios");
const crypto = require("crypto");
const qs = require("querystring");
const BankAccount = require("../models/bankAccountModel");
const PaypalAccount = require("../models/paypalAccountModel");

const {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  CopyObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");

require("dotenv").config();

bucketName = process.env.BUCKET_NAME;
bucketRegion = process.env.BUCKET_REGION;
accessKey = process.env.ACCESS_KEY;
secretAccessKey = process.env.SECRET_ACCESS_KEY;

let client;
try {
  if (process.env.TWILIO_SID && process.env.TWILIO_SID.startsWith("AC") && process.env.TWILIO_AUTH_TOKEN) {
    client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);
  }
} catch (e) {
  console.warn("Twilio client initialization skipped:", e.message);
}
const s3 = new S3Client({
  credentials: {
    accessKeyId: accessKey,
    secretAccessKey: secretAccessKey,
  },
  region: bucketRegion,
});

const randomName = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

const godaddyEmail = process.env.EMAIL;
const godaddyPassword = process.env.PASSWORD;

const mailTransport = nodemailer.createTransport({
  host: "smtp.office365.com",
  port: 587,
  secure: false, // use STARTTLS
  auth: {
    user: godaddyEmail,
    pass: godaddyPassword,
  },
  tls: {
    ciphers: "SSLv3",
    rejectUnauthorized: false, // optional for some cases
  },
});
const createToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_String);
};
const togglePaymentVerified = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    user.paymentVerified = !user.paymentVerified;
    await user.save();
    res
      .status(200)
      .json({ message: "Payment verification status updated", user });
  } catch (error) {
    console.error("Error toggling paymentVerified:", error);
    res
      .status(500)
      .json({ error: "Failed to update payment verification status" });
  }
};
const getLamVerifyData = async (req, res) => {
  try {
    const verificationData = await Verification.find();
    if (!verificationData || verificationData.length === 0) {
      return res.status(404).json({ message: "No verification data found" });
    }
    res.status(200).json({ verificationData });
  } catch (error) {
    console.error("Error retrieving verification data:", error);
    res.status(500).json({ error: "Failed to retrieve verification data" });
  }
};
const getLamVerifyDataById = async (req, res) => {
  try {
    const { userid } = req.params;
    const verificationData = await Verification.find({ userid: userid });
    console.log("verificationData", verificationData);
    if (!verificationData || verificationData.length === 0) {
      return res
        .status(404)
        .json({ message: "No verification data found for this user" });
    }
    res.status(200).json({ verificationData });
  } catch (error) {
    console.error("Error retrieving verification data by userId:", error);
    res.status(500).json({ error: "Failed to retrieve verification data" });
  }
};
const VerifyUser = async (req, res) => {
  try {
    var { userid } = req.body;
    var user = await User.findById(userid);
    if (!user) {
      throw Error("User not found");
    }
    const response = await axios.post(
      `https://api.lemverify.io/api/v1/${process.env.LEM_VERIFY_ID}/combination`,
      {
        clientRef: userid,
        sendEmail: user.email,
      },
      {
        headers: {
          "Content-Type": "application/json",
          "x-lem-key": process.env.LEM_VERIFY_KEY,
        },
      }
    );

    var result = response.data;
    var dataRes = {
      userid,
      lemid: result.id,
      friendlyId: result.friendlyId,
      url: result.url,
      deliveryMethods: result.deliveryMethods,
    };
    await Verification.create(dataRes);
    console.log("send successfully:", response.data);
    res.status(200).json(dataRes);
  } catch (error) {
    console.error("Error sending message:", error);
  }
};
const loginUser = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      throw Error("All Fields must be filled");
    }
    const user = await User.findOne({ email });

    if (!user) {
      throw Error("User Not Found");
    }

    if (!user.password) {
      throw Error("Cannot Login Social Users");
    }

    const token = createToken(user._id);
    const match = await bcrypt.compare(password, user.password);
    if (!match) {
      throw Error("Incorrect Password");
    }

    const userObject = user.toObject();
    delete userObject.password;
    if(userObject.bankAccount){
      userObject.bankAccount = await BankAccount.findById(userObject.bankAccount);
    }else{
      userObject["bankAccount"] = null
    }
    if(userObject.paypalAccount){
      userObject.paypalAccount = await PaypalAccount.findById(userObject.paypalAccount);
    }else{
      userObject["paypalAccount"] = null
    }
    let url = "";
console.log("url:", url);
    if (user.profilePicture != "") {
      url = await aws.getLinkFromAWS(user.profilePicture)
    }
console.log("url:", url);

    userObject["profilePicture"] = url;
    res.status(200).json({ user: userObject, token, url });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const appleLogin = async (req, res) => {
  const { firstname, lastname, email, appleId, address } = req.body;

  try {
    // Check if the user already exists with the provided Apple ID
    const existingUser = await User.findOne({ appleId });

    if (!existingUser) {
      // If user doesn't exist, check if email is provided
      // if (!email) {
      //   throw new Error("Email is required for new user signup");
      // }

      // Check if email already exists
      // const existsEmail = await User.findOne({ email });
      // if (existsEmail) {
      //   throw new Error("Email already in use");
      // }
      var username = await getNewUsername((firstname && firstname.trim() != "" && lastname && lastname.trim() != "") ? firstname+lastname : "") 
      var tag = username.trim().split(" ").join("");
      const newUser = await User.create({
        firstname,
        lastname,
        username,
        appleId,
        email,
        tag,
        loginFrom: "Apple",
        address,
        app_user_id: username,
        onboarding: { active: true },
      });

      var wallet = await Wallet.create({ userid: newUser._id });
      await newUser.updateOne({
        walletid: wallet._id,
      });

      const token = createToken(newUser._id); // Create token for new user

      return res.status(200).json({
        message: "SignUp Successful",
        user: newUser, // Send newly created user details
        token: token, // Send token
      });
    } else {
      // if(existingUser.loginFrom != "Apple"){
      //   res.status(400).json({
      //     message: "Email is already in use with another account"
      //   })
      //   return;
      // }
      // User exists, directly log in and return user details
      const token = createToken(existingUser._id); // Create token for existing user

      return res.status(200).json({
        message: "Login Successful",
        user: existingUser,
        token: token, // Send token
      });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const twitterLogin = async (req, res) => {
  const { twitterId, picUrl, address } = req.body;

  try {
    // Check if the user already exists with the provided Apple ID
    const existingUser = await User.findOne({ twitterId });

    if (!existingUser) {
      const response = await axios.get(picUrl, { responseType: "arraybuffer" });
      contentName = randomName();
      const params = {
        Bucket: bucketName,
        Key: contentName,
        Body: response.data,
        ContentType: response.headers["content-type"],
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      
      var username = await getNewUsername("user")
      var tag = username.trim().split(" ").join("");
      const newUser = await User.create({
        firstname: username,
        username,
        twitterId,
        profilePicture: contentName,
        loginFrom: "Twitter",
        address,
        tag,
        app_user_id: username,
        onboarding: { active: true },
      });

      const token = createToken(newUser._id); // Create token for new user

      return res.status(200).json({
        message: "SignUp Successful",
        user: newUser, // Send newly created user details
        token: token, // Send token
      });
    } else {
      // if(existingUser.loginFrom != "Twitter"){
      //   res.status(400).json({
      //     message: "Email is already in use with another account"
      //   })
      //   return;
      // }
      // User exists, directly log in and return user details
      const token = createToken(existingUser._id); // Create token for existing user

      return res.status(200).json({
        message: "Login Successful",
        user: existingUser,
        token: token, // Send token
      });
    }
  } catch (error) {
    return res.status(400).json({ error: error.message });
  }
};
const googleLogin = async (req, res) => {
  try {
    const { name, email, picUrl, address } = req.body;
    const existingUser = await User.findOne({ email });
    if (!existingUser) {
      const response = await axios.get(picUrl, { responseType: "arraybuffer" });
      contentName = randomName();
      const params = {
        Bucket: bucketName,
        Key: contentName,
        Body: response.data,
        ContentType: response.headers["content-type"],
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      
      var username = await getNewUsername(name) 
      var tag = username.trim().split(" ").join("");
      let user = await User.create({
        firstname: name,
        lastname: "",
        email,
        username,
        tag,
        profilePicture: contentName,
        loginFrom: "Google",
        address,
        app_user_id: username,
        onboarding: { active: true },
      });
      const wallet = await Wallet.create({ userid: user._id });
      await user.updateOne({
        walletid: wallet._id
      });
      user = await User.findById(user._id);
      const token = createToken(user._id);
      const userObject = user.toObject();
      delete userObject.password;

      let url = "";

      if (user.profilePicture != "") {
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.profilePicture,
        };

        const command = new GetObjectCommand(getObjectParams);
        url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      }
      res.status(200).json({ user: userObject, token, url });
    } else {
      const user = await User.findOne({ email });
      // if(existingUser.loginFrom != "Google"){
      //   res.status(400).json({
      //     message: "Email is already in use with another account"
      //   })
      //   return;
      // }
      const token = createToken(user._id);
      const userObject = user.toObject();
      delete userObject.password;

      let url = "";

      if (user.profilePicture != "") {
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.profilePicture,
        };

        const command = new GetObjectCommand(getObjectParams);
        url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      }

      res.status(200).json({ user: userObject, token, url });
    }
  } catch (error) {
    console.log(error);
    res.status(400).json({ error: error.message });
  }
};
const linkedInLogin = async (req, res) => {
  res.redirect(
    encodeURI(
      `https://www.linkedin.com/oauth/v2/authorization?client_id=${process.env.CLIENT_ID}&response_type=code&scope=${process.env.SCOPE}&redirect_uri=${process.env.REDIRECT_URI}`
    )
  );
};
const signupAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      throw new Error("All fields must be filled");
    }
    const existingAdmin = await Admin.findOne({ email });
    if (existingAdmin) {
      throw new Error("Admin already exists");
    }
    const hashedPassword = await bcrypt.hash(password, 10);
    res.status(201).json({
      message: "Admin signup successful.",
      hash: hashedPassword
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const loginAdmin = async (req, res) => {
  const { email, password } = req.body;
  try {
    if (!email || !password) {
      res.status(400).json({
        success: false,
        message: "Incorect email or password."
      });
      return;
    }
    let admin = await Admin.findOne({ email });
    if (!admin) {
      res.status(400).json({
        success: false,
        message: "Incorect email or password."
      });
      return;
    } else {
      const match = await bcrypt.compare(password, admin.password);
      if (!match) {
        res.status(400).json({
          success: false,
          message: "Incorect email or password."
        });
        return;
      }else{
        const token = createToken(admin._id);
        res.status(200).json({
          success: true,
          message: "Admin logged in successfully.",
          adminId: admin._id,
          token
        });
      }
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
const signupUser = async (req, res) => {
  const { firstname, lastname, email, password, address, dob, ipAddress } = req.body;

  console.log("data: ", req.body);
  try {
    const existsEmail = await User.findOne({ email });

    if (existsEmail) {
      throw Error("Email already in use");
    }

    const salt = await bcrypt.genSalt(10);
    const hashed = await bcrypt.hash(password, salt);

    const otp = OTP();
    const otpDoc = await Otp.findOne({ email });
    if (otpDoc) {
      await otpDoc.deleteOne();
    }
    await Otp.create({
      email,
      firstname,
      lastname,
      password: hashed,
      otp,
      address,
      dob,
      ipAddress
    });

    await sendMail(otp, firstname, lastname, email);

    res.status(200).json({
      message: "SignUp Pending. OTP Sent",
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
// const sendVerifySms = async (req, res) => {
//   const { phone, userid, dob } = req.body;
//   if (!phone || phone.trim() == "" || !dob || dob.trim() == "") {
//     res.status(400).json({
//       success: false,
//       message: "Please enter Phone number and Date of Birth!",
//     });
//     throw Error("Please enter Phone number and Date of Birth!");
//   }
//   var phoneExist = false;
//   var phoneQuery = await User.findOne({ phone });
//   if (phoneQuery) {
//     phoneExist = true;
//   }
//   phoneQuery = await smsOtp.findOne({ phone });
//   if (phoneQuery) {
//     phoneExist = true;
//   }
//   if (phoneExist) {
//     res.status(400).json({
//       success: false,
//       message: "This phone number is already linked with other account!",
//     });
//     throw Error("This phone number is already linked with other account!");
//   }
//   var otp = OTP();
//   var body = `Your Frenzone verification code is ${otp}`;
//   const message = await client.messages.create({
//     body: body,
//     from: process.env.TWILIO_PHONE_NUMBER,
//     to: phone,
//   });
//   if (message.body.error_code != null) {
//     res.status(400).json({
//       success: false,
//       message: message.body.error_message,
//     });
//     throw Error("Error sending message: " + message.body.error_message);
//   }
//   var smsOtpExist = await smsOtp.findOne({ userid });
//   if (smsOtpExist) {
//     await smsOtpExist.updateOne({ phone, otp, dob });
//   } else {
//     await smsOtp.create({ phone, otp, dob, userid });
//   }

//   res.status(200).json({
//     success: true,
//     message: "Sms otp verification pending",
//   });
// };
const sendVerifySms = async (req, res) => {
  const { phone, userid, dob } = req.body;

  var user = await User.findById(userid);
  if (!user) {
    res.status(400).json({
      success: false,
      message: "User not found!",
    });
    return;
  }

  if (!dob || dob.trim() == "") {
    res.status(400).json({
      success: false,
      message: "Please enter Date of Birth!",
    });
    return;
  }
  await user.updateOne({ phone, dob });
  res.status(200).json({
    success: true,
    message: "data updated",
  });
};
const VerifySmsOtp = async (req, res) => {
  try {
    var { phone, otp, userid } = req.body;
    var user = await User.findById(userid);
    if (!user) {
      res.status(400).json({
        success: false,
        message: "User not found!",
      });
      return;
    }
    otp = parseInt(otp);
    var smsOtpExist = await smsOtp.findOne({ userid, phone, otp });
    if (smsOtpExist) {
      res.status(200).json({
        success: true,
        correctOtp: true,
      });
      var dob = smsOtpExist.dob;
      await user.updateOne({ phone, dob });
      await smsOtpExist.deleteOne();
    } else {
      res.status(200).json({
        success: true,
        correctOtp: false,
      });
    }
  } catch (err) {
    res.status(400).json({
      success: false,
      message: err.message,
    });
    throw Error(err.message);
  }
};
const verifyOTP = async (req, res) => {
  try {
    const email = req.body.email;
    let otp = req.body.otp;
    otp = parseInt(otp, 10);
    const otpDoc = await Otp.findOne({ email });
    console.log(otpDoc);
    console.log(otp);

    if (otpDoc.otp == otp) {
      const firstname = otpDoc.firstname;
      const lastname = otpDoc.lastname;
      const password = otpDoc.password;
      const address = otpDoc.address;
      const dob = otpDoc.dob;
      const ipAddress = otpDoc.ipAddress;
      var username = await getNewUsername(firstname+lastname);
      var tag = username.trim().split(" ").join("");
      const user = await User.create({
        username,
        firstname,
        lastname,
        email,
        password,
        tag,
        loginFrom: "Email",
        address,
        dob,
        ipAddress,
        app_user_id: username,
        onboarding: { active: true },
      });
      const wallet = await Wallet.create({ userid: user._id });
      await user.updateOne({
        walletid: wallet._id,
      });
      await otpDoc.deleteOne();
      res.status(200).json({
        message: "Sign Up Successfull",
      });
    } else {
      throw Error("Otp Verification Failed");
    }
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
};
function OTP() {
  const min = 1000; // Minimum 4-digit number
  const max = 9999; // Maximum 4-digit number
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
const setFcmToken = async (req, res) => {
  try {
    const { userid, fcmtoken } = req.body;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    await user.updateOne({
      fcmtoken: [fcmtoken],
    });

    res.status(200).json({
      message: "Token Added",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const deleteFcmToken = async (req, res) => {
  try {
    const { userid, fcmtoken } = req.body;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    if (user.fcmtoken.includes(fcmtoken)) {
      await user.updateOne({
        $pull: { fcmtoken },
      });
    }

    res.status(200).json({
      message: "Token Deleted",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
function generateUsername(name) {
  const formattedName = name.replace(/\s/g, "").toLowerCase();
  const randomNumber = generateRandomNumber(1000, 9999); // Generate a 4-digit random number
  const username = formattedName + randomNumber;

  return username;
}
function generateRandomNumber(min, max) {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
const Redirect = async (req, res) => {
  try {
    const code = req.query.code;
    const payload = {
      client_id: process.env.CLIENT_ID,
      client_secret: process.env.CLIENT_SECRET,
      redirect_uri: process.env.REDIRECT_URI,
      grant_type: "authorization_code",
      code: code,
    };
    let data;
    let response1 = await axios({
      url: `https://www.linkedin.com/oauth/v2/accessToken?${qs.stringify(
        payload
      )}`,
      method: "POST",
      headers: {
        "Content-Type": "x-www-form-urlencoded",
      },
    });
    data = response1.data;
    const accessToken = data.access_token;

    let response2 = await axios({
      url: "https://api.linkedin.com/v2/userinfo",
      method: "GET",
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    const userData = response2.data;

    const name = userData.name;
    const email = userData.email;
    const picUrl = userData.picture;
    const firstname = userData.given_name;
    const lastname = userData.family_name;

    const userExists = await User.findOne({ email });

    if (!userExists) {
      const response = await axios.get(picUrl, { responseType: "arraybuffer" });
      contentName = randomName();
      const params = {
        Bucket: bucketName,
        Key: contentName,
        Body: response.data,
        ContentType: response.headers["content-type"],
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      
      var username = await getNewUsername(name) 
      var tag = username.trim().split(" ").join("");
      let user = await User.create({
        firstname: firstname,
        lastname: lastname,
        email,
        username,
        profilePicture: contentName,
        tag,
        loginFrom: "Linkdin",
        app_user_id: username,
        onboarding: { active: true },
      });
      const wallet = await Wallet.create({ userid: user._id });
      await user.updateOne({
        walletid: wallet._id,
      });
      user = await User.findById(user._id);
      const token = createToken(user._id);
      const userObject = user.toObject();
      delete userObject.password;

      let url = "";

      if (user.profilePicture != "") {
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.profilePicture,
        };

        const command = new GetObjectCommand(getObjectParams);
        url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      }
      res.status(200).json({ user: userObject, token, url });
    } else {
      const user = await User.findOne({ email });
      existingUser.loginFrom = "Linkdin"; // Update the loginFrom field
      await existingUser.save();
      const token = createToken(user._id);
      const userObject = user.toObject();
      delete userObject.password;

      let url = "";

      if (user.profilePicture != "") {
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.profilePicture,
        };

        const command = new GetObjectCommand(getObjectParams);
        url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      }

      res.status(200).json({ user: userObject, token, url });
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const linkedinSignup = async (req, res) => {
  try {
    var userData = req.body
    const name = userData.name;
    const email = userData.email;
    const picUrl = userData.picture;
    const firstname = userData.given_name;
    const lastname = userData.family_name;
    const address = userData.address;

    const userExists = await User.findOne({ email });

    if (!userExists) {
      const response = await axios.get(picUrl, { responseType: "arraybuffer" });
      contentName = randomName();
      const params = {
        Bucket: bucketName,
        Key: contentName,
        Body: response.data,
        ContentType: response.headers["content-type"],
      };
      const command = new PutObjectCommand(params);
      await s3.send(command);

      
      var username = await getNewUsername(name) 
      var tag = username.trim().split(" ").join("");
      let user = await User.create({
        firstname: firstname,
        lastname: lastname,
        email,
        username,
        profilePicture: contentName,
        tag,
        loginFrom: "Linkdin",
        address,
        app_user_id: username,
        onboarding: { active: true },
      });
      const wallet = await Wallet.create({ userid: user._id });
      await user.updateOne({
        walletid: wallet._id,
      });
      user = await User.findById(user._id);
      const token = createToken(user._id);
      const userObject = user.toObject();
      delete userObject.password;

      let url = "";

      if (user.profilePicture != "") {
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.profilePicture,
        };

        const command = new GetObjectCommand(getObjectParams);
        url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      }
      res.status(200).json({ user: userObject, token, url });
    } else {
      const user = await User.findOne({ email });
      // if(user.loginFrom != "Linkdin"){
      //   res.status(400).json({
      //     message: "Email is already in use with another account"
      //   })
      //   return;
      // }
      const token = createToken(user._id);
      const userObject = user.toObject();
      delete userObject.password;

      let url = "";

      if (user.profilePicture != "") {
        const getObjectParams = {
          Bucket: bucketName,
          Key: user.profilePicture,
        };

        const command = new GetObjectCommand(getObjectParams);
        url = await getSignedUrl(s3, command, { expiresIn: "604800" });
      }

      res.status(200).json({ user: userObject, token, url });
    }
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
async function sendMail(otp, firstname, lastname, email) {
  try {
    const mailOptions = {
      from: godaddyEmail,
      to: email,
      subject: "Frenzone OTP for SignUp",
      text: `Dear ${firstname + " " + lastname},
            
Your One-Time Password (OTP) for SignUp is ${otp}. Do not share with anyone.
          
Team Frenzone`,
    };

    await mailTransport.sendMail(mailOptions);
  } catch (err) {
    console.error(err);
  }
}
const VerifyUserResult = async (req, res) => {
  console.log(req.body);
  res.send("ok");
};
module.exports = {
  appleLogin,
  signupUser,
  setFcmToken,
  deleteFcmToken,
  loginUser,
  verifyOTP,
  googleLogin,
  linkedInLogin,
  Redirect,
  VerifyUserResult,
  VerifyUser,
  twitterLogin,
  sendVerifySms,
  VerifySmsOtp,
  signupAdmin,
  loginAdmin,
  getLamVerifyData,
  togglePaymentVerified,
  getLamVerifyDataById,
  linkedinSignup
};
