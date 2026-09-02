const mongoose = require("mongoose");
const connectDB = require("../db");
const User = require("../models/userModel");
const Club = require("../models/clubModel");

async function clearClubMemberships() {
  await connectDB();

  const [usersResult, clubsResult] = await Promise.all([
    User.updateMany({}, { $set: { clubid: null, clubsJoined: [] } }),
    Club.updateMany({}, { $set: { members: [] } }),
  ]);

  console.log(
    JSON.stringify(
      {
        usersMatched: usersResult.matchedCount,
        usersModified: usersResult.modifiedCount,
        clubsMatched: clubsResult.matchedCount,
        clubsModified: clubsResult.modifiedCount,
      },
      null,
      2
    )
  );
}

clearClubMemberships()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
