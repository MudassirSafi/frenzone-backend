const cron = require("node-cron");
const mongoose = require("mongoose");
const { recalculateTopCreators } = require("../services/topCreatorsService");

let running = false;

async function runTopCreatorsJob() {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const count = await recalculateTopCreators();
    console.log(`[Top Creators Cron] Recalculated ${count} creators`);
  } catch (error) {
    console.error("[Top Creators Cron] Recalculation failed:", error);
  } finally {
    running = false;
  }
}

cron.schedule("0 3 * * *", runTopCreatorsJob);
mongoose.connection.once("open", runTopCreatorsJob);

module.exports = { runTopCreatorsJob };
