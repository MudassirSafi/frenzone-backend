const cron = require('node-cron');
const User = require('../models/userModel');

const resetClubStreamLimit = async () => {
    try {
        console.log('Running cron job: Resetting club stream limit for all users...');
        const result = await User.updateMany({}, { todaysPrivateStreamingMinutes: 0 });
        console.log(`Successfully reset club stream limit for ${result.modifiedCount} users.`);
    } catch (error) {
        console.error('Error in resetClubStreamLimit cron job:', error);
    }
};

// Run every day at midnight (00:00)
cron.schedule('0 0 * * *', resetClubStreamLimit);

module.exports = { resetClubStreamLimit };
