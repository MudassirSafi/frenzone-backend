const admin = require("firebase-admin");
const path = require("path");
const fs = require("fs");

// Check potential locations for serviceAccountKey.json
const possiblePaths = [
  process.env.FIREBASE_SERVICE_ACCOUNT_PATH,
  path.resolve(__dirname, "../../serviceAccountKey.json"),
  path.resolve(__dirname, "../serviceAccountKey.json"),
  path.resolve(__dirname, "../firebaseFrenzoneNew.json"),
].filter(Boolean);

let serviceAccount = null;
let resolvedPath = null;

for (const p of possiblePaths) {
  if (fs.existsSync(p)) {
    try {
      serviceAccount = require(p);
      resolvedPath = p;
      break;
    } catch (e) {
      console.warn(`[FirebaseAdmin] Failed to load credentials from ${p}:`, e.message);
    }
  }
}

if (!serviceAccount) {
  console.error("[FirebaseAdmin] ERROR: Could not find or load serviceAccountKey.json in any expected path!");
} else {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.cert(serviceAccount),
      projectId: serviceAccount.project_id || "friendzone-f7b12",
    });
    console.log(`[FirebaseAdmin] Initialized successfully with project: ${serviceAccount.project_id} (from ${path.basename(resolvedPath)})`);
  }
}

module.exports = admin;
