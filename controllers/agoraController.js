const { RtcTokenBuilder, RtcRole } = require('agora-token');
require("dotenv").config();

// Strict validation for Agora 32-character hexadecimal credential
const isValidHex32 = (str) =>
  typeof str === "string" &&
  /^[a-fA-F0-9]{32}$/.test(str.trim()) &&
  !/^(.)\1+$/.test(str.trim()); // Disallow all-identical digit placeholders (e.g. 1111...)

const isAgoraConfigured = () => {
  const envId = (process.env.AGORA_APPID || "").trim();
  const envCert = (process.env.AGORA_CERTIFICATE || "").trim();
  return isValidHex32(envId) && isValidHex32(envCert);
};

const getAppId = () => {
  const envId = (process.env.AGORA_APPID || "").trim();
  if (isValidHex32(envId)) return envId;
  return "";
};

const getAppCert = () => {
  const envCert = (process.env.AGORA_CERTIFICATE || "").trim();
  if (isValidHex32(envCert)) return envCert;
  return "";
};

const generateRtcToken = (channelName, customUid = 0) => {
  const resolvedUid = Number(customUid) || 0;

  if (isAgoraConfigured()) {
    const appId = getAppId();
    const appCertificate = getAppCert();
    const role = RtcRole.PUBLISHER;
    const expirationTimeInSeconds = 86400;
    const currentTimestamp = Math.floor(Date.now() / 1000);
    const privilegeExpiredTs = currentTimestamp + expirationTimeInSeconds;

    return RtcTokenBuilder.buildTokenWithUid(
      appId,
      appCertificate,
      channelName,
      resolvedUid,
      role,
      expirationTimeInSeconds,
      privilegeExpiredTs
    );
  }

  // Development token for testing when placeholder credentials are used
  const rawAppId = (process.env.AGORA_APPID || "placeholder_agora_appid").trim();
  return `dev_token_${rawAppId}_${channelName}_${resolvedUid}_${Date.now()}`;
};

module.exports = { generateRtcToken, getAppId, isAgoraConfigured };

  