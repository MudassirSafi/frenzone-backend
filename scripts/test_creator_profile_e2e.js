const mongoose = require('mongoose');
const connectDB = require('../db');
const User = require('../models/userModel');
const Wallet = require('../models/walletModel');
const StreamAnalysis = require('../models/streamAnalysisModel');
const CreatorApplication = require('../models/creatorApplicationModel');
const {
  getCreatorDashboard,
  getCreatorProfile,
  updateCreatorProfile,
  uploadCreatorAvatar,
} = require('../controllers/creator/creatorDashboardController');
require('dotenv').config();

async function runProfileE2ETest() {
  console.log('=== CREATOR PROFILE & OVERVIEW ENRICHMENT E2E TEST ===');
  await connectDB();

  let userAId = null;
  let userBId = null;
  let streamId = null;

  try {
    const timestamp = Date.now();
    const userA = await User.create({
      firstname: 'Alice',
      lastname: 'Creator',
      username: 'alice_creator_' + timestamp,
      email: 'alice_' + timestamp + '@frenzone.test',
      loginFrom: 'Web',
      app_user_id: 'alice_creator_' + timestamp,
      rankingPoints: 250,
      followers: [],
      onboarding: { active: true },
    });
    userAId = userA._id;

    const userB = await User.create({
      firstname: 'Bob',
      lastname: 'Victim',
      username: 'bob_victim_' + timestamp,
      email: 'bob_' + timestamp + '@frenzone.test',
      loginFrom: 'Web',
      app_user_id: 'bob_victim_' + timestamp,
      rankingPoints: 100,
      followers: [],
      bio: 'Bob original bio',
      onboarding: { active: true },
    });
    userBId = userB._id;

    const wallet = await Wallet.create({ userid: userA._id, diamond: 100 });
    await User.findByIdAndUpdate(userA._id, { walletid: wallet._id });

    // Stream for activity feed
    const stream = await StreamAnalysis.create({
      streamid: new mongoose.Types.ObjectId(),
      userid: userA._id,
      likes: 350,
      giftsReceived: 20,
      giftCoins: 800,
      diamondsEarned: 350,
      usdEarned: 350,
      endedAt: new Date(),
    });
    streamId = stream._id;

    // 1. Test getCreatorDashboard enrichment
    console.log('1. Testing getCreatorDashboard enrichment...');
    let dashData = null;
    const mockResDash = {
      status: (code) => ({
        json: (data) => { dashData = { code, ...data }; }
      })
    };
    await getCreatorDashboard({ userId: userAId }, mockResDash, (err) => { if (err) throw err; });
    if (!dashData?.success || !dashData?.data) {
      throw new Error('getCreatorDashboard failed: ' + JSON.stringify(dashData));
    }
    console.log('   Dashboard success! Live hours target:', dashData.data.liveHoursTarget);
    console.log('   Content progress:', dashData.data.contentProgress, '%');
    console.log('   Recent activities count:', dashData.data.recentActivities?.length);
    if (!Array.isArray(dashData.data.recentActivities) || dashData.data.recentActivities.length === 0) {
      throw new Error('Expected dynamic recentActivities in dashboard response!');
    }
    if (dashData.data.liveHoursTarget !== 40) {
      throw new Error('Expected liveHoursTarget to be 40');
    }

    // 2. Test getCreatorProfile initial
    console.log('2. Testing getCreatorProfile initial...');
    let profData = null;
    const mockResProf = {
      status: (code) => ({
        json: (data) => { profData = { code, ...data }; }
      })
    };
    await getCreatorProfile({ userId: userAId }, mockResProf, (err) => { if (err) throw err; });
    if (!profData?.success || !profData?.data) {
      throw new Error('getCreatorProfile failed: ' + JSON.stringify(profData));
    }
    console.log('   Profile success! Username:', profData.data.username);
    console.log('   Full name:', profData.data.fullName);
    console.log('   Country initially:', profData.data.country || '(empty)');

    // 3. Test updateCreatorProfile
    console.log('3. Testing updateCreatorProfile mutation...');
    let updateRes = null;
    const mockResUpdate = {
      status: (code) => ({
        json: (data) => { updateRes = { code, ...data }; }
      })
    };
    const updatePayload = {
      fullName: 'Alice In Wonderland',
      phone: '+1 555-0199',
      country: 'United Kingdom',
      language: 'English',
      bio: 'Live gaming streamer and creator on Frenzone!',
      socialLinks: {
        instagram: 'https://instagram.com/alice_frenzone',
        tiktok: 'https://tiktok.com/@alice_live',
        youtube: 'https://youtube.com/@alice_official',
      }
    };
    await updateCreatorProfile({ userId: userAId, body: updatePayload }, mockResUpdate, (err) => { if (err) throw err; });
    if (!updateRes?.success || !updateRes?.data) {
      throw new Error('updateCreatorProfile failed: ' + JSON.stringify(updateRes));
    }
    console.log('   Updated profile name:', updateRes.data.fullName);
    console.log('   Updated country:', updateRes.data.country);
    console.log('   Updated TikTok:', updateRes.data.socialLinks?.tiktok);
    if (updateRes.data.fullName !== 'Alice In Wonderland') throw new Error('fullName mismatch');
    if (updateRes.data.country !== 'United Kingdom') throw new Error('country mismatch');
    if (updateRes.data.socialLinks?.tiktok !== 'https://tiktok.com/@alice_live') throw new Error('tiktok mismatch');

    // 4. Test BOLA / IDOR protection
    console.log('4. Testing BOLA / IDOR security protection...');
    let idorRes = null;
    const mockResIdor = {
      status: (code) => ({
        json: (data) => { idorRes = { code, ...data }; }
      })
    };
    // Authenticated as User A, but maliciously injecting User B id in body
    await updateCreatorProfile({
      userId: userAId,
      body: {
        userid: String(userBId),
        bio: 'Hacked by Alice!',
      }
    }, mockResIdor, (err) => { if (err) throw err; });
    const checkBob = await User.findById(userBId);
    if (checkBob.bio === 'Hacked by Alice!') {
      throw new Error('SECURITY VULNERABILITY: User B was modified via IDOR!');
    }
    console.log('   IDOR Protected! Bob\'s bio remains untouched:', checkBob.bio);

    // 5. Test validation rejection
    console.log('5. Testing server-side input validation...');
    let valRes = null;
    const mockResVal = {
      status: (code) => ({
        json: (data) => { valRes = { code, ...data }; }
      })
    };
    await updateCreatorProfile({
      userId: userAId,
      body: { bio: 'A'.repeat(1005) }
    }, mockResVal, (err) => { if (err) throw err; });
    if (valRes?.code !== 400) {
      throw new Error('Expected 400 for bio > 1000 chars, got ' + valRes?.code);
    }
    console.log('   Oversized bio properly rejected with 400 Bad Request');

    // 6. Test uploadCreatorAvatar
    console.log('6. Testing uploadCreatorAvatar handler...');
    let avatarRes = null;
    const mockResAvatar = {
      status: (code) => ({
        json: (data) => { avatarRes = { code, ...data }; }
      })
    };
    const mockFile = {
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('mock_png_image_data'),
    };
    await uploadCreatorAvatar({ userId: userAId, file: mockFile }, mockResAvatar, (err) => { if (err) throw err; });
    if (!avatarRes?.success || !avatarRes?.avatarUrl) {
      throw new Error('uploadCreatorAvatar failed: ' + JSON.stringify(avatarRes));
    }
    console.log('   Avatar uploaded successfully! URL prefix:', avatarRes.avatarUrl.substring(0, 30));

    // 7. Verify persistence
    console.log('7. Verifying persistence in database...');
    const persistedUser = await User.findById(userAId).lean();
    if (persistedUser.country !== 'United Kingdom') throw new Error('country not persisted in User');
    if (persistedUser.tiktokUrl !== 'https://tiktok.com/@alice_live') throw new Error('tiktokUrl not persisted in User');
    if (persistedUser.youtubeUrl !== 'https://youtube.com/@alice_official') throw new Error('youtubeUrl not persisted in User');
    console.log('   All fields verified persistent in database!');

    console.log('=== ALL PHASE 2 BACKEND TESTS PASSED (100%) ===');
  } finally {
    if (userAId) await User.findByIdAndDelete(userAId);
    if (userBId) await User.findByIdAndDelete(userBId);
    if (streamId) await StreamAnalysis.findByIdAndDelete(streamId);
    await mongoose.disconnect();
  }
}

runProfileE2ETest().catch((err) => {
  console.error('Test failed with error:', err);
  process.exit(1);
});
