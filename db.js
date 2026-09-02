const dns = require("dns");
const mongoose = require("mongoose");

require("dotenv").config();

dns.setDefaultResultOrder("ipv4first");

const DNS_SERVERS = (process.env.DNS_SERVERS || "8.8.8.8,1.1.1.1")
  .split(",")
  .map((server) => server.trim())
  .filter(Boolean);

if (DNS_SERVERS.length > 0) {
  dns.setServers(DNS_SERVERS);
}

function getDatabaseUrl() {
  const databaseUrl = process.env.DATABASE_URL || "mongodb://127.0.0.1:27017/frenzone";

  const trimmedUrl = databaseUrl.trim().replace(/^['"]|['"]$/g, "");

  if (!/^mongodb(\+srv)?:\/\//.test(trimmedUrl)) {
    throw new Error("DATABASE_URL must start with mongodb+srv:// or mongodb://");
  }

  return trimmedUrl;
}

async function connectDB() {
  try {
    const databaseUrl = getDatabaseUrl();

    await mongoose.connect(databaseUrl, {
      serverSelectionTimeoutMS: 10000,
    });

    console.log("Connected to MongoDB");
  } catch (error) {
    console.error("MongoDB connection failed:", error.message);

    if (error.code === "ECONNREFUSED" && error.syscall === "querySrv") {
      console.error(
        "DNS SRV lookup was refused. Try a different network/DNS, set DNS_SERVERS=8.8.8.8,1.1.1.1, or use Atlas' non-SRV mongodb:// connection string."
      );
    }

    throw error;
  }
}

module.exports = connectDB;
