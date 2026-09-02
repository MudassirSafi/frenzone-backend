# VoiceMeet & Space-X Voice Chat API Sequence Documentation

## Overview

This document describes the complete sequence of APIs and socket events for VoiceMeet and Space-X style voice chat functionality. It provides a comprehensive guide for understanding the flow of operations, the purpose of each API, and the real-time socket events that accompany them.

## Base URL

```
https://coherent-internal-tahr.ngrok-free.app
```

---

## Table of Contents

1. [VoiceMeet Creation & Management](#voicemeet-creation--management)
2. [Space-X Voice Chat Workflow](#space-x-voice-chat-workflow)
3. [Socket Events Reference](#socket-events-reference)
4. [Complete API Sequence Examples](#complete-api-sequence-examples)
5. [Error Handling](#error-handling)

---

## VoiceMeet Creation & Management

### 1. Create VoiceMeet

**Endpoint:** `POST /voicemeet/createVoiceMeet`

**Purpose:** Creates a new voice meet for a club. If a voice meet already exists for the club, the user joins the existing one.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "clubid": "club_id_here",
  "members": ["member1_id", "member2_id"]
}
```

**Response:**
```json
{
  "_id": "voicemeet_id",
  "channelName": "random_channel_name",
  "token": "agora_token",
  "username": "host_username",
  "profilePic": "profile_picture_url",
  "usersData": [
    {
      "username": "user1",
      "profilePicture": "url",
      "admin": true
    }
  ]
}
```

**Socket Events Emitted:**
- `newUserJoined` - Broadcasted to all existing members when a new user joins

**Sequence:**
1. Check if voice meet exists for club
2. If exists: Use existing channelName and token, notify existing members
3. If not: Create new voice meet with random channelName and generate token
4. Send notifications to members
5. Add user to members list
6. Return voice meet details

---

### 2. Join Stream/VoiceMeet

**Endpoint:** `PATCH /voicemeet/joinStream`

**Purpose:** Allows a user to join an existing voice meet/stream.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "streamid": "voicemeet_id_here"
}
```

**Response:**
```json
{
  "_id": "voicemeet_id",
  "channelName": "channel_name",
  "token": "agora_token",
  "members": [
    {
      "_id": "user_id",
      "username": "username",
      "profilePicture": "url"
    }
  ]
}
```

**Socket Events Emitted:**
- `memberCount` - Broadcasted to all members with updated count
- `newUserJoined` - Broadcasted to all members when user joins

**Sequence:**
1. Validate user and stream
2. Check if user is blocked
3. Add user to members list if not already present
4. Update user's isOnCall status
5. Emit socket events to all members
6. Return stream details

---

### 3. Leave VoiceMeet

**Endpoint:** `PATCH /voicemeet/leaveVoiceMeet`

**Purpose:** Allows a user to leave a voice meet.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "clubid": "club_id_here"
}
```

**Response:**
```json
{
  "_id": "voicemeet_id",
  "message": "You left the voice call"
}
```

**Socket Events Emitted:**
- None (user leaves silently)

**Sequence:**
1. Validate user and club
2. Find voice meet for club
3. Remove user from members list
4. Reset activities for user
5. Update user's isOnCall status to false

---

### 4. Delete Stream

**Endpoint:** `DELETE /voicemeet/deleteStream`

**Purpose:** Deletes a voice meet/stream (typically called by host).

**Request Body:**
```json
{
  "streamid": "voicemeet_id_here"
}
```

**Response:**
```json
{
  "message": "Stream Deleted"
}
```

**Socket Events Emitted:**
- `streamended` - Broadcasted to all members before deletion

**Sequence:**
1. Find stream
2. Emit streamended event to all members
3. Delete stream from database
4. Update host's isOnCall status
5. Delete related activities

---

## Space-X Voice Chat Workflow

### Listener Workflow

#### 1. Request to Speak

**Endpoint:** `POST /voicemeet/requestToSpeak`

**Purpose:** Allows a listener to request permission to become a speaker.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "voicemeetid": "voicemeet_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Speaking request sent"
}
```

**Socket Events Emitted:**
- `speakingRequest` - Broadcasted to all members (notifies host/moderators)

**Sequence:**
1. Validate user and voice meet
2. Check if voice meet is active
3. Check if user is banned
4. Check if user is already a speaker
5. Check if request already exists
6. Add request to speakingRequests array
7. Send notifications to host/moderators/co-hosts
8. Emit socket event to all members

---

#### 2. Get Speaking Requests

**Endpoint:** `GET /voicemeet/getSpeakingRequests/:userid?voicemeetid=voicemeet_id`

**Purpose:** Retrieves all pending speaking requests (host/moderator/co-host only).

**Query Parameters:**
- `voicemeetid` - Voice meet ID

**Response:**
```json
{
  "success": true,
  "requests": [
    {
      "userid": "user_id",
      "username": "username",
      "profilePicture": "url",
      "requestedAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

**Socket Events Emitted:**
- None

---

### Host/Moderator Workflow

#### 3. Approve Speaking Request

**Endpoint:** `POST /voicemeet/approveSpeakingRequest`

**Purpose:** Host, Moderator, or Co-Host approves a listener's request to speak.

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "requesterid": "requester_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Speaking request approved"
}
```

**Socket Events Emitted:**
- `speakingRequestApproved` - Broadcasted to all members

**Sequence:**
1. Validate permissions (host/moderator/co-host)
2. Remove request from speakingRequests
3. Add user to speakers array
4. Remove from listeners if present
5. Send notification to requester
6. Emit socket event to all members

---

#### 4. Deny Speaking Request

**Endpoint:** `POST /voicemeet/denySpeakingRequest`

**Purpose:** Host, Moderator, or Co-Host denies a listener's request to speak.

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "requesterid": "requester_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Speaking request denied"
}
```

**Socket Events Emitted:**
- `speakingRequestDenied` - Broadcasted to all members

**Sequence:**
1. Validate permissions
2. Remove request from speakingRequests
3. Send notification to requester
4. Emit socket event to all members

---

#### 5. Mute Speaker

**Endpoint:** `POST /voicemeet/muteSpeaker`

**Purpose:** Host, Moderator, or Co-Host mutes a speaker (hard or soft mute).

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id",
  "muteType": "hard" // or "soft"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User hard muted successfully"
}
```

**Socket Events Emitted:**
- `userMuted` - Broadcasted to all members (includes muteType)

**Mute Types:**
- **Hard Mute:** User cannot unmute themselves
- **Soft Mute:** User can unmute themselves

**Sequence:**
1. Validate permissions
2. Add user to appropriate mute list (hardMuted or softMuted)
3. Remove from other mute list if present
4. Emit socket event to all members

---

#### 6. Unmute Speaker

**Endpoint:** `POST /voicemeet/unmuteSpeaker`

**Purpose:** Host, Moderator, or Co-Host unmutes a speaker. Soft-muted users can also unmute themselves.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User unmuted successfully"
}
```

**Socket Events Emitted:**
- `userUnmuted` - Broadcasted to all members

**Sequence:**
1. Validate permissions OR check if self-unmute (soft muted only)
2. Remove user from both mute lists
3. Emit socket event to all members

---

#### 7. Move to Listener

**Endpoint:** `POST /voicemeet/moveToListener`

**Purpose:** Host, Moderator, or Co-Host moves a speaker back to listener status.

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User moved to listener"
}
```

**Socket Events Emitted:**
- `movedToListener` - Broadcasted to all members

**Sequence:**
1. Validate permissions
2. Remove user from speakers array
3. Add to listeners array if not present
4. Remove from mute lists
5. Emit socket event to all members

---

### Role Management

#### 8. Assign Co-Host

**Endpoint:** `POST /voicemeet/assignCoHost`

**Purpose:** Host assigns a co-host (host only).

**Request Body:**
```json
{
  "userid": "host_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Co-host assigned successfully"
}
```

**Socket Events Emitted:**
- `coHostAssigned` - Broadcasted to all members

**Co-Host Permissions:**
- Can approve/deny speaking requests
- Can mute/unmute users
- Can assign moderators
- Can move users to listener
- Can remove/ban users
- **Cannot** end the voice chat

---

#### 9. Assign Moderator

**Endpoint:** `POST /voicemeet/assignModerator`

**Purpose:** Host or Co-Host assigns a moderator.

**Request Body:**
```json
{
  "userid": "host/cohost_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Moderator assigned successfully"
}
```

**Socket Events Emitted:**
- `moderatorAssigned` - Broadcasted to all members

**Moderator Permissions:**
- Can approve/deny speaking requests
- Can mute/unmute users
- Can move users to listener
- Can remove/ban users
- **Cannot** assign co-hosts or moderators
- **Cannot** end the voice chat

---

### User Management

#### 10. Remove from Space

**Endpoint:** `POST /voicemeet/removeFromSpace`

**Purpose:** Host, Moderator, or Co-Host removes a user from the voice chat.

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User removed from space"
}
```

**Socket Events Emitted:**
- `removedFromSpace` - Broadcasted to all members AND sent to removed user

**Sequence:**
1. Validate permissions
2. Remove user from all lists (members, speakers, listeners, requests, muted)
3. Update user's isOnCall status
4. Emit socket event to all members and removed user

---

#### 11. Ban User

**Endpoint:** `POST /voicemeet/banUser`

**Purpose:** Host, Moderator, or Co-Host permanently bans a user from the voice chat.

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User banned successfully"
}
```

