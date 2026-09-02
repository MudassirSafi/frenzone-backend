const cron = require("node-cron");
const User = require("../models/userModel");


cron.schedule("0 * * * *", async () => {
  try {
    const now = new Date();

    const result = await User.updateMany(
      {
        isPhantom: true,
        phantomExpiresAt: { $lte: now },
      },
      {
        $set: { isPhantom: false },
        $unset: { phantomExpiresAt: "" },
      }
    );

    if (result.modifiedCount > 0) {
      console.log(
        `[Phantom Cron] Disabled phantom for ${result.modifiedCount} user(s) at ${now.toISOString()}`
      );
    }
  } catch (err) {
    console.error("[Phantom Cron] Error:", err);
  }
});
