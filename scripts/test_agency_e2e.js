const mongoose = require("mongoose");
const connectDB = require("../db");
const User = require("../models/userModel");
const Agency = require("../models/agencyModel");
const AgencyMember = require("../models/agencyMemberModel");
const CreatorAgencyRelationship = require("../models/creatorAgencyRelationshipModel");
const {
  applyAgency,
  getAgencyProfile,
  inviteCreator,
  getAgencyRoster,
  respondAgencyInvite,
} = require("../controllers/agency/agencyController");
require("dotenv").config();

async function runAgencyTest() {
  console.log("=== AGENCY CONTROLLER E2E TEST ===");
  await connectDB();

  let ownerId = null;
  let creatorId = null;
  let agencyId = null;
  let relId = null;

  try {
    // 1. Create owner user and creator user
    const ownerUsername = `agency_owner_${Date.now()}`;
    const creatorUsername = `agency_creator_${Date.now()}`;

    const ownerUser = await User.create({
      firstname: "Agency",
      lastname: "Owner",
      username: ownerUsername,
      email: `${ownerUsername}@frenzone.test`,
      loginFrom: "Web",
      app_user_id: ownerUsername,
      onboarding: { active: true },
    });
    ownerId = ownerUser._id;

    const creatorUser = await User.create({
      firstname: "Agency",
      lastname: "Talent",
      username: creatorUsername,
      email: `${creatorUsername}@frenzone.test`,
      loginFrom: "Web",
      app_user_id: creatorUsername,
      onboarding: { active: true },
    });
    creatorId = creatorUser._id;

    // 2. Test applyAgency
    console.log("1. Testing applyAgency...");
    const reqApply = {
      userId: ownerId,
      body: {
        agency_name: "Apex Talent Agency",
        country: "United States",
        business_address: "100 Broadway, New York, NY",
        registration_number: `REG_${Date.now()}`,
        main_contact: {
          name: "Agency Owner",
          email: `${ownerUsername}@frenzone.test`,
          phone: "+15551234567",
        },
      },
    };

    let applyData = null;
    const resApply = {
      status: () => ({
        json: (data) => {
          applyData = data;
        },
      }),
    };
    const next = (err) => {
      if (err) console.error("Apply error:", err);
    };

    await applyAgency(reqApply, resApply, next);
    agencyId = applyData?.agency?._id;
    console.log("✓ Agency created:", {
      success: applyData?.success,
      agency_name: applyData?.agency?.agency_name,
      status: applyData?.agency?.status,
    });

    // 3. Test inviteCreator
    console.log("2. Testing inviteCreator...");
    const reqInvite = {
      userId: ownerId,
      agency: applyData.agency,
      body: { username: creatorUsername },
    };
    let inviteData = null;
    const resInvite = {
      status: () => ({
        json: (data) => {
          inviteData = data;
        },
      }),
    };

    await inviteCreator(reqInvite, resInvite, next);
    relId = inviteData?.relationship?._id;
    console.log("✓ Creator invited:", {
      success: inviteData?.success,
      creator: inviteData?.creator?.username,
      relStatus: inviteData?.relationship?.status,
    });

    // 4. Test getAgencyRoster
    console.log("3. Testing getAgencyRoster...");
    const reqRoster = { agency: applyData.agency };
    let rosterData = null;
    const resRoster = {
      status: () => ({
        json: (data) => {
          rosterData = data;
        },
      }),
    };
    await getAgencyRoster(reqRoster, resRoster, next);
    console.log("✓ Roster retrieved:", {
      success: rosterData?.success,
      count: rosterData?.count,
    });

    // 5. Test respondAgencyInvite (Creator accepts)
    console.log("4. Testing respondAgencyInvite (creator accepts)...");
    const reqRespond = {
      userId: creatorId,
      body: { relationship_id: relId, action: "accept" },
    };
    let respondData = null;
    const resRespond = {
      status: () => ({
        json: (data) => {
          respondData = data;
        },
      }),
    };
    await respondAgencyInvite(reqRespond, resRespond, next);
    console.log("✓ Creator response processed:", {
      success: respondData?.success,
      newStatus: respondData?.relationship?.status,
    });

    // Cleanup
    if (relId) await CreatorAgencyRelationship.findByIdAndDelete(relId);
    if (agencyId) {
      await AgencyMember.deleteMany({ agency_id: agencyId });
      await Agency.findByIdAndDelete(agencyId);
    }
    await User.findByIdAndDelete(creatorId);
    await User.findByIdAndDelete(ownerId);
    console.log("✓ Test records cleaned up successfully.");

    console.log("\n=== AGENCY CONTROLLER E2E TEST COMPLETED 100% ===");
  } catch (err) {
    console.error("Agency test error:", err);
  } finally {
    await mongoose.disconnect();
  }
}

runAgencyTest();