**Socket Events Emitted:**
- `userBanned` - Broadcasted to all members AND sent to banned user

**Sequence:**
1. Validate permissions
2. Add user to bannedUsers array
3. Remove from all other lists
4. Update user's isOnCall status
5. Emit socket event to all members and banned user

---

#### 12. Report User in Space

**Endpoint:** `POST /voicemeet/reportUserInSpace`

**Purpose:** Any user can report another user for inappropriate behavior.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "voicemeetid": "voicemeet_id_here",
  "reportedUserid": "reported_user_id",
  "reason": "Report reason",
  "reportType": "harassment" // nudity, harassment, hate_speech, scam, underage, spam
}
```

**Response:**
```json
{
  "success": true,
  "message": "User reported successfully"
}
```

**Socket Events Emitted:**
- `userReported` - Broadcasted to all members

**Valid Report Types:**
- `nudity`
- `harassment`
- `hate_speech`
- `scam`
- `underage`
- `spam`

---

### Room Features

#### 13. React with Emoji

**Endpoint:** `POST /voicemeet/reactWithEmoji`

**Purpose:** Any user can react with an emoji during the voice chat.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "voicemeetid": "voicemeet_id_here",
  "emoji": "👍"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Reaction sent"
}
```

**Socket Events Emitted:**
- `emojiReaction` - Broadcasted to all members

