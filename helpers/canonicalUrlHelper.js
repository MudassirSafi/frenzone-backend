/**
 * Canonical URL Helper for Environment-Aware Referral URLs
 * 
 * Local environment: http://localhost:3000/signup?ref={CODE}
 * Production environment: https://frenzone.live/signup?ref={CODE}
 * 
 * Safety: NEVER exposes localhost in production.
 */

function getCanonicalFrontendUrl(req) {
  const isProduction = process.env.NODE_ENV === "production";
  const envUrl = (process.env.FRONTEND_URL || process.env.WEB_URL || "").trim().replace(/\/+$/, "");

  if (isProduction) {
    // In production, strictly reject any localhost or 127.0.0.1
    if (envUrl && !envUrl.includes("localhost") && !envUrl.includes("127.0.0.1")) {
      return envUrl;
    }
    // Check request origin if it matches production domain
    const origin = (req?.headers?.origin || req?.headers?.referer || "").trim();
    if (origin) {
      try {
        const parsed = new URL(origin);
        if (parsed.hostname === "frenzone.live" || parsed.hostname.endsWith(".frenzone.live")) {
          return parsed.origin;
        }
      } catch {}
    }
    return "https://frenzone.live";
  }

  // Development / Local environment:
  if (envUrl) {
    return envUrl;
  }

  const reqOrigin = (req?.headers?.origin || req?.headers?.referer || "").trim();
  if (reqOrigin && !reqOrigin.includes(":5000")) {
    try {
      const parsed = new URL(reqOrigin);
      if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
        return parsed.origin;
      }
    } catch {}
  }

  return "http://localhost:3000";
}

function buildCanonicalReferralUrl(referralCode, req) {
  if (!referralCode) return "";
  const baseUrl = getCanonicalFrontendUrl(req);
  return `${baseUrl}/signup?ref=${encodeURIComponent(String(referralCode).trim())}`;
}

module.exports = {
  getCanonicalFrontendUrl,
  buildCanonicalReferralUrl,
};
