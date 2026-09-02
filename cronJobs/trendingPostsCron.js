const cron = require("node-cron");
const mongoose = require("mongoose");
const { recalculateTrendingPosts } = require("../services/trendingPostsService");

let running = false;

async function runTrendingJob() {
  if (running || mongoose.connection.readyState !== 1) return;
  running = true;
  try {
    const count = await recalculateTrendingPosts();
    console.log(`[Trending Cron] Recalculated ${count} posts`);
  } catch (error) {
    console.error("[Trending Cron] Recalculation failed:", error);
  } finally {
    running = false;
  }
}

cron.schedule("*/10 * * * *", runTrendingJob);
mongoose.connection.once("open", runTrendingJob);

module.exports = { runTrendingJob };