---

#### 14. Share Room

**Endpoint:** `POST /voicemeet/shareRoom`

**Purpose:** Get shareable information about the voice chat room.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "voicemeetid": "voicemeet_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "shareData": {
    "voicemeetid": "voicemeet_id",
    "title": "Voice Chat",
    "topic": "",
    "host": {
      "username": "host_username",
      "profilePicture": "url"
    }
  },
  "message": "Room share data retrieved"
}
```

**Socket Events Emitted:**
- None

---

#### 15. End Voice Chat

**Endpoint:** `POST /voicemeet/endVoiceChat`

**Purpose:** Host ends the voice chat and generates a summary (host only).

**Request Body:**
```json
{
  "userid": "host_user_id",
  "voicemeetid": "voicemeet_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Voice chat ended",
  "summary": {
    "totalListeners": 50,
    "maxConcurrentListeners": 75,
    "activeSpeakers": 5,
    "duration": 3600
  }
}
```

**Socket Events Emitted:**
- `voiceChatEnded` - Broadcasted to all members with summary

**Sequence:**
1. Validate host permission
2. Calculate summary statistics
3. Update voice meet (isActive = false, endedAt, summary)
4. Update all members' isOnCall status
5. Emit socket event to all members

---

#### 16. Pin Message

**Endpoint:** `POST /voicemeet/pinMessage`

**Purpose:** Host, Moderator, or Co-Host pins a message (placeholder for future chat feature).

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "messageid": "message_id_here"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Message pinned successfully"
}
```

**Socket Events Emitted:**
- `messagePinned` - Broadcasted to all members

---

## Socket Events Reference

