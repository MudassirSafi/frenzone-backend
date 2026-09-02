const express = require("express");
const router = express.Router();
const requireAuth = require("../middleware/requireAuth");
const {
  getTopCreatorSuggestions,
} = require("../controllers/topCreatorsController");

const multer = require("multer");
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });
const uploadSupportImages = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB per file (adjust as needed)
    files: 10, // Max 10 files
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith("image/")) {
      cb(null, true);
    } else {
      cb(new Error("Only images are allowed"), false);
    }
  },
});

const {
  getUserById,
  getUserProfile,
  getAllFollowersAndFollowing,
  followUser,
  blockUser,
  searchUsersUpdated,
  getAllFollowers,
  getAllFollowing,
  getBlocked,
  setProfilePic,
  getProfilePic,
  deleteProfilePic,
  changePassword,
  editProfile,
  editProfileInitial,
  getAllUsers,
  resetPasswordRequest,
  verifyPasswordOtp,
  newPassword,
  setVerified,
  getVideos,
  getUserReels,
  getImages,
  deleteUser,
  deleteUserByUsername,
  generateShareableProfileLink,
  setUserRemoteId,
  getUserByRemoteId,
  updateUserBank,
  updateUserPaypal,
  getUserSubscription,
  updateUserVerifiedAccountSubscription,
  getUserVerifiedStatus,
  getUserLemVerified,
  getRandomUsers,
  getRandomVerified,
  getTagUsers,
  getTagUsersUpdated,
  searchUsers,
  sendSupportTicket,
  sendReport,
  getSumsubAccessToken,
  sumsubWebhook,
  getAllReports,
  getReportById,
  isUserIdVerified,
  makeUserVerified,
  strikeUser,
  liftStrike,
  getUsersUnderStrike,
  getStrikeStatus,
  reportUser,
  getUserReports,
  getAllUsersReports,
  getIdVerificationStatus,
  createDiditSession,
  diditWebhook,
  searchUsersUpdatedBlocked,
  getRestrictedIds,
  getUserFollowerFollowingCount,
  blockUserInSystem,
  getAllVerifiedUsers,
  updateVerifiedUsers,
  getVideosFast,
  searchClubUsersUpdatedBlocked,
  getNewUserOnboarding,
  activateNewUserOnboarding,
  trackAppMinute,
  setTopInfluencers,
  getTopInfluencers,
  getRandomTopInfluencers,
  recalculateRankingPointsAllUsers,
  getTopCreators,
  getAllCreators,
  assignBadgeToCreator,
  toggleHideFollowersFollowing,
  togglePrivateAccount,
  updatePrivacy,
  updateAccountSettings,
  toggleAcceptMessages,
  getFollowRequests,
  respondFollowRequest,
  cancelFollowRequest,
  getFollowStatus,
  getUserToggles,
} = require("../controllers/userController");

router.post(
  "/sendSupportTicket",
  uploadSupportImages.array("images", 10),
  sendSupportTicket,
);
router.patch("/updateVerifiedUsers", updateVerifiedUsers);
router.post("/reportUser", reportUser);
router.get("/getStrikeStatus/:userid", getStrikeStatus);
router.get("/getAllUsersReports", getAllUsersReports);
router.get("/getUserReports/:userid", getUserReports);
router.get("/getIdVerificationStatus/:userid", getIdVerificationStatus);
router.post("/createDiditSession/:userId", requireAuth, createDiditSession);
router.post("/didit-webhook", diditWebhook);
router.get("/getRestrictedIds/:userid", getRestrictedIds);
router.patch("/strikeUser", strikeUser);
router.patch("/liftStrike", liftStrike);
router.get("/getAllReports", getAllReports);
router.get("/isUserIdVerified/:userid", isUserIdVerified);
router.get("/makeUserVerified/:userid", makeUserVerified);
router.get("/getReportById/:reportid", getReportById);
router.post("/sumsub-webhook", sumsubWebhook);
router.post("/sendReport", sendReport);
router.patch("/resetPasswordRequest", resetPasswordRequest);
router.get("/getSumsubAccessToken/:userId", getSumsubAccessToken);
router.patch("/verifyPasswordOtp", verifyPasswordOtp);
router.patch("/newPassword", newPassword);

