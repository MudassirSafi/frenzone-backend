const express = require("express");
const router = express.Router();

const {
  buyCoins,
  addCoins,
  sendCoins,
  getBalance,
  createOrder,
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
} = require("../controllers/walletController");

router.post("/withdrawRequest", withdrawRequest);
router.patch("/cancelWithdrawRequest", cancelWithdrawRequest)
router.patch("/processedWithdrawRequest", processedWithdrawRequest)
router.get("/getWithdrawById/:userId", getWithdrawById);
router.patch("/setWithdrawStatus", setWithdrawStatus);
router.get("/buyCoins/:userid/:productid", buyCoins);
router.post("/createOrder", createOrder);
router.patch("/addCoins", addCoins);
router.get("/getWalletAmount/:userId", getWalletAmount);

const requireAuth = require("../middleware/requireAuth");
router.use(requireAuth);
router.get("/getWithdrawByWithdrawId/:withdrawalId", getWithdrawByWithdrawId);
router.get("/getAllWithdrawals", getAllWithdrawals)
router.get("/getAllWithdrawalsDownload", getAllWithdrawalsDownload)
router.get("/getAllUserWithdrawals/:userid", getAllUserWithdrawals)

router.get("/getTransations", getTransations);
router.patch("/sendCoins", sendCoins);
router.get("/getBalance/:userid", getBalance);
router.get("/getSentTips/:userid", getSentTips);
router.get("/getReceivedTips/:userid", getReceivedTips);
router.patch("/sendCashTips", sendCashTips)
router.get("/getRankings", getAllRankings);

module.exports = router;
