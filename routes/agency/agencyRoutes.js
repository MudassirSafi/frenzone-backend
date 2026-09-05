const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { requireAgencyAuth, requireAgencyRole } = require("../../middleware/agencyAuthMiddleware");
const { requireAdmin } = require("../../middleware/requireAdmin");

const {
  applyAgency,
  getAgencyProfile,
  inviteCreator,
  getAgencyRoster,
  respondAgencyInvite,
  getAdminAgencies,
  reviewAgency,
} = require("../../controllers/agency/agencyController");

// ── AGENCY APPLICATION & CREATOR CONSENT APIS ──
router.post("/apply", requireAuth, applyAgency);
router.post("/invite/respond", requireAuth, respondAgencyInvite);

// ── PROTECTED AGENCY PORTAL APIS (Requires Active Agency Membership) ──
router.get("/profile", requireAuth, requireAgencyAuth, getAgencyProfile);
router.get("/roster", requireAuth, requireAgencyAuth, getAgencyRoster);
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
