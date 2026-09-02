const express = require("express");
const router = express.Router();
const requireAuth = require("../../middleware/requireAuth");
const { requireAdmin } = require("../../middleware/requireAdmin");

const {
  submitApplication,
  getApplicationStatus,
  getAdminApplications,
  reviewApplication,
} = require("../../controllers/creator/creatorApplicationController");

// ── CREATOR PORTAL APIS (Protected by User JWT) ──
router.post("/", requireAuth, submitApplication);
router.get("/status", requireAuth, getApplicationStatus);

// ── ADMIN PANEL APIS (Protected by Admin JWT) ──
const adminRouter = express.Router();
adminRouter.get("/applications", requireAdmin, getAdminApplications);
adminRouter.post("/applications/:id/review", requireAdmin, reviewApplication);

module.exports = {
  creatorApplicationRoutes: router,
  adminCreatorAgencyRoutes: adminRouter,
};
