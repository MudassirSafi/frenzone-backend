const express = require("express");
const router = express.Router();
const multer = require('multer')
const storage = multer.memoryStorage()
const upload = multer({ storage: storage })
const {
  createStream,
  leaveStream,
  getStreamsOfFollowing,
  deleteStream,
  joinStream,
  getStreamByUserId,
  getViewers,
  getViewersLikesCount,
  makeModerator,
  removeModerator,
  getModerators,
  getBlocked,
  sendInvite,
  sendAudianceInvite,
  getStreamByUserIDByAdmin,
  deleteStreamByAdmin,
  createClubStream,
  getClubStreamStatus,
  getBroadcasters,
  removeBroadcaster,
  makeBroadcaster,
  challengeStreamer,
  getLiveUsers,
  getChallengersScore,
  requestChallenge,
  updateStreamToPk,
  generatePKBattleToken,
  updatePKToStream,
  getPkBattleUsersInfo,
  getPkBattleUserByUid,
  updatePKUniqueId,
  getPkBattleStatus,
  startPkBattle,
  getServerTime,
  endBattleAndDeclareWinner,
  updatePKVirtualBackground,
  joinPKStream,
  leavePKStream,
  likePKStream,
  getUserPowerUps,
  useAndDeletePowerUp,
  updatePKDoubleOpen,
  toggleCommentsVisibility,
  getStreamById,
  addCohostsRequest,
  removeCohostsRequest,
  getCohostRequests,
  enableThumbnail,
  toggleVirtualBackground,
  updateThumbnailSource,
  toggleGuestRequests,
  getTrendingStreams,
  getFollowingStreams,
  toggleLivePaused,
  makeUserPhantom,
  getRecentStreamAnalysis
} = require("../controllers/streamController");

router.delete("/deleteStreamByAdmin/:streamid", deleteStreamByAdmin);
router.get("/getStreamByUserIDByAdmin/:userid", getStreamByUserIDByAdmin);

const requireAuth = require("../middleware/requireAuth");
router.use(requireAuth);
router.post("/createStream", createStream);
router.post("/createClubStream", createClubStream);
router.get('/getClubStreamStatus/:clubid/:userid', getClubStreamStatus)
router.post("/sendInvite", sendInvite);
router.post("/sendAudianceInvite", sendAudianceInvite);
router.get("/getStreamsOfFollowing/:userid", getStreamsOfFollowing);
router.delete("/deleteStream", deleteStream);
router.patch("/joinStream", joinStream);
router.patch("/leaveStream", leaveStream);
router.get("/getStreamByUserId/:userid", getStreamByUserId);
router.get("/recentAnalysis/:userid", getRecentStreamAnalysis);
router.get("/getViewers/:streamid", getViewers);
router.get("/getViewersLikesCount/:streamid", getViewersLikesCount);
router.patch("/makeModerator", makeModerator);
router.patch("/removeModerator", removeModerator);
router.get("/getModerators/:streamid", getModerators);

router.patch("/makeBroadcaster", makeBroadcaster);
router.post("/removeBroadcaster", removeBroadcaster);
router.get("/getBroadcasters/:streamid", getBroadcasters);
router.get("/getBlocked/:streamid", getBlocked);
router.get("/getStreamById/:streamid", getStreamById);

router.post("/challengeStreamer", challengeStreamer);

router.get("/getLiveUsers", getLiveUsers)
router.get("/getChallengersScore/:streamid", getChallengersScore);
router.patch("/requestChallenge", requestChallenge);
router.patch("/updateStreamToPk", updateStreamToPk);
router.patch("/updatePKToStream", updatePKToStream);
router.get("/getPkBattleUsersInfo/:pkChannelName", getPkBattleUsersInfo); //to send gifts
router.get("/getPkBattleStatus/:pkChannelName", getPkBattleStatus); //get pk battle status
router.post("/getPkBattleUserByUid", getPkBattleUserByUid); //to show names in live streaming
router.post("/endBattleAndDeclareWinner", endBattleAndDeclareWinner);

router.post("/updatePKUniqueId", updatePKUniqueId);
router.post("/startPkBattle", startPkBattle);
router.get("/getTime", getServerTime);
router.post("/updatePKVirtualBackground", updatePKVirtualBackground);
router.patch("/joinPKStream", joinPKStream);
router.patch("/leavePKStream", leavePKStream);
router.get("/getUserPowerUps", getUserPowerUps);
router.post("/useAndDeletePowerUp", useAndDeletePowerUp);
router.get("/likePKStream", likePKStream);
router.post("/generatePKBattleToken", generatePKBattleToken);
router.post("/updatePKDoubleOpen", updatePKDoubleOpen);
router.post("/toggleCommentsVisibility", toggleCommentsVisibility);

router.post("/addCohostsRequest", addCohostsRequest);
router.post("/removeCohostsRequest/:streamid", removeCohostsRequest);
router.get("/getCohostRequests/:streamid", getCohostRequests);

router.patch("/enableThumbnail", upload.single("image"), enableThumbnail)
router.patch("/toggleVirtualBackground", toggleVirtualBackground);
router.post("/updateThumbnailSource/:streamid", updateThumbnailSource);
router.post("/toggleGuestRequests", toggleGuestRequests)

router.get("/getTrendingStreams", getTrendingStreams);
router.post("/getFollowingStreams", getFollowingStreams);
router.patch("/toggleLivePaused", toggleLivePaused);
router.post("/phantomActivate", makeUserPhantom);

module.exports = router;

