const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { requireAgencyAuth, requireAgencyRole } = require("../../middleware/agencyAuthMiddleware");
const { requireAdmin } = require("../../middleware/requireAdmin");

const {
  applyAgency,
  getAgencyProfile,
  getAgencyDashboard,
  inviteCreator,
  getAgencyRoster,
  getAgencyInvitations,
  cancelAgencyInvitation,
  getAgencyPerformance,
  respondAgencyInvite,
  getAdminAgencies,
  reviewAgency,
  searchCreators,
  getAgencyCommissions,
  getAgencyReferrals,
} = require("../../controllers/agency/agencyController");

// ── AGENCY APPLICATION & CREATOR CONSENT APIS ──
router.post("/apply", requireAuth, applyAgency);
router.post("/invite/respond", requireAuth, respondAgencyInvite);

// ── PROTECTED AGENCY PORTAL APIS (Requires Active Agency Membership) ──
router.get("/profile", requireAuth, requireAgencyAuth, getAgencyProfile);
router.get("/dashboard", requireAuth, requireAgencyAuth, getAgencyDashboard);
router.get("/roster", requireAuth, requireAgencyAuth, getAgencyRoster);
router.get("/invitations", requireAuth, requireAgencyAuth, getAgencyInvitations);
router.get("/creators/search", requireAuth, requireAgencyAuth, searchCreators);
router.get("/commissions", requireAuth, requireAgencyAuth, getAgencyCommissions);
router.get("/referrals", requireAuth, requireAgencyAuth, getAgencyReferrals);
router.delete(
  "/invitations/:id",
  requireAuth,
  requireAgencyAuth,
  requireAgencyRole(["owner", "manager"]),
  cancelAgencyInvitation
);
router.get("/performance", requireAuth, requireAgencyAuth, getAgencyPerformance);
router.post(
  "/invite-creator",
  requireAuth,
  requireAgencyAuth,
  requireAgencyRole(["owner", "manager"]),
  inviteCreator
);

// ── ADMIN PANEL AGENCY APIS ──
const adminAgencyRouter = express.Router();
adminAgencyRouter.get("/", requireAdmin, getAdminAgencies);
adminAgencyRouter.post("/:id/review", requireAdmin, reviewAgency);

module.exports = {
  agencyRoutes: router,
  adminAgencyRoutes: adminAgencyRouter,
};