### Client → Server Events

These events should be emitted by the client (if needed):

- `joinVoiceChat` - Join a voice chat room (optional, handled by API)
- `leaveVoiceChat` - Leave a voice chat room (optional, handled by API)

### Server → Client Events

All socket events are broadcasted to **ALL members** of the voice meet for real-time synchronization.

#### User Status Events

| Event | Description | Payload |
|-------|-------------|---------|
| `newUserJoined` | New user joined the room | `{ username, profilePicture }` |
| `userKicked` | User was kicked from the room | `{ _id, username, profilePicture }` |
| `userBanned` | User was banned from the room | `{ voicemeetid, targetUserid, targetUser, bannedBy }` |
| `removedFromSpace` | User was removed from space | `{ voicemeetid, targetUserid, targetUser, removedBy }` |
| `memberCount` | Updated member count | `{ memberCount }` |
| `streamended` | Stream/voice meet ended | `{ streamid }` |

#### Speaking Events

| Event | Description | Payload |
|-------|-------------|---------|
| `speakingRequest` | New speaking request | `{ voicemeetid, requester }` |
| `speakingRequestApproved` | Speaking request approved | `{ voicemeetid, requesterid, requester }` |
| `speakingRequestDenied` | Speaking request denied | `{ voicemeetid, requesterid, requester }` |
| `movedToListener` | User moved to listener | `{ voicemeetid, targetUserid, targetUser, movedBy }` |

#### Mute Events

| Event | Description | Payload |
|-------|-------------|---------|
| `userMuted` | User was muted | `{ voicemeetid, targetUserid, targetUser, muteType, mutedBy }` |
| `userUnmuted` | User was unmuted | `{ voicemeetid, targetUserid, targetUser, unmutedBy }` |

#### Moderation Events

| Event | Description | Payload |
|-------|-------------|---------|
| `coHostAssigned` | User assigned as co-host | `{ voicemeetid, targetUserid, targetUser, assignedBy }` |
| `moderatorAssigned` | User assigned as moderator | `{ voicemeetid, targetUserid, targetUser, assignedBy }` |

#### Room Events

| Event | Description | Payload |
|-------|-------------|---------|
| `voiceChatEnded` | Voice chat ended | `{ voicemeetid, summary }` |
| `emojiReaction` | Emoji reaction from user | `{ userid, username, profilePicture, emoji, voicemeetid }` |
| `userReported` | User was reported | `{ voicemeetid, reportedUserid, reportedUser, reportedBy, reportType, reason }` |
| `messagePinned` | Message was pinned | `{ voicemeetid, messageid, pinnedBy }` |

---

## Complete API Sequence Examples

### Example 1: Complete Voice Chat Session

```
1. Host creates voice meet
   POST /voicemeet/createVoiceMeet
   → Socket: newUserJoined (to existing members if any)

2. Users join the voice meet
   PATCH /voicemeet/joinStream
   → Socket: memberCount, newUserJoined

3. Listeners request to speak
   POST /voicemeet/requestToSpeak
   → Socket: speakingRequest

4. Host approves requests
   POST /voicemeet/approveSpeakingRequest
   → Socket: speakingRequestApproved

5. Host assigns co-host
   POST /voicemeet/assignCoHost
   → Socket: coHostAssigned

6. Co-host assigns moderator
   POST /voicemeet/assignModerator
   → Socket: moderatorAssigned

7. Moderator mutes a speaker
   POST /voicemeet/muteSpeaker
   → Socket: userMuted

8. Users react with emojis
   POST /voicemeet/reactWithEmoji
   → Socket: emojiReaction

9. Host ends the voice chat
   POST /voicemeet/endVoiceChat
   → Socket: voiceChatEnded
```

### Example 2: Moderation Workflow

```
1. User reports another user
   POST /voicemeet/reportUserInSpace
   → Socket: userReported

2. Moderator moves user to listener
   POST /voicemeet/moveToListener
   → Socket: movedToListener

3. Moderator mutes user (hard)
   POST /voicemeet/muteSpeaker (muteType: "hard")
   → Socket: userMuted

4. Moderator removes user
   POST /voicemeet/removeFromSpace
   → Socket: removedFromSpace

5. Moderator bans user
   POST /voicemeet/banUser
   → Socket: userBanned
```

### Example 3: Multi-User Testing Sequence

```
User 1 (Host):
1. Create voice meet
2. Assign co-host (User 2)
3. Assign moderator (User 3)

User 2 (Co-Host):
1. Join voice meet
2. Approve speaking requests
3. Assign moderator (User 4)

User 3 (Moderator):
1. Join voice meet
2. Request to speak
3. Mute users
4. Remove users

User 4 (Listener):
1. Join voice meet
2. Request to speak
3. React with emoji
4. Report user

User 5 (Regular User):
1. Join voice meet
2. Request to speak
3. Get moved to listener
4. Get muted
5. Get removed
```

---

## Error Handling

### Common Error Responses

All APIs return errors in the following format:

```json
{
  "error": "Error message here"
}
```

### HTTP Status Codes

- `200` - Success
- `400` - Bad Request (validation errors, permission denied, etc.)
- `404` - Not Found (user, voice meet, etc.)

### Common Error Messages

| Error Message | Meaning | Solution |
|--------------|---------|----------|
| "User Not Found" | User ID doesn't exist | Verify user ID |
| "Voice Meet Not Found" | Voice meet ID doesn't exist | Verify voice meet ID |
| "Voice Meet has ended" | Voice meet is no longer active | Create new voice meet |
| "You are banned from this voice chat" | User is in bannedUsers list | Cannot join |
| "You don't have permission to..." | Insufficient permissions | Check user role |
| "Only host can..." | Action requires host role | Use host user ID |
| "User is already a speaker" | User is already in speakers array | No action needed |
| "You have already requested to speak" | Request already exists | Wait for approval/denial |
| "You cannot unmute yourself (hard muted)" | User is hard muted | Moderator must unmute |

### Permission Matrix

| Action | Host | Co-Host | Moderator | Speaker | Listener |
|--------|------|---------|-----------|---------|----------|
| Create VoiceMeet | ✅ | ❌ | ❌ | ❌ | ❌ |
| End Voice Chat | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Co-Host | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Moderator | ✅ | ✅ | ❌ | ❌ | ❌ |
| Approve/Deny Requests | ✅ | ✅ | ✅ | ❌ | ❌ |
| Mute/Unmute Users | ✅ | ✅ | ✅ | ❌ | ❌ |
| Move to Listener | ✅ | ✅ | ✅ | ❌ | ❌ |
| Remove from Space | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ban User | ✅ | ✅ | ✅ | ❌ | ❌ |
| Request to Speak | ❌ | ❌ | ❌ | ❌ | ✅ |
| React with Emoji | ✅ | ✅ | ✅ | ✅ | ✅ |
| Report User | ✅ | ✅ | ✅ | ✅ | ✅ |
| Share Room | ✅ | ✅ | ✅ | ✅ | ✅ |
| Self-Unmute (Soft) | ✅ | ✅ | ✅ | ✅ | ❌ |

---

## Testing Recommendations

1. **Start with Basic Flow:**
   - Create voice meet
   - Join with multiple users
   - Test socket events

2. **Test Permissions:**
   - Verify each role's permissions
   - Test unauthorized actions

3. **Test Edge Cases:**
   - User already in voice meet
   - Duplicate requests
   - Banned users
   - Ended voice meets

4. **Test Socket Events:**
   - Open multiple browser tabs
   - Verify real-time updates
   - Check event payloads

5. **Test Multi-User Scenarios:**
   - Multiple users joining simultaneously
   - Concurrent moderation actions
   - Race conditions

---

## Notes

- All socket events are broadcasted to **ALL members** for real-time synchronization
- Voice meet IDs are auto-generated MongoDB ObjectIds
- Channel names are random hex strings (32 bytes)
- Tokens are Agora RTC tokens generated server-side
- User status (`isOnCall`) is automatically managed
- Activities are created for notifications
- All timestamps are in ISO 8601 format

---

## Support

For issues or questions, refer to:
- `controllers/voicemeetController.js` - Implementation details
- `routes/voicemeetRoutes.js` - Route definitions
- `models/voicemeetModel.js` - Data model structure

