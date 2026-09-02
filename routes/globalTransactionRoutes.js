const express = require('express');
const globalTransactionRoutes = express.Router();

const {
  addTransaction,
  getTransactions,
  revenuecatWebhookHandler,
  whishWebhookHandler
} = require('../controllers/globalTransactionController');

const requireAuth = require('../middleware/requireAuth');

// Webhook route (no auth, relies on signature verification)
globalTransactionRoutes.post('/revenuecat-webhook', revenuecatWebhookHandler);
globalTransactionRoutes.get('/whish-money-webhook', whishWebhookHandler);

globalTransactionRoutes.use(requireAuth);
globalTransactionRoutes.post('/add', addTransaction);
globalTransactionRoutes.get('/getTransactions', getTransactions);

module.exports = globalTransactionRoutes;
