const mongoose = require("mongoose");
const Gift = require("../models/giftModel");

require("dotenv").config();

const giftNamesByPrice = [
  [200, "Kiss Kiss"],
  [200, "DJ Party"],
  [300, "Splash"],
  [400, "Oud Night"],
  [400, "Love Wheel"],
  [500, "Magic Kingdom"],
  [600, "Vespa Ride"],
  [1000, "Crown King"],
  [1000, "Treasure Box"],
  [1000, "Arabic Coffee"],
  [1500, "Golden Bullet"],
  [2000, "Royal Blade"],
  [4000, "Money Rain"],
  [6000, "Dark Rider"],
  [7000, "Royal Palace"],
  [9800, "Crystal Castle"],
  [10000, "Ferrari Rush"],
  [15000, "Golden Helicopter"],
  [38000, "Black Edition"],
  [40000, "Ocean Queen"],
  [40000, "Ice Racer"],
  [40000, "Whale of Future"],
  [45000, "Volcano King"],
  [48000, "Fire Phoenix"],
  [48000, "Pharaoh's Guardian"],
  [52000, "Peacock King"],
  [65000, "Sky Emperor"],
  [68800, "Flame Tiger"],
  [70000, "Neon Hypercar"],
  [75000, "Ocean Conqueror"],
];

async function updateGiftNames() {
  await mongoose.connect(process.env.DATABASE_URL);

  const gifts = await Gift.find({})
    .sort({ price: 1, createdAt: 1, _id: 1 })
    .select("_id price name")
    .lean();

  if (gifts.length < giftNamesByPrice.length) {
    throw new Error(
      `Expected at least ${giftNamesByPrice.length} gifts, found ${gifts.length}.`,
    );
  }

  const mismatches = [];
  for (let i = 0; i < giftNamesByPrice.length; i += 1) {
    const [expectedPrice, name] = giftNamesByPrice[i];
    const gift = gifts[i];

    if (gift.price !== expectedPrice) {
      mismatches.push({
        index: i + 1,
        giftId: gift._id.toString(),
        expectedPrice,
        actualPrice: gift.price,
        name,
      });
    }
  }

  if (mismatches.length > 0) {
    console.error("Gift price/order mismatch. No gifts were updated.");
    console.table(mismatches);
    process.exitCode = 1;
    return;
  }

  const updates = giftNamesByPrice.map(([, name], index) => ({
    updateOne: {
      filter: { _id: gifts[index]._id },
      update: { $set: { name } },
    },
  }));

  const result = await Gift.bulkWrite(updates);
  console.log(`Updated ${result.modifiedCount} gift names.`);
}

updateGiftNames()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
