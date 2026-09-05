const mongoose = require('mongoose');
const connectDB = require('../db');
const User = require('../models/userModel');
const StreamAnalysis = require('../models/streamAnalysisModel');
const { getCreatorPerformance } = require('../controllers/creator/creatorDashboardController');
require('dotenv').config();

async function runPerformanceE2ETest() {
  console.log('=== CREATOR PERFORMANCE CONTROLLER E2E TEST ===');
  await connectDB();

  let userAId = null;
  let userBId = null;
  const createdStreamIds = [];

  try {
    const timestamp = Date.now();
    const userA = await User.create({
      firstname: 'Charlie',
      lastname: 'Streamer',
      username: 'charlie_' + timestamp,
      email: 'charlie_' + timestamp + '@frenzone.test',
      loginFrom: 'Web',
      app_user_id: 'charlie_' + timestamp,
      followers: [new mongoose.Types.ObjectId(), new mongoose.Types.ObjectId()],
      onboarding: { active: true },
    });
    userAId = userA._id;

    const userB = await User.create({
      firstname: 'Eve',
      lastname: 'Hacker',
      username: 'eve_' + timestamp,
      email: 'eve_' + timestamp + '@frenzone.test',
      loginFrom: 'Web',
      app_user_id: 'eve_' + timestamp,
      onboarding: { active: true },
    });
    userBId = userB._id;

    // Create stream records for User A:
    // Stream 1: 3 days ago, 500 likes, 100 gift coins
    const d1 = new Date();
    d1.setDate(d1.getDate() - 3);
    const start1 = new Date(d1.getTime() - 2 * 60 * 60 * 1000); // 2 hours duration
    const s1 = await StreamAnalysis.create({
      streamid: new mongoose.Types.ObjectId(),
      userid: userAId,
      likes: 500,
      giftCoins: 100,
      diamondsEarned: 42,
      usdEarned: 42,
      createdAt: start1,
      endedAt: d1,
    });
    createdStreamIds.push(s1._id);

    // Stream 2: 15 days ago, 800 likes, 250 gift coins
    const d2 = new Date();
    d2.setDate(d2.getDate() - 15);
    const start2 = new Date(d2.getTime() - 1.5 * 60 * 60 * 1000);
    const s2 = await StreamAnalysis.create({
      streamid: new mongoose.Types.ObjectId(),
      userid: userAId,
      likes: 800,
      giftCoins: 250,
      diamondsEarned: 105,
      usdEarned: 105,
      createdAt: start2,
      endedAt: d2,
    });
    createdStreamIds.push(s2._id);

    // Stream 3: 45 days ago, 1200 likes, 400 gift coins
    const d3 = new Date();
    d3.setDate(d3.getDate() - 45);
    const start3 = new Date(d3.getTime() - 3 * 60 * 60 * 1000);
    const s3 = await StreamAnalysis.create({
      streamid: new mongoose.Types.ObjectId(),
      userid: userAId,
      likes: 1200,
      giftCoins: 400,
      diamondsEarned: 168,
      usdEarned: 168,
      createdAt: start3,
      endedAt: d3,
    });
    createdStreamIds.push(s3._id);

    // 1. Test range=7d (should include only stream 1)
    console.log('1. Testing range=7d filter...');
    let res7d = null;
    await getCreatorPerformance({ userId: userAId, query: { range: '7d' } }, {
      status: (code) => ({ json: (d) => { res7d = { code, ...d }; } })
    }, (err) => { if (err) throw err; });

    if (!res7d?.success || !res7d?.data) throw new Error('Failed range=7d: ' + JSON.stringify(res7d));
    console.log('   Sessions (7d):', res7d.data.totalStreamSessions, '(expected 1)');
    console.log('   Hours (7d):', res7d.data.totalHoursStreamed, '(expected ~2.0)');
    console.log('   Peak viewers (7d):', res7d.data.peakConcurrentViewers, '(expected 500)');
    if (res7d.data.totalStreamSessions !== 1) throw new Error('Expected 1 session in 7d');
    if (res7d.data.peakConcurrentViewers !== 500) throw new Error('Expected peak 500 in 7d');

    // 2. Test range=30d (should include streams 1 & 2)
    console.log('2. Testing range=30d filter...');
    let res30d = null;
    await getCreatorPerformance({ userId: userAId, query: { range: '30d' } }, {
      status: (code) => ({ json: (d) => { res30d = { code, ...d }; } })
    }, (err) => { if (err) throw err; });

    if (!res30d?.success || !res30d?.data) throw new Error('Failed range=30d');
    console.log('   Sessions (30d):', res30d.data.totalStreamSessions, '(expected 2)');
    console.log('   Total viewers (30d):', res30d.data.totalViewersCount, '(expected 1300)');
    console.log('   Peak viewers (30d):', res30d.data.peakConcurrentViewers, '(expected 800)');
    console.log('   Trend data length:', res30d.data.trendData.length, '(expected 2)');
    if (res30d.data.totalStreamSessions !== 2) throw new Error('Expected 2 sessions in 30d');
    if (res30d.data.peakConcurrentViewers !== 800) throw new Error('Expected peak 800 in 30d');
    if (res30d.data.trendData.length !== 2) throw new Error('Expected 2 trendData items in 30d');

    // 3. Test range=all (should include all 3 streams)
    console.log('3. Testing range=all filter...');
    let resAll = null;
    await getCreatorPerformance({ userId: userAId, query: { range: 'all' } }, {
      status: (code) => ({ json: (d) => { resAll = { code, ...d }; } })
    }, (err) => { if (err) throw err; });

    console.log('   Sessions (all):', resAll.data.totalStreamSessions, '(expected 3)');
    console.log('   Peak viewers (all):', resAll.data.peakConcurrentViewers, '(expected 1200)');
    if (resAll.data.totalStreamSessions !== 3) throw new Error('Expected 3 sessions in all');
    if (resAll.data.peakConcurrentViewers !== 1200) throw new Error('Expected peak 1200 in all');

    // 4. Test BOLA / IDOR protection (User B should see 0 streams)
    console.log('4. Testing BOLA / IDOR protection for User B...');
    let resUserB = null;
    await getCreatorPerformance({ userId: userBId, query: { range: 'all' } }, {
      status: (code) => ({ json: (d) => { resUserB = { code, ...d }; } })
    }, (err) => { if (err) throw err; });

    console.log('   User B sessions:', resUserB.data.totalStreamSessions, '(expected 0)');
    console.log('   User B trendData length:', resUserB.data.trendData.length, '(expected 0)');
    if (resUserB.data.totalStreamSessions !== 0) throw new Error('BOLA VIOLATION: User B accessed User A streams!');
    if (resUserB.data.trendData.length !== 0) throw new Error('BOLA VIOLATION: User B received trendData!');

    // 5. Test empty state values
    console.log('5. Verifying clean empty state formatting...');
    if (resUserB.data.totalHoursStreamed !== 0) throw new Error('Expected 0 hours for empty creator');
    if (resUserB.data.avgWatchTimeMinutes !== 0) throw new Error('Expected 0 watch time for empty creator');
    if (resUserB.data.engagementRate !== 0) throw new Error('Expected 0 engagement for empty creator');
    console.log('   Empty state returns valid 0-metrics and empty array cleanly.');

    console.log('=== ALL PERFORMANCE CONTROLLER E2E TESTS PASSED (100%) ===');
  } finally {
    if (userAId) await User.findByIdAndDelete(userAId);
    if (userBId) await User.findByIdAndDelete(userBId);
    for (const sid of createdStreamIds) {
      await StreamAnalysis.findByIdAndDelete(sid);
    }
    await mongoose.disconnect();
  }
}

runPerformanceE2ETest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
