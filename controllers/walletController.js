const Wallet = require("../models/walletModel");
const Withdraw = require("../models/withdrawModel");
const Admin = require("../models/adminModel");
const User = require("../models/userModel");
const Transaction = require("../models/transactionModel");
const { sendNotification } = require("../controllers/notificationController");
const { createActivity } = require("../controllers/activityController");
const { createTransaction } = require('./globalTransactionController');
const cron = require('node-cron');
require("dotenv").config();

const paypal = require("@paypal/checkout-server-sdk");
const Environment =
  process.env.NODE_ENV === "production"
    ? paypal.core.LiveEnvironment
    : paypal.core.SandboxEnvironment;
const paypalClient = new paypal.core.PayPalHttpClient(
  new Environment(
    process.env.PAYPAL_CLIENT_ID,
    process.env.PAYPAL_CLIENT_SECRET
  )
);
const getWithdrawByWithdrawId = async (req, res) => {
  const { withdrawalId } = req.params;
  try {
    const withdrawal = await Withdraw.findById(withdrawalId).populate({
      path: 'userId',
      select: 'username firstname lastname profilePicture'
    });
    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal not found" });
    }

    withdrawal.userId.profilePicture = await aws.getLinkFromAWS(withdrawal.userId.profilePicture);

    return res.status(200).json(withdrawal);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
const getWithdrawById = async (req, res) => {
  const { userId } = req.params;
  try {
    const withdrawals = await Withdraw.find({ userId });
    if (!withdrawals || withdrawals.length === 0) {
      return res
        .status(404)
        .json({ message: "No withdrawals found for this user" });
    }
    return res.status(200).json(withdrawals);
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
const setWithdrawStatus = async (req, res) => {
  const { withdrawId, status } = req.body;
  try {
    const withdrawal = await Withdraw.findById(withdrawId);
    if (!withdrawal) {
      return res.status(404).json({ message: "Withdrawal request not found" });
    }
    withdrawal.status = status;
    await withdrawal.save();
    return res
      .status(200)
      .json({ message: "Withdrawal status updated successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
// const withdrawRequest = async (req, res) => {
//   const { userId, amount } = req.body;
//   try {
//     const user = await User.findById(userId);
//     if (!user) {
//       return res.status(404).json({ message: "User not found" });
//     }
//     const wallet = await Wallet.findOne({ userid: user._id });
//     console.log(wallet, "wallet");
//     if (!wallet || wallet.currentAmount < amount) {
//       return res.status(400).json({ message: "Insufficient balance" });
//     }
//     const newWithdraw = new Withdraw({
//       userId,
//       amount,
//     });
//     await newWithdraw.save();
//     wallet.currentAmount -= amount;
//     await wallet.save();
//     return res
//       .status(200)
//       .json({ message: "Withdrawal request submitted successfully" });
//   } catch (error) {
//     return res
//       .status(500)
//       .json({ message: "Server error", error: error.message });
//   }
// };

const withdrawRequest = async (req, res) => {
  const { userId, amount } = req.body;
  try {
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    const wallet = await Wallet.findOne({ userid: user._id });
    console.log(wallet, "wallet");
    if (!wallet || wallet.diamonds < amount) {
      return res.status(400).json({ message: "Insufficient balance" });
    }
    const newWithdraw = new Withdraw({
      userId,
      amount,
    });
    await newWithdraw.save();
    wallet.diamonds -= amount;
    await wallet.save();

    await createTransaction({
      creator_id: userId,
      type: 'withdrawal',
      amount: -amount, // Negative for outflow
      status: 'pending'
    });

    return res
      .status(200)
      .json({ message: "Withdrawal request submitted successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};
const getWalletAmount = async (req, res) => {
  try {
    const { userId } = req.params;
    const wallet = await Wallet.findOne({ userid: userId });
    if (!wallet) {
      return res.status(404).json({ error: "Wallet not found" });
    }
    res.status(200).json({
      currentAmount: wallet.currentAmount,
      earnedAmount: wallet.earnedAmount,
      boughtAmount: wallet.boughtAmount,
      diamonds: wallet.diamonds,
      coins: wallet.coins,
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
};
const sendCoins = async (req, res) => {
  try {
    const currentUserId = req.body.currentUserId;
    const usedToSendId = req.body.usedToSendId;
    let coinAmount = req.body.coinAmount;
    coinAmount = parseInt(coinAmount, 10);
    if (typeof coinAmount == "string") {
      coinAmount = parseInt(coinAmount);
    }
    var mainAdmin = await Admin.findOne({ mainAdmin: true });
    // var amount = coinAmount * mainAdmin.coinEquivalence;
    var amount = coinAmount
    const sentAmount = amount;
    console.log("mainadmin: ", mainAdmin);

    const currentUser = await User.findById(currentUserId);
    const userToSend = await User.findById(usedToSendId);

    if (!currentUser) {
      throw Error("Sender Not Found");
    }
    if (!userToSend) {
      throw Error("Receiver Not Found");
    }

    const currentWallet = await Wallet.findById(currentUser.walletid);
    if (currentWallet.coins < coinAmount) {
      res.status(400).json({
        success: false,
        message: "Insufficient balance",
      });
      return;
    }
    const userToSendWallet = await Wallet.findById(userToSend.walletid);
    console.log("uuser to send wlalet: ", userToSendWallet);

    amount = amount * ((100 - 30) / 100);
    // var coin70 = coinAmount * ((100 - 30) / 100);
    console.log("70%: ", amount);

    var shareAmount = amount;
    console.log("amount: ", amount);
    console.log("shareAmoutn: ", shareAmount);
    console.log("adminShare: ", mainAdmin.adminShare);
    var userShare = amount * ((100 - mainAdmin.adminShare) / 100);
    // var userCoinShare = coin70 * ((100 - mainAdmin.adminShare) / 100)
    console.log("40% of 70%: ", userShare);
    // var adminShare = (shareAmount - userShare) * mainAdmin.coinEquivalence;
    var adminShare = (shareAmount - userShare)
    console.log("30% of 70%: ", adminShare);

    var adminWallet = await Wallet.findById(mainAdmin.walletid);
    console.log("admin wallet: ", adminWallet);
    await adminWallet.updateOne({
      currentAmount: adminWallet.currentAmount + adminShare,
      earnedAmount: adminWallet.earnedAmount + adminShare,
    });

    var diamonds = userToSendWallet.diamonds + userShare;
    await userToSendWallet.updateOne({
      diamonds,
    });

    var coins = currentWallet.coins - coinAmount;
    await currentWallet.updateOne({
      coins,
    });

    var sockets = global.onlineSockets.get(currentUserId.toString());

    if (sockets) {
      for (const socket of sockets) {
        if (socket) {
          socket.emit("walletChange", {
            userid: currentUserId,
            diamonds: userToSend.diamonds,
            coins: userToSend.coins,
          });
        }
      }
    }

    await sendNotification(
      usedToSendId.toString(),
      currentUser.firstname + " " + currentUser.lastname,
      `Sent you coins`,
      "wallet",
      usedToSendId
    );

    await createActivity(
      usedToSendId,
      currentUserId,
      `Sent you coins`,
      null,
      null,
      null,
      null,
      null,
      true
    );

    await Transaction.create({
      senderid: currentUserId,
      receiverid: usedToSendId,
      amount: coinAmount,
    });

    await createTransaction({
      user_id: currentUserId,
      creator_id: usedToSendId,
      type: 'tip',
      amount: coinAmount,
      platform_fee: adminShare,
      net_creator_amount: userShare,
      status: 'completed'
    });

    res.status(200).json({
      message: "Amount Sent",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const sendCashTips = async (req, res) => {
  try {
    const currentUserId = req.body.currentUserId;
    const usedToSendId = req.body.usedToSendId;
    let coinAmount = req.body.coinAmount;
    coinAmount = parseInt(coinAmount, 10);
    if (typeof coinAmount == "string") {
      coinAmount = parseInt(coinAmount);
    }
    var mainAdmin = await Admin.findOne({ mainAdmin: true });
    // var amount = coinAmount * mainAdmin.coinEquivalence;
    var amount = coinAmount
    const sentAmount = amount;
    console.log("mainadmin: ", mainAdmin);

    const currentUser = await User.findById(currentUserId);
    const userToSend = await User.findById(usedToSendId);

    if (!currentUser) {
      throw Error("Sender Not Found");
    }
    if (!userToSend) {
      throw Error("Receiver Not Found");
    }

    // const currentWallet = await Wallet.findById(currentUser.walletid);
    // if (currentWallet.coins < coinAmount) {
    //   res.status(400).json({
    //     success: false,
    //     message: "Insufficient balance",
    //   });
    //   return;
    // }
    const userToSendWallet = await Wallet.findById(userToSend.walletid);

    // var feeCut = amount * ((100 - 70) / 100);
    amount = amount * ((100 - 30) / 100);
    // var coin70 = coinAmount

    var shareAmount = amount;
    var userShare = amount * ((100 - mainAdmin.adminShare) / 100);
    // var userCoinShare = coin70 * ((100 - mainAdmin.adminShare) / 100)
    // var adminShare = (shareAmount - userShare) * mainAdmin.coinEquivalence;
    var adminShare = (shareAmount - userShare)

    var adminWallet = await Wallet.findById(mainAdmin.walletid);
    await adminWallet.updateOne({
      currentAmount: adminWallet.currentAmount + adminShare,
      earnedAmount: adminWallet.earnedAmount + adminShare,
    });

    var diamonds = userToSendWallet.diamonds + userShare;
    await userToSendWallet.updateOne({
      diamonds,
    });


    await transactionHistoryModel.create({
      userid: currentUserId,
      amount,
      fee: 0,
      adminShare,
      userGot: userShare,
      transactionType: "SendTip"
    })


    // var coins = currentWallet.coins - coinAmount;
    // await currentWallet.updateOne({
    //   coins,
    // });

    // var sockets = global.onlineSockets.get(currentUserId.toString());

    // if (sockets) {
    //   for (const socket of sockets) {
    //     if (socket) {
    //       socket.emit("walletChange", {
    //         userid: currentUserId,
    //         diamonds: userToSend.diamonds,
    //         coins: userToSend.coins,
    //       });
    //     }
    //   }
    // }

    await sendNotification(
      usedToSendId.toString(),
      currentUser.firstname + " " + currentUser.lastname,
      `Sent you a tip`,  // $${coinAmount.toFixed(1)}
      "wallet",
      usedToSendId
    );

    await createActivity(
      usedToSendId,
      currentUserId,
      `Sent you a tip`,
      null,
      null,
      null,
      null,
      null,
      true
    );

    await Transaction.create({
      senderid: currentUserId,
      receiverid: usedToSendId,
      amount: coinAmount,
    });

    await createTransaction({
      user_id: currentUserId,
      creator_id: usedToSendId,
      type: 'tip',
      amount: coinAmount,
      platform_fee: adminShare,
      net_creator_amount: userShare,
      status: 'completed'
    });

    res.status(200).json({
      message: "Amount Sent",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
// const addCoins = async (req, res) => {
//   try {
//     const userid = req.body.userid;
//     var amount = req.body.amount;
//     var totalAmount = amount;
//     if(typeof amount == "string"){
//       amount = parseInt(amount)
//     }
//     const user = await User.findById(userid);
//     if (!user) {
//       throw Error("User Not Found");
//     }

//     var mainAdmin = await Admin.findOne({mainAdmin: true});
//     amount = amount *  ((100 - 30) / 100)
//     console.log("70%: ", amount)

//     var shareAmount = amount;
//     var userShare = amount *  ((100 - mainAdmin.adminShare) / 100);
//     console.log("40% of 70%: ", userShare)
//     var adminShare = shareAmount - userShare;
//     console.log("30% of 70%: ", adminShare)

//     var adminWallet = await Wallet.findById(mainAdmin.walletid);
//     await adminWallet.updateOne({
//       currentAmount: adminWallet.currentAmount + adminShare,
//       earnedAmount: adminWallet.earnedAmount + adminShare
//     })

//     const wallet = await Wallet.findById(user.walletid);
//     var amountNew = wallet.boughtAmount + (userShare / 0.1);
//     await wallet.updateOne({
//       currentAmount: wallet.currentAmount + (userShare / 0.1),
//       boughtAmount: wallet.boughtAmount + (userShare / 0.1)
//     });

//     var sockets = global.onlineSockets.get(userid.toString());

//     if (sockets) {
//       for (const socket of sockets) {
//         if (socket) {
//           socket.emit("walletChange", {
//             userid: userid,
//             balance: amountNew
//           });
//         }
//       }
//     }
//     res.status(200).json({
//       message: "Coins Added Successfully",
//     });
//   } catch (error) {
//     res.status(400).json({
//       error: error.message,
//     });
//   }
// };
const addCoins = async (req, res) => {
  try {
    const userid = req.body.userid;
    var amount = req.body.amount;
    var coins = req.body.coins;
    var totalAmount = amount;
    if (typeof amount == "string") {
      amount = parseInt(amount);
    }
    if (typeof coins == "string") {
      coins = parseInt(coins);
    }
    const user = await User.findById(userid);
    if (!user) {
      throw Error("User Not Found");
    }

    // var mainAdmin = await Admin.findOne({mainAdmin: true});
    // amount = amount *  ((100 - 30) / 100)
    // console.log("70%: ", amount)

    // var shareAmount = amount;
    // var userShare = amount *  ((100 - mainAdmin.adminShare) / 100);
    // console.log("40% of 70%: ", userShare)
    // var adminShare = shareAmount - userShare;
    // console.log("30% of 70%: ", adminShare)

    // var adminWallet = await Wallet.findById(mainAdmin.walletid);
    // await adminWallet.updateOne({
    //   currentAmount: adminWallet.currentAmount + adminShare,
    //   earnedAmount: adminWallet.earnedAmount + adminShare
    // })

    const wallet = await Wallet.findById(user.walletid);
    var amountNew = wallet.boughtAmount + amount;
    var coin = wallet.coins + coins;
    await wallet.updateOne({
      currentAmount: wallet.currentAmount + amount,
      boughtAmount: wallet.boughtAmount + amount,
      coins: wallet.coins + coins,
    });

    const mainAdmin = await Admin.findOne({ mainAdmin: true });
    if (mainAdmin && mainAdmin.walletid) {
      await Wallet.updateOne(
        { _id: mainAdmin.walletid },
        { $inc: { currentAmount: amount, earnedAmount: amount } }
      );
    }

    await createTransaction({
      creator_id: userid,
      type: 'coin_purchase',
      amount: amount,
      platform_fee: amount,
      net_creator_amount: 0,
      status: 'completed', // If internal; else pending and update via webhook
      // Add payment_provider_tx_id if from PayPal
    });

    await transactionHistoryModel.create({
      userid,
      amount: amount,
      fee: amount,
      adminShare: amount,
      userGot: amount,
      transactionType: "buyCoin"
    })

    var sockets = global.onlineSockets.get(userid.toString());

    if (sockets) {
      for (const socket of sockets) {
        if (socket) {
          socket.emit("walletChange", {
            userid: userid,
            balance: coin,
          });
        }
      }
    }
    res.status(200).json({
      message: "Coins Added Successfully",
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllRankings = async (req, res) => {
  try {
    const getRanking = async (field, limit = 50) => {
      const result = await Wallet.aggregate([
        {
          $lookup: {
            from: "users",
            localField: "userid",
            foreignField: "_id",
            as: "userData"
          }
        },
        { $unwind: "$userData" },
        {
          $match: {
            [field]: { $gt: 0 }
          }
        },
        {
          $project: {
            amount: `$${field}`,
            userData: 1
          }
        },
        { $sort: { amount: -1 } },
        { $limit: limit }
      ]);

      for (const item of result) {
        if (item.userData.profilePicture) {
          const command = new GetObjectCommand({
            Bucket: bucketName,
            Key: item.userData.profilePicture,
          });

          item.userData.profileImage = await getSignedUrl(s3, command, { expiresIn: 60 * 60 * 24 * 7 }); // 7 days
        } else {
          item.userData.profileImage = "";
        }
      }

      return result;
    };

    const hourlySent = await getRanking("hourlySentCoins");
    const hourlyReceived = await getRanking("hourlyReceivedDiamonds");
    const weeklySent = await getRanking("weeklySentCoins");
    const weeklyReceived = await getRanking("weeklyReceivedDiamonds");
    const monthlySent = await getRanking("monthlySentCoins");
    const monthlyReceived = await getRanking("monthlyReceivedDiamonds");

    res.json({
      hourly: { sent: hourlySent, received: hourlyReceived },
      weekly: { sent: weeklySent, received: weeklyReceived },
      monthly: { sent: monthlySent, received: monthlyReceived }
    });
  } catch (err) {
    console.error("Error in getAllRankings:", err);
    res.status(500).json({ error: "Server error" });
  }
};




cron.schedule("0 * * * *", async () => {
  await Wallet.updateMany({}, {
    $set: {
      hourlySentCoins: 0,
      hourlyReceivedDiamonds: 0
    }
  });
  console.log("Hourly coins reset");
});


cron.schedule("0 0 * * 1", async () => {
  await Wallet.updateMany({}, {
    $set: {
      weeklySentCoins: 0,
      weeklyReceivedDiamonds: 0
    }
  });
  console.log("Weekly coins reset");
});

cron.schedule("0 0 1 * *", async () => {
  await Wallet.updateMany({}, {
    $set: {
      monthlySentCoins: 0,
      monthlyReceivedDiamonds: 0
    }
  });
  console.log("Monthly coins reset");
});


const getBalance = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    const wallet = await Wallet.findById(user.walletid);

    res.status(200).json({
      currentAmount: wallet.currentAmount,
      earnedAmount: wallet.earnedAmount,
      boughtAmount: wallet.boughtAmount,
      coins: wallet.coins,
      diamonds: wallet.diamonds,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const storeItems = require("../constants/storeItems");
const buyCoins = async (req, res) => {
  res.render("index", {
    userid: req.params.userid,
    productid: req.params.productid,
    paypalClientId: process.env.PAYPAL_CLIENT_ID,
  });
};
const getSentTips = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    let sentTips = await Transaction.find({ senderid: userid }).sort({
      createdAt: "desc",
    });

    sentTips = await Promise.all(
      sentTips.map((tip) => {
        return processTip(tip);
      })
    );

    res.status(200).json({
      sentTips,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const getReceivedTips = async (req, res) => {
  try {
    const userid = req.params.userid;
    const user = await User.findById(userid);

    if (!user) {
      throw Error("User Not Found");
    }

    let receivedTips = await Transaction.find({ receiverid: userid }).sort({
      createdAt: "desc",
    });
    receivedTips = await Promise.all(
      receivedTips.map((tip) => {
        return processTip(tip);
      })
    );

    res.status(200).json({
      receivedTips,
    });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};
const createOrder = async (req, res) => {
  const request = new paypal.orders.OrdersCreateRequest();
  const total = storeItems.get(req.body.item.id).price;
  request.prefer("return=representation");
  request.requestBody({
    intent: "CAPTURE",
    purchase_units: [
      {
        amount: {
          currency_code: "USD",
          value: total,
          breakdown: {
            item_total: {
              currency_code: "USD",
              value: total,
            },
          },
        },
        items: [
          {
            name: storeItems.get(req.body.item.id).name,
            description: "Digital Credits",
            unit_amount: {
              currency_code: "USD",
              value: storeItems.get(req.body.item.id).price,
            },
            quantity: 1,
          },
        ],
      },
    ],
  });

  try {
    const user = await User.findById(req.body.userid);
    if (!user) {
      throw Error("User Not Found");
    }
    const order = await paypalClient.execute(request);
    res.json({ id: order.result.id });
  } catch (e) {
    res.status(400).json({ error: e.message });
  }
};
const { getPicUrl } = require("./userController");
const transactionHistoryModel = require("../models/transactionHistoryModel");
const { ApiFeatures } = require("../helpers/ApiFeatures");
const { aws } = require("../helpers/otherHelpers");
const { catchAsyncError } = require("../helpers/catchAsyncError");
const processTip = async (tip) => {
  try {
    const sender = await User.findById(tip.senderid);
    const receiver = await User.findById(tip.receiverid);

    tip = tip.toObject();

    const senderUsername = sender.username;
    const receiverUsername = receiver.username;

    const senderProfilePic = await getPicUrl(sender._id);
    const receiverProfilePic = await getPicUrl(receiver._id);

    tip.senderUsername = senderUsername;
    tip.receiverUsername = receiverUsername;

    tip.senderProfilePic = senderProfilePic;
    tip.receiverProfilePic = receiverProfilePic;
    // console.log(tip)

    return tip;
  } catch (error) {
    throw error;
  }
};

const getTransations = catchAsyncError(async (req, res, next) => {
  let apiFeature = new ApiFeatures(transactionHistoryModel.find().populate({
    path: 'userid',
    select: 'username firstname lastname profilePicture'
  }), req.query)
    .filteration()
    .search()

  const count = await apiFeature.getTotalCount();

  apiFeature.pagination().sort()
  const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
  const result = await apiFeature.mongooseQuery;

  var transactions = [];
  await Promise.all(
    result.map(async transaction => {
      if(transaction.userid.profilePicture){
        transaction.userid.profilePicture = await aws.getLinkFromAWS(transaction.userid.profilePicture);
      }
      transactions.push(transaction);
    })
  )
  res.status(201).json({ success: true, count, page: PAGE_NUMBER, transactions });
});

const getAllWithdrawals = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(Withdraw.find({}).populate({
        path: 'userId',
        select: 'username firstname lastname profilePicture'
      }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (withdraw) => {
        withdraw = withdraw.toObject();
        if(withdraw.userId && withdraw.userId.profilePicture){
          withdraw.userId.profilePicture = await aws.getLinkFromAWS(withdraw.userId.profilePicture);
        }
        return withdraw;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, withdraws: result });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllWithdrawalsDownload = async (req, res) => {
  try {
    let apiFeature = new ApiFeatures(Withdraw.find({}).populate({
        path: 'userId',
        select: 'username firstname lastname profilePicture'
      }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (withdraw) => {
        withdraw = withdraw.toObject();
        if(withdraw.userId && withdraw.userId.profilePicture){
          withdraw.userId.profilePicture = await aws.getLinkFromAWS(withdraw.userId.profilePicture);
        }
        return withdraw;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, withdraws: result });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const getAllUserWithdrawals = async (req, res) => {
  try {
    var {userid} = req.params;
    let apiFeature = new ApiFeatures(Withdraw.find({userId: userid}).populate({
        path: 'userId',
        select: 'username firstname lastname profilePicture'
      }), req.query)
    .filteration()
    .search()
    
    const count = await apiFeature.getTotalCount();
        
    apiFeature.pagination().sort()
    const PAGE_NUMBER = apiFeature.queryString.page * 1 || 1;
    var result = await apiFeature.mongooseQuery;
    result = await Promise.all(
      result.map(async (withdraw) => {
        withdraw = withdraw.toObject();
        if(withdraw.userId && withdraw.userId.profilePicture){
          withdraw.userId.profilePicture = await aws.getLinkFromAWS(withdraw.userId.profilePicture);
        }
        return withdraw;
      })
    );

    res.status(200).json({ success: true, count, page: PAGE_NUMBER, withdraws: result });
  } catch (error) {
    res.status(400).json({
      error: error.message,
    });
  }
};

const cancelWithdrawRequest = async (req, res) => {
  const { withdrawid } = req.body;
  try {
    const withdraw = await Withdraw.findById(withdrawid);
    if (!withdraw) {
      return res.status(404).json({ message: "Withdraw not found" });
    }

    const user = await User.findById(withdraw.userId);
    if (!user) {
      return res.status(404).json({ message: "Withdraw user not found" });
    }
    
    const wallet = await Wallet.findOne({ userid: user._id });
    withdraw.status = "cancelled"
    await withdraw.save();
    wallet.diamonds += withdraw.amount;
    await wallet.save();

    const transaction = await Transaction.findOne({ user_id: withdraw.userId, amount: -withdraw.amount, type: 'withdrawal', status: 'pending' });
    if (transaction) {
      transaction.status = (status === 'cancelled' ? 'failed' : 'completed');
      await transaction.save();
    }

    await sendNotification(
      user._id.toString(),
      "Withdrawal update",
      `Your withdrawal request is cancelled`,  // $${coinAmount.toFixed(1)}
      "withdrawal",
      {withdrawid}
    );

    await createActivity(
      user._id.toString(),
      undefined,
      `Your withdrawal request is cancelled`,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "withdrawal",
      {withdrawid}
    );

    return res
      .status(200)
      .json({ message: "Withdrawal request cancelled successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

const processedWithdrawRequest = async (req, res) => {
  const { withdrawid } = req.body;
  try {
    const withdraw = await Withdraw.findById(withdrawid);
    if (!withdraw) {
      return res.status(404).json({ message: "Withdraw not found" });
    }

    const user = await User.findById(withdraw.userId);
    if (!user) {
      return res.status(404).json({ message: "Withdraw user not found" });
    }
    
    const wallet = await Wallet.findOne({ userid: user._id });
    console.log("userid: ", user._id.toString())
    withdraw.status = "processed"
    await withdraw.save();
    wallet.diamonds += withdraw.amount;
    await wallet.save();

    const transaction = await Transaction.findOne({ user_id: withdraw.userId, amount: -withdraw.amount, type: 'withdrawal', status: 'pending' });
    if (transaction) {
      transaction.status = (status === 'cancelled' ? 'failed' : 'completed');
      await transaction.save();
    }

    await sendNotification(
      user._id.toString(),
      "Withdrawal update",
      `Your withdrawal request is processed`,  // $${coinAmount.toFixed(1)}
      "withdrawal",
      {withdrawid}
    );

    await createActivity(
      user._id.toString(),
      undefined,
      `Your withdrawal request is processed`,
      null,
      null,
      null,
      null,
      null,
      null,
      null,
      "withdrawal",
      {withdrawid}
    );

    return res
      .status(200)
      .json({ message: "Withdrawal request processed successfully" });
  } catch (error) {
    return res
      .status(500)
      .json({ message: "Server error", error: error.message });
  }
};

module.exports = {
  sendCoins,
  getBalance,
  buyCoins,
  createOrder,
  addCoins,
  getSentTips,
  getReceivedTips,
  getWalletAmount,
  withdrawRequest,
  getWithdrawById,
  setWithdrawStatus,
  getWithdrawByWithdrawId,
  sendCashTips,
  getTransations,
  getAllRankings,

  getAllWithdrawals,
  getAllUserWithdrawals,
  cancelWithdrawRequest,
  processedWithdrawRequest,
  getAllWithdrawalsDownload
};