router.get("/getUserById/:userid", getUserById);
router.get("/newUserOnboarding/:userid", getNewUserOnboarding);
router.patch("/newUserOnboarding/:userid/activate", activateNewUserOnboarding);
router.get(
  "/getUserFollowerFollowingCount/:userid/:requesterId?",
  getUserFollowerFollowingCount,
);
router.get("/getUserProfile/:userid", requireAuth, getUserProfile);
router.get("/getRandomUsers", getRandomUsers);
router.get("/getRandomVerified", getRandomVerified);

router.patch("/followUser", requireAuth, followUser);
router.patch("/blockUser", requireAuth, blockUser);
router.patch("/blockUserInSystem/:userid", blockUserInSystem);
router.get("/searchUsers", searchUsers);
router.patch("/searchUsersNew", searchUsers);
router.get("/searchUsersUpdated/:search", searchUsersUpdated);
router.get(
  "/searchUsersUpdatedBlocked/:search/:userid?",
  searchUsersUpdatedBlocked,
);
router.get(
  "/searchClubUsersUpdatedBlocked/:userid?",
  searchClubUsersUpdatedBlocked,
);
router.get("/getTagUsers", getTagUsers);
router.patch("/getTagUsersUpdated", getTagUsersUpdated);

router.patch("/updateUserBank", updateUserBank);
router.patch("/updateUserPaypal", updateUserPaypal);

router.get("/getAllFollowers/:userid", requireAuth, getAllFollowers);
router.get("/getAllFollowing/:userid", requireAuth, getAllFollowing);
router.get("/getAllFoll/:userid", getAllFollowersAndFollowing);

router.get("/getBlocked/:userid", getBlocked);

router.patch("/setProfilePic", upload.single("image"), setProfilePic);
router.get("/getProfilePic/:userid", getProfilePic);
router.patch("/deleteProfilePic", deleteProfilePic);

router.patch("/changePassword", changePassword);

router.patch("/editProfile", editProfile);
router.patch("/editProfileInitial", editProfileInitial);

router.patch("/setVerified", setVerified);

router.get("/getVideos/:userid", requireAuth, getVideos);
router.get("/getImages/:userid", requireAuth, getImages);

router.get("/getUserReels/:userid", requireAuth, getUserReels);
router.delete("/deleteUser", deleteUser);
router.get("/deleteUser", deleteUserByUsername);
router.get(
  "/generateShareableProfileLink/:userId",
  generateShareableProfileLink,
);

router.get("/getUserByRemoteId/:remoteid", getUserByRemoteId);
router.patch("/setUserRemoteId", setUserRemoteId);

router.get("/getUserSubscription/:userid", getUserSubscription);

router.patch(
  "/updateUserVerifiedAccountSubscription",
  updateUserVerifiedAccountSubscription,
);
router.get("/getUserVerifiedStatus/:userid", getUserVerifiedStatus);
router.get("/getUserLemVerified/:userid", getUserLemVerified);
router.use(requireAuth);
router.post("/trackAppMinute", trackAppMinute);
router.patch("/setTopInfluencers", setTopInfluencers);
router.get("/getTopInfluencers", getTopInfluencers);
router.get("/getRandomTopInfluencers", getRandomTopInfluencers);
router.post("/recalculateRankingPointsAllUsers", recalculateRankingPointsAllUsers);
router.get("/getTopCreators", getTopCreators);
router.get("/getTopCreatorSuggestions", getTopCreatorSuggestions);
router.get("/getAllCreators", getAllCreators);
router.patch("/assignBadgeToCreator", assignBadgeToCreator);
router.patch("/toggleHideFollowersFollowing", toggleHideFollowersFollowing);
router.patch("/togglePrivateAccount", togglePrivateAccount);
router.patch("/updatePrivacy", updatePrivacy);
router.patch("/updateAccountSettings", updateAccountSettings);
router.patch("/toggleAcceptMessages", toggleAcceptMessages);
router.get("/getFollowRequests", getFollowRequests);
router.patch("/respondFollowRequest", respondFollowRequest);
router.patch("/cancelFollowRequest", cancelFollowRequest);
router.get("/followStatus/:targetUserId", getFollowStatus);
router.get("/getUserToggles/:userid", getUserToggles);
router.get("/getAllUsers", getAllUsers);
router.get("/getAllVerifiedUsers", getAllVerifiedUsers);
router.get("/getUsersUnderStrike", getUsersUnderStrike);

module.exports = router;
