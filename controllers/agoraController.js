const {RtcTokenBuilder, RtcRole} = require('agora-token')

require("dotenv").config()

const appId = process.env.AGORA_APPID
const appCertificate = process.env.AGORA_CERTIFICATE
const uid = 0


const generateRtcToken = (channelName) => {
  const role = RtcRole.PUBLISHER
  const expirationTimeInSeconds = 86400;
  const currentTimestamp = Math.floor(Date.now() / 1000);

  const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;


  const tokenWithUid = RtcTokenBuilder.buildTokenWithUid(appId, appCertificate, channelName, uid, role,expirationTimeInSeconds, privilegeExpiredTs);

  return tokenWithUid;
};


module.exports = {generateRtcToken}

  