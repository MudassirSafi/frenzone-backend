const LiveGoal = require('../models/liveGoalModel');
const User = require("../models/userModel");
const { getPicUrl } = require("./userController");
const { aws } = require("../helpers/otherHelpers");
const cron = require('node-cron');



const createLiveGoal = async (req, res) => {
    try {
        const { giftIds, hostId } = req.body;

        if (!Array.isArray(giftIds) || giftIds.length !== 8) {
            return res.status(400).json({ error: 'You must send exactly 8 giftIds' });
        }

        const now = new Date();

        const existing = await LiveGoal.findOne({
            hostId,
            status: 'pending',
            expiresAt: { $gt: now }
        });
        if (existing) {
            return res.status(409).json({
                error: 'An active live goal already exists',
                goal: existing
            });
        }

        const expiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000);
        const goal = await LiveGoal.create({ hostId, giftIds, expiresAt });

        return res.status(201).json({
            message: 'Live goal set',
            goal
        });
    } catch (err) {
        console.error('createLiveGoal error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};

const updateLiveGoal = async (req, res) => {
    try {
        const { giftIds, hostId } = req.body;

        if (!Array.isArray(giftIds) || giftIds.length !== 8) {
            return res.status(400).json({ error: 'You must send exactly 8 giftIds' });
        }

        if (!hostId || hostId.toString() !== req.authUserId?.toString()) {
            return res.status(403).json({ error: 'You can only update your own live goal' });
        }

        const goal = await LiveGoal.findOneAndUpdate(
            {
                hostId,
                status: 'pending',
                expiresAt: { $gt: new Date() }
            },
            { $set: { giftIds } },
            { new: true, runValidators: true }
        );

        if (!goal) {
            return res.status(404).json({ error: 'No active live goal found' });
        }

        return res.json({
            message: 'Live goal gifts updated',
            goal
        });
    } catch (err) {
        console.error('updateLiveGoal error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};


const getLiveGoal = async (req, res) => {
    try {
        const { userId } = req.params;
        const now = new Date();

        // 1) Fetch the active goal
        const goalDoc = await LiveGoal.findOne({
            hostId: userId,
            expiresAt: { $gt: now }
        }).lean();

        if (!goalDoc) {
            return res.status(404).json({ error: 'No active live goal' });
        }
        console.log("I am printing goalDoc", goalDoc);
        await LiveGoal.populate(goalDoc, [
            { path: 'giftIds', select: 'name thumbnail price isSvga giftFile gif' },
            { path: 'receivedGiftIds.giftId', select: 'name thumbnail price isSvga giftFile gif' }
        ]);

        // 3a) Transformer for target gifts
        const transformGift = async (gift) => {
            const fileKey = gift.giftFile || gift.gif || '';
            const giftFile = fileKey ? await aws.getLinkFromAWS(fileKey) : '';
            const thumbnail = gift.thumbnail ? await aws.getLinkFromAWS(gift.thumbnail) : '';

            return {
                id: gift._id.toString(),
                name: gift.name || '',
                price: gift.price,
                isSvga: gift.isSvga,
                giftFile,
                thumbnail
            };
        };

        const transformReceived = async (entry) => {
            const giftDoc = entry.giftId;    // populated above
            const senderId = entry.senderId;  // still an ObjectId

            // resolve gift URLs same as above
            const fileKey = giftDoc.giftFile || giftDoc.gif || '';
            const giftFile = fileKey ? await aws.getLinkFromAWS(fileKey) : '';
            const thumbnail = giftDoc.thumbnail ? await aws.getLinkFromAWS(giftDoc.thumbnail) : '';

            // resolve sender’s profile image
            const senderImage = await getPicUrl(senderId);

            return {
                gift: {
                    id: giftDoc._id.toString(),
                    name: giftDoc.name || '',
                    price: giftDoc.price,
                    isSvga: giftDoc.isSvga,
                    giftFile,
                    thumbnail
                },
                sender: {
                    id: senderId.toString(),
                    profileImage: senderImage
                }
            };
        };

        const [giftList, receivedList] = await Promise.all([
            Promise.all(goalDoc.giftIds.map(transformGift)),
            Promise.all(goalDoc.receivedGiftIds.map(transformReceived))
        ]);


        return res.json({
            goal: {
                status: goalDoc.status,
                createdAt: goalDoc.createdAt,
                expiresAt: goalDoc.expiresAt,
                giftIds: giftList,
                receivedGifts: receivedList
            }
        });
    } catch (err) {
        console.error('getLiveGoal error:', err);
        return res.status(500).json({ error: 'Server error' });
    }
};


cron.schedule('* * * * *', async () => {
    try {
        const now = new Date();
        const cutoff = new Date(now.getTime() - 1 * 60 * 1000);
        const newExpiresAt = new Date(now.getTime() + 48 * 60 * 60 * 1000); // 48 hours from now

        await LiveGoal.updateMany(
            { expiresAt: { $lt: cutoff } },
            {
                $set: {
                    status: 'pending',
                    receivedGiftIds: [],
                    expiresAt: newExpiresAt,
                    createdAt: now
                }
            }
        );

        await User.updateMany(
            {
                profileTitleExpiresAt: { $lt: cutoff },
                profileTitle: { $ne: null }
            },
            {
                $set: {
                    profileTitle: null,
                    profileTitleExpiresAt: null
                }
            }
        );
    } catch (err) {
        console.error('❌ Cron job failed:', err);
    }
});


module.exports = {
    createLiveGoal,
    updateLiveGoal,
    getLiveGoal
};
