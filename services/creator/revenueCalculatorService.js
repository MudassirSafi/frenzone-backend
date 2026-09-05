/**
 * Server-Side Revenue & Commission Calculation Engine
 * Enforces:
 * - 60% Net Receipts Creator Payout
 * - Up to 5% Creator Referral Commission
 * - Up to 3% Agency Commission
 * - Maximum Combined Commission Cap: 8%
 */

const CREATOR_SHARE_PERCENT = 0.6; // 60%
const MAX_REFERRAL_COMMISSION_PERCENT = 0.05; // 5%
const MAX_AGENCY_COMMISSION_PERCENT = 0.03; // 3%
const MAX_COMBINED_COMMISSION_PERCENT = 0.08; // 8%

/**
 * Calculates Net Receipts base from gross revenue
 */
function calculateNetReceipts(grossAmountUSD, platformFeePercent = 0.05, taxesUSD = 0) {
  const gross = Math.max(0, Number(grossAmountUSD) || 0);
  const platformFee = gross * Math.min(Math.max(platformFeePercent, 0), 0.3);
  const netReceipts = Math.max(0, gross - platformFee - taxesUSD);
  return Number(netReceipts.toFixed(4));
}

/**
 * Calculates 60% Net Receipts Creator Payout Share
 */
function calculateCreatorEarnings(netReceiptsUSD) {
  const net = Math.max(0, Number(netReceiptsUSD) || 0);
  return Number((net * CREATOR_SHARE_PERCENT).toFixed(4));
}

/**
 * Calculates Creator Referral Commission (Up to 5%)
 */
function calculateReferralCommission(netReceiptsUSD, customPercent = MAX_REFERRAL_COMMISSION_PERCENT) {
  const net = Math.max(0, Number(netReceiptsUSD) || 0);
  const effectivePercent = Math.min(Math.max(Number(customPercent) || 0, 0), MAX_REFERRAL_COMMISSION_PERCENT);
  return Number((net * effectivePercent).toFixed(4));
}

/**
 * Calculates Agency Commission (Up to 3%)
 */
function calculateAgencyCommission(netReceiptsUSD, customPercent = MAX_AGENCY_COMMISSION_PERCENT) {
  const net = Math.max(0, Number(netReceiptsUSD) || 0);
  const effectivePercent = Math.min(Math.max(Number(customPercent) || 0, 0), MAX_AGENCY_COMMISSION_PERCENT);
  return Number((net * effectivePercent).toFixed(4));
}

/**
 * Computes full revenue breakdown and ensures combined commission cap <= 8%
 */
function computeRevenueBreakdown(grossAmountUSD) {
  const netReceipts = calculateNetReceipts(grossAmountUSD);
  const creatorShare = calculateCreatorEarnings(netReceipts);
  const referralCommission = calculateReferralCommission(netReceipts);
  const agencyCommission = calculateAgencyCommission(netReceipts);

  const totalCommissions = Number((referralCommission + agencyCommission).toFixed(4));
  const maxAllowedCommissions = Number((netReceipts * MAX_COMBINED_COMMISSION_PERCENT).toFixed(4));

  return {
    grossAmountUSD: Number(grossAmountUSD.toFixed(2)),
    netReceiptsUSD: netReceipts,
    creatorShareUSD: creatorShare,
    referralCommissionUSD: referralCommission,
    agencyCommissionUSD: agencyCommission,
    totalCommissionsUSD: totalCommissions,
    commissionCapEnforced: totalCommissions <= maxAllowedCommissions,
  };
}

module.exports = {
  calculateNetReceipts,
  calculateCreatorEarnings,
  calculateReferralCommission,
  calculateAgencyCommission,
  computeRevenueBreakdown,
  CREATOR_SHARE_PERCENT,
  MAX_COMBINED_COMMISSION_PERCENT,
};
