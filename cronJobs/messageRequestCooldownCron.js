const cron = require("node-cron");
const MessageRequest = require("../models/messageRequestModel");
const {
  MESSAGE_REQUEST_COOLDOWN_MS,
} = require("../services/privacyAccessService");

async function cleanupExpiredMessageRequestCooldowns() {
  const cutoff = new Date(Date.now() - MESSAGE_REQUEST_COOLDOWN_MS);
  const result = await MessageRequest.deleteMany({
    accepted: false,
    declined: true,
    declinedAt: { $lte: cutoff },
  });

  if (result.deletedCount > 0) {
    console.log(
      `[Message Request Cron] Removed ${result.deletedCount} expired cooldown(s)`,
    );
  }
}

// Run daily at 00:15. Expired records are also removed lazily when a sender
// tries to message, so the cooldown does not depend solely on this cron.
cron.schedule("15 0 * * *", async () => {
  try {
    await cleanupExpiredMessageRequestCooldowns();
  } catch (error) {
    console.error("[Message Request Cron] Cleanup failed:", error);
  }
});

module.exports = { cleanupExpiredMessageRequestCooldowns };
