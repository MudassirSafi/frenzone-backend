/**
 * reconcileStreamDurations.js
 * Scans StreamAnalysis records with durationSeconds <= 0 or missing,
 * and recovers the duration from streamid (ObjectId timestamp) and endedAt.
 */
require('dotenv').config();
const mongoose = require('mongoose');

const mongoUrl = (process.env.DATABASE_URL || '').replace(/^["']|["']$/g, '');

async function reconcile() {
  if (!mongoUrl) {
    console.error("DATABASE_URL not found in .env");
    process.exit(1);
  }

  console.log("Connecting to database...");
  await mongoose.connect(mongoUrl);
  console.log("Connected successfully.");

  const StreamAnalysis = require('../models/streamAnalysisModel');

  const zeroDurationRecords = await StreamAnalysis.find({
    $or: [
      { durationSeconds: { $exists: false } },
      { durationSeconds: null },
      { durationSeconds: 0 }
    ]
  });

  console.log(`Found ${zeroDurationRecords.length} records with 0 or missing durationSeconds.`);

  let updatedCount = 0;
  for (const record of zeroDurationRecords) {
    let startTime = null;
    if (record.streamid && mongoose.isValidObjectId(record.streamid)) {
      const objId = new mongoose.Types.ObjectId(record.streamid);
      startTime = objId.getTimestamp();
    } else if (record.createdAt) {
      startTime = new Date(record.createdAt);
    }

    const endTime = record.endedAt ? new Date(record.endedAt) : (record.updatedAt ? new Date(record.updatedAt) : null);

    if (startTime && endTime && endTime > startTime) {
      const durationSeconds = Math.max(1, Math.floor((endTime.getTime() - startTime.getTime()) / 1000));
      record.durationSeconds = durationSeconds;
      await record.save();
      updatedCount++;
    }
  }

  console.log(`Reconciled and updated ${updatedCount} stream analysis records.`);
  await mongoose.disconnect();
  console.log("Done.");
}

if (require.main === module) {
  reconcile().catch(err => {
    console.error("Reconciliation error:", err);
    process.exit(1);
  });
}

module.exports = reconcile;
