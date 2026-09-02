const express = require("express")
const router = express.Router()

const requireAuth = require("../middleware/requireAuth")
router.use(requireAuth)

const {createClub,getChatHistory,deleteClub,getClub,joinClub,leaveClub,getMembersOfClub,updateFee,createClubCall,deleteClubCall,getClubCall,joinCall,leaveCall, updateClub, subscription, getMyClubs, addUserToClub, addMembertoClubRoom, createClubRoom, getRoomById, 
  updateClubRoom,
  remvoeMemberFromClubRoom,
deleteClubRoom} = require("../controllers/clubController")

const multer = require('multer')
const storage = multer.memoryStorage()
const upload = multer({storage:storage})

router.post("/createClub", upload.single("image"), createClub)
router.patch("/updateClub", upload.single("image"), updateClub)
router.get("/getChatHistory",getChatHistory)
router.delete("/deleteClub",deleteClub)
router.patch("/joinClub",joinClub)
router.patch("/leaveClub",leaveClub)
router.get("/getClub/:clubid",getClub)
router.get("/getMyClubs/:userid",getMyClubs)
router.get("/getRoomById/:roomid",getRoomById)
router.patch("/addUserToClub", addUserToClub)
router.get("/getMembersOfClub/:clubid",getMembersOfClub)
router.patch("/updateFee",updateFee)
router.patch("/addMembertoClubRoom",addMembertoClubRoom)
router.patch("/remvoeMemberFromClubRoom",remvoeMemberFromClubRoom)
router.patch("/createClubRoom", upload.single("image"), createClubRoom)
router.patch("/updateClubRoom", upload.single("image"), updateClubRoom)

router.post("/createClubCall",createClubCall)
router.delete("/deleteClubCall",deleteClubCall)
router.delete("/deleteClubRoom",deleteClubRoom)
router.get("/getClubCall/:clubid",getClubCall)
router.patch("/joinCall",joinCall)
router.patch("/leaveCall",leaveCall)
router.post("/subscription",subscription)



module.exports = router




