const Club = require("../models/clubModel");
const Chat = require("../models/chatModel");
const MessageRequest = require("../models/messageRequestModel");
const Thread = require("../models/threadModel");
const User = require("../models/userModel");

const MESSAGE_REQUEST_COOLDOWN_DAYS = 30;
const MESSAGE_REQUEST_COOLDOWN_MS =
  MESSAGE_REQUEST_COOLDOWN_DAYS * 24 * 60 * 60 * 1000;

const id = value => value?.toString?.() || "";

function cooldownCutoff(now = new Date()) {
  return new Date(now.getTime() - MESSAGE_REQUEST_COOLDOWN_MS);
}

async function removeExpiredMessageRequestCooldown(ownerId, requesterId) {
  await MessageRequest.deleteOne({
    ownerid: ownerId,
    requesterid: requesterId,
    accepted: false,
    declined: true,
    declinedAt: { $lte: cooldownCutoff() },
  });
}

// Club owners live in `userid` and are intentionally not duplicated in
// `members`. Both the owner and accepted members therefore count when
// determining whether two users share a club.
async function usersShareClub(senderId, receiverId) {
  if (!senderId || !receiverId) return false;
  return !!(await Club.exists({
    privateChatRooms: true,
    $and: [
      { $or: [{ userid: senderId }, { members: senderId }] },
      { $or: [{ userid: receiverId }, { members: receiverId }] },
    ],
  }));
}

async function isConversationMuted(userId, otherUserId) {
  if (!userId || !otherUserId) return false;
  return !!(await Thread.exists({
    $or: [
      { participantOneId: userId, participantTwoId: otherUserId },
      { participantOneId: otherUserId, participantTwoId: userId },
    ],
    mutedBy: userId,
  }));
}

async function getMessageAccess(senderOrId, receiverOrId) {
  const sender = senderOrId?._id
    ? senderOrId
    : await User.findById(senderOrId).select("_id blocked").lean();
  const receiver = receiverOrId?._id
    ? receiverOrId
    : await User.findById(receiverOrId)
        .select("_id acceptMessages blocked")
        .lean();

  if (!sender || !receiver) {
    const error = new Error("Sender or receiver not found");
    error.statusCode = 404;
    throw error;
  }

  const blocked =
    (receiver.blocked || []).some(userId => id(userId) === id(sender._id)) ||
    (sender.blocked || []).some(userId => id(userId) === id(receiver._id));
  if (blocked) {
    return {
      canSend: false,
      isSharedClubMember: false,
      requiresApproval: false,
      remainingMessages: 0,
      requestAccepted: false,
      blocked: true,
    };
  }

  await removeExpiredMessageRequestCooldown(receiver._id, sender._id);

  const acceptedRequest = await MessageRequest.exists({
    accepted: true,
    $or: [
      { ownerid: receiver._id, requesterid: sender._id },
      { ownerid: sender._id, requesterid: receiver._id },
    ],
  });
  const receiverHasReplied = await Chat.exists({
    senderid: receiver._id,
    receiverid: sender._id,
  });
  if (acceptedRequest || receiverHasReplied) {
    return {
      canSend: true,
      isSharedClubMember: false,
      requiresApproval: false,
      remainingMessages: null,
      requestAccepted: true,
    };
  }

  const request = await MessageRequest.findOne({
    ownerid: receiver._id,
    requesterid: sender._id,
    accepted: false,
  }).lean();

  if (
    request?.declined === true &&
    request.declinedAt &&
    request.declinedAt > cooldownCutoff()
  ) {
    return {
      canSend: false,
      isSharedClubMember: false,
      requiresApproval: false,
      remainingMessages: 0,
      requestAccepted: false,
      messageRequestCooldown: true,
      cooldownUntil: new Date(
        request.declinedAt.getTime() + MESSAGE_REQUEST_COOLDOWN_MS,
      ),
    };
  }

  if (request && request.declined !== true) {
    return {
      canSend: false,
      isSharedClubMember: false,
      requiresApproval: true,
      remainingMessages: 0,
      requestAccepted: false,
    };
  }

  const isSharedClubMember = await usersShareClub(sender._id, receiver._id);
  if (isSharedClubMember) {
    return {
      canSend: true,
      isSharedClubMember: true,
      requiresApproval: false,
      remainingMessages: null,
      requestAccepted: false,
    };
  }

  if (receiver.acceptMessages === false) {
    return {
      canSend: false,
      isSharedClubMember: false,
      requiresApproval: false,
      remainingMessages: 0,
      requestAccepted: false,
    };
  }

  return {
    canSend: true,
    isSharedClubMember: false,
    requiresApproval: true,
    remainingMessages: 1,
    requestAccepted: false,
  };
}

// Atomically reserves the single allowed request message. The unique
// owner/requester index prevents multi-device and direct-API bypasses.
async function authorizeMessageSend(senderOrId, receiverOrId) {
  const senderId = senderOrId?._id || senderOrId;
  const receiverId = receiverOrId?._id || receiverOrId;
  const sender = senderOrId?._id
    ? senderOrId
    : await User.findById(senderId).select("_id blocked").lean();
  const receiver = receiverOrId?._id
    ? receiverOrId
    : await User.findById(receiverId)
        .select("_id blocked acceptMessages")
        .lean();

  const blocked =
    !sender ||
    !receiver ||
    (receiver.blocked || []).some(userId => id(userId) === id(senderId)) ||
    (sender.blocked || []).some(userId => id(userId) === id(receiverId));
  if (blocked) {
    return {
      canSend: false,
      isSharedClubMember: false,
      requiresApproval: false,
      remainingMessages: 0,
      requestAccepted: false,
      blocked: true,
    };
  }

  await removeExpiredMessageRequestCooldown(receiverId, senderId);

  // Replying is an implicit acceptance.
  await MessageRequest.findOneAndUpdate(
    {
      ownerid: senderId,
      requesterid: receiverId,
      accepted: false,
      declined: { $ne: true },
    },
    { accepted: true, acceptedAt: new Date(), declined: false },
  );

  const access = await getMessageAccess(sender, receiver);
  if (!access.canSend || !access.requiresApproval) return access;

  try {
    await MessageRequest.create({
      ownerid: receiverId,
      requesterid: senderId,
      accepted: false,
    });
    return access;
  } catch (error) {
    if (error?.code === 11000) {
      return { ...access, canSend: false, remainingMessages: 0 };
    }
    throw error;
  }
}

module.exports = {
  authorizeMessageSend,
  getMessageAccess,
  isConversationMuted,
  usersShareClub,
  MESSAGE_REQUEST_COOLDOWN_DAYS,
  MESSAGE_REQUEST_COOLDOWN_MS,
};
