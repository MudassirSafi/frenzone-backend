const express = require("express");
const router = express.Router();

const {
  createVoiceMeet,
  leaveVoiceMeet,
  getStreamsOfFollowing,
  deleteStream,
  joinStream,
  getStreamByUserId,
  getActiveVoiceChannelsForClub,
  getViewers,
  getViewersCount,
  makeModerator,
  removeModerator,
  getModerators,
  getBlocked,
  sendInvite,
  sendAudianceInvite,
  scheduleVoiceMeet,
  addMembers,
  kickUser,
  // New X-Space style APIs
  requestToSpeak,
  approveSpeakingRequest,
  denySpeakingRequest,
  muteSpeaker,
  unmuteSpeaker,
  assignCoHost,
  assignModerator,
  moveToListener,
  removeFromSpace,
  banUser,
  reportUserInSpace,
  reactWithEmoji,
  shareRoom,
  endVoiceChat,
  pinMessage,
  getSpeakingRequests
} = require("../controllers/voicemeetController");

const requireAuth = require("../middleware/requireAuth");
router.use(requireAuth);

router.post("/createVoiceMeet", createVoiceMeet);
router.post("/sendInvite", sendInvite);
router.post("/sendAudianceInvite", sendAudianceInvite);
router.get("/getStreamsOfFollowing/:userid", getStreamsOfFollowing);
router.delete("/deleteStream", deleteStream);
router.patch("/joinStream", joinStream);
router.patch("/leaveVoiceMeet", leaveVoiceMeet);
router.get("/getStreamByUserId/:userid", getStreamByUserId);
router.get("/activeChannels/:clubid", getActiveVoiceChannelsForClub);
router.get("/getViewers/:streamid", getViewers);
router.get("/getViewersCount/:streamid", getViewersCount);
router.patch("/makeModerator", makeModerator);
router.patch("/removeModerator", removeModerator);
router.get("/getModerators/:streamid", getModerators);
router.get("/getBlocked/:streamid", getBlocked);
router.post("/scheduleVoiceMeet", scheduleVoiceMeet)
router.patch("/addMembers", addMembers)
router.patch("/kickUser", kickUser)

// New X-Space style voice chat routes
router.post("/requestToSpeak", requestToSpeak);
router.post("/approveSpeakingRequest", approveSpeakingRequest);
router.post("/denySpeakingRequest", denySpeakingRequest);
router.post("/muteSpeaker", muteSpeaker);
router.post("/unmuteSpeaker", unmuteSpeaker);
router.post("/assignCoHost", assignCoHost);
router.post("/assignModerator", assignModerator);
router.post("/moveToListener", moveToListener);
router.post("/removeFromSpace", removeFromSpace);
router.post("/banUser", banUser);
router.post("/reportUserInSpace", reportUserInSpace);
router.post("/reactWithEmoji", reactWithEmoji);
router.post("/shareRoom", shareRoom);
router.post("/endVoiceChat", endVoiceChat);
router.post("/pinMessage", pinMessage);
router.get("/getSpeakingRequests/:userid", getSpeakingRequests);

module.exports = router;
