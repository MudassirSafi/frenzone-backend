# Voice Chat (X-Space Style) API Documentation

## Overview
This document describes all the new APIs added for X-Space style voice chat functionality. These APIs enable a Twitter Spaces-like experience with roles (Host, Co-Host, Moderator, Speaker, Listener), speaking requests, moderation tools, and reporting features.

---

## Table of Contents
1. [Model Updates](#model-updates)
2. [API Endpoints](#api-endpoints)
   - [Listener Workflow](#listener-workflow)
   - [Speaker Workflow](#speaker-workflow)
   - [Host/Moderator Workflow](#hostmoderator-workflow)
   - [Room Management](#room-management)
3. [Error Handling](#error-handling)
4. [Socket Events](#socket-events)

---

## Model Updates

### VoiceMeet Model New Fields

The VoiceMeet model has been extended with the following fields:

```javascript
{
  // Room Information
  title: String,                    // Room title
  topic: String,                    // Room topic/description
  visibility: String,               // "public" | "followers" | "private"
  
  // User Roles
  speakers: [ObjectId],             // Users who can speak
  listeners: [ObjectId],            // Users who are listening only
  coHosts: [ObjectId],              // Co-hosts with full control except ending room
  moderators: [ObjectId],           // Moderators (can mute, approve requests, remove users)
  
  // Speaking Requests
  speakingRequests: [{
    userid: ObjectId,
    requestedAt: Date
  }],
  
  // Moderation
  bannedUsers: [ObjectId],          // Permanently banned users
  hardMuted: [ObjectId],            // Hard muted (cannot unmute themselves)
  softMuted: [ObjectId],            // Soft muted (can unmute themselves)
  
  // Room Status
  isActive: Boolean,                // Whether room is active
  startedAt: Date,                  // When room started
  endedAt: Date,                    // When room ended
  
  // Summary (populated when room ends)
  summary: {
    totalListeners: Number,
    maxConcurrentListeners: Number,
    activeSpeakers: Number,
    duration: Number                // in seconds
  },
  
  // Chat Features
  pinnedMessages: [ObjectId]        // Pinned messages
}
```

---

## API Endpoints

### Listener Workflow

#### 1. Request to Speak
**Endpoint:** `POST /api/voicemeet/requestToSpeak`

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

**Error Cases:**
- User not found
- Voice meet not found
- Voice meet has ended
- User is banned
- User is already a speaker
- Request already exists

**Socket Events Emitted:**
- `speakingRequest` - Broadcasted to all members of the voicemeet

---

#### 2. React with Emoji
**Endpoint:** `POST /api/voicemeet/reactWithEmoji`

**Purpose:** Allows listeners and speakers to react with emojis during the voice chat.

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
- `emojiReaction` - Broadcasts to all members with user info and emoji

---

#### 3. Share Room
**Endpoint:** `POST /api/voicemeet/shareRoom`

**Purpose:** Get shareable information about the room.

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
    "topic": "Discussion topic",
    "host": {
      "username": "host_username",
      "profilePicture": "profile_picture_url"
    }
  },
  "message": "Room share data retrieved"
}
```

---

#### 4. Report User in Space
**Endpoint:** `POST /api/voicemeet/reportUserInSpace`

**Purpose:** Allows any user to report another user or content in the voice chat.

**Request Body:**
```json
{
  "userid": "reporter_user_id",
  "voicemeetid": "voicemeet_id_here",
  "reportedUserid": "reported_user_id",
  "reason": "Optional reason text",
  "reportType": "harassment"  // "nudity" | "harassment" | "hate_speech" | "scam" | "underage" | "spam"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User reported successfully"
}
```

**Valid Report Types:**
- `nudity`
- `harassment`
- `hate_speech`
- `scam`
- `underage`
- `spam`

**Socket Events Emitted:**
- `userReported` - Broadcasted to all members of the voicemeet

---

### Speaker Workflow

#### 5. Unmute Speaker (Self)
**Endpoint:** `POST /api/voicemeet/unmuteSpeaker`

**Purpose:** Allows a soft-muted speaker to unmute themselves. Hard-muted users cannot unmute themselves.

**Request Body:**
```json
{
  "userid": "user_id_here",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "user_id_here"  // Can be same as userid for self-unmute
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
- `userUnmuted` - Notifies the user they've been unmuted

---

### Host/Moderator Workflow

#### 6. Approve Speaking Request
**Endpoint:** `POST /api/voicemeet/approveSpeakingRequest`

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

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `speakingRequestApproved` - Broadcasted to all members of the voicemeet

---

#### 7. Deny Speaking Request
**Endpoint:** `POST /api/voicemeet/denySpeakingRequest`

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

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `speakingRequestDenied` - Broadcasted to all members of the voicemeet

---

#### 8. Get Speaking Requests
**Endpoint:** `GET /api/voicemeet/getSpeakingRequests/:userid?voicemeetid=voicemeet_id`

**Purpose:** Get all pending speaking requests for a voice chat.

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
      "profilePicture": "profile_picture_url",
      "requestedAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**Permissions:** Host, Moderator, Co-Host

---

#### 9. Mute Speaker
**Endpoint:** `POST /api/voicemeet/muteSpeaker`

**Purpose:** Host, Moderator, or Co-Host mutes a speaker (hard or soft mute).

**Request Body:**
```json
{
  "userid": "host/moderator_user_id",
  "voicemeetid": "voicemeet_id_here",
  "targetUserid": "target_user_id",
  "muteType": "hard"  // "hard" | "soft" (default: "hard")
}
```

**Response:**
```json
{
  "success": true,
  "message": "User hard muted successfully"
}
```

**Mute Types:**
- `hard` - User cannot unmute themselves
- `soft` - User can unmute themselves

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `userMuted` - Broadcasted to all members of the voicemeet

---

#### 10. Unmute Speaker (Moderator)
**Endpoint:** `POST /api/voicemeet/unmuteSpeaker`

**Purpose:** Host, Moderator, or Co-Host unmutes a speaker.

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
  "message": "User unmuted successfully"
}
```

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `userUnmuted` - Broadcasted to all members of the voicemeet

---

#### 11. Assign Co-Host
**Endpoint:** `POST /api/voicemeet/assignCoHost`

**Purpose:** Host assigns a user as co-host. Co-hosts have full control except ending the room.

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

**Permissions:** Host only

**Co-Host Permissions:**
- All moderator permissions
- Assign moderators
- Cannot end the room

**Socket Events Emitted:**
- `coHostAssigned` - Broadcasted to all members of the voicemeet

---

#### 12. Assign Moderator
**Endpoint:** `POST /api/voicemeet/assignModerator`

**Purpose:** Host or Co-Host assigns a user as moderator.

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

**Permissions:** Host, Co-Host

**Moderator Permissions:**
- Mute/unmute speakers
- Approve/deny speaking requests
- Remove users from space
- Ban users
- Move users to listener

**Socket Events Emitted:**
- `moderatorAssigned` - Broadcasted to all members of the voicemeet

---

#### 13. Move to Listener
**Endpoint:** `POST /api/voicemeet/moveToListener`

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

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `movedToListener` - Broadcasted to all members of the voicemeet

---

#### 14. Remove from Space
**Endpoint:** `POST /api/voicemeet/removeFromSpace`

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

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `removedFromSpace` - Broadcasted to all members of the voicemeet (also sent to the removed user)

---

#### 15. Ban User
**Endpoint:** `POST /api/voicemeet/banUser`

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

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `userBanned` - Broadcasted to all members of the voicemeet (also sent to the banned user)

---

### Room Management

#### 16. End Voice Chat
**Endpoint:** `POST /api/voicemeet/endVoiceChat`

**Purpose:** Host ends the voice chat and generates a summary.

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

**Permissions:** Host only

**Summary Includes:**
- Total listeners (all-time)
- Max concurrent listeners
- Active speakers count
- Duration in seconds

**Socket Events Emitted:**
- `voiceChatEnded` - Notifies all members with summary

---

#### 17. Pin Message
**Endpoint:** `POST /api/voicemeet/pinMessage`

**Purpose:** Host, Moderator, or Co-Host pins a message in the chat.

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

**Permissions:** Host, Moderator, Co-Host

**Socket Events Emitted:**
- `messagePinned` - Broadcasted to all members of the voicemeet

**Note:** This is a placeholder for future chat functionality.

---

## Error Handling

All APIs return errors in the following format:

```json
{
  "error": "Error message here"
}
```

**Common HTTP Status Codes:**
- `200` - Success
- `400` - Bad Request (validation errors, permission denied, etc.)
- `404` - Not Found (user, voice meet, etc.)

**Common Error Messages:**
- "User Not Found"
- "Voice Meet Not Found"
- "Voice Meet has ended"
- "You are banned from this voice chat"
- "You don't have permission to..."
- "Only host can..."
- "User is already a speaker"
- "Request already exists"

---

## Socket Events

### Client → Server Events
These events should be emitted by the client:

- `joinVoiceChat` - Join a voice chat room
- `leaveVoiceChat` - Leave a voice chat room
- `toggleMute` - Toggle microphone mute (for speakers)

### Server → Client Events
These events are emitted by the server:

#### User Status Events
- `newUserJoined` - New user joined the room
- `userLeft` - User left the room
- `userKicked` - User was kicked from the room
- `userBanned` - User was banned from the room
- `removedFromSpace` - User was removed from space

#### Speaking Events
- `speakingRequest` - New speaking request (broadcasted to all members)
- `speakingRequestApproved` - Speaking request was approved (broadcasted to all members)
- `speakingRequestDenied` - Speaking request was denied (broadcasted to all members)
- `movedToListener` - User moved to listener status (broadcasted to all members)

#### Mute Events
- `userMuted` - User was muted (broadcasted to all members, includes muteType: "hard" | "soft")
- `userUnmuted` - User was unmuted (broadcasted to all members)

#### Moderation Events
- `coHostAssigned` - User assigned as co-host (broadcasted to all members)
- `moderatorAssigned` - User assigned as moderator (broadcasted to all members)

#### Room Events
- `voiceChatEnded` - Voice chat ended (broadcasted to all members, includes summary)
- `emojiReaction` - Emoji reaction from user (broadcasted to all members)
- `userReported` - User was reported (broadcasted to all members)
- `messagePinned` - Message was pinned (broadcasted to all members)

#### Example Socket Event Payloads

**speakingRequest:**
```json
{
  "voicemeetid": "voicemeet_id",
  "requester": {
    "userid": "user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  }
}
```

**speakingRequestApproved:**
```json
{
  "voicemeetid": "voicemeet_id",
  "requesterid": "requester_user_id",
  "requester": {
    "userid": "requester_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  }
}
```

**speakingRequestDenied:**
```json
{
  "voicemeetid": "voicemeet_id",
  "requesterid": "requester_user_id",
  "requester": {
    "userid": "requester_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  }
}
```

**userMuted:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "muteType": "hard",
  "mutedBy": {
    "userid": "moderator_user_id",
    "username": "moderator_username"
  }
}
```

**userUnmuted:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "unmutedBy": {
    "userid": "moderator_user_id",
    "username": "moderator_username"
  }
}
```

**coHostAssigned:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "assignedBy": {
    "userid": "host_user_id",
    "username": "host_username"
  }
}
```

**moderatorAssigned:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "assignedBy": {
    "userid": "host_user_id",
    "username": "host_username"
  }
}
```

**movedToListener:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "movedBy": {
    "userid": "moderator_user_id",
    "username": "moderator_username"
  }
}
```

**removedFromSpace:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "removedBy": {
    "userid": "moderator_user_id",
    "username": "moderator_username"
  }
}
```

**userBanned:**
```json
{
  "voicemeetid": "voicemeet_id",
  "targetUserid": "target_user_id",
  "targetUser": {
    "userid": "target_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "bannedBy": {
    "userid": "moderator_user_id",
    "username": "moderator_username"
  }
}
```

**userReported:**
```json
{
  "voicemeetid": "voicemeet_id",
  "reportedUserid": "reported_user_id",
  "reportedUser": {
    "userid": "reported_user_id",
    "username": "username",
    "profilePicture": "profile_picture_url"
  },
  "reportedBy": {
    "userid": "reporter_user_id",
    "username": "reporter_username"
  },
  "reportType": "harassment",
  "reason": "Optional reason text"
}
```

**messagePinned:**
```json
{
  "voicemeetid": "voicemeet_id",
  "messageid": "message_id",
  "pinnedBy": {
    "userid": "moderator_user_id",
    "username": "moderator_username"
  }
}
```

**emojiReaction:**
```json
{
  "userid": "user_id",
  "username": "username",
  "profilePicture": "profile_picture_url",
  "emoji": "👍",
  "voicemeetid": "voicemeet_id"
}
```

**voiceChatEnded:**
```json
{
  "voicemeetid": "voicemeet_id",
  "summary": {
    "totalListeners": 50,
    "maxConcurrentListeners": 75,
    "activeSpeakers": 5,
    "duration": 3600
  }
}
```

---

## Role Permissions Summary

| Action | Host | Co-Host | Moderator | Speaker | Listener |
|--------|------|---------|-----------|---------|----------|
| End room | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Co-Host | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign Moderator | ✅ | ✅ | ❌ | ❌ | ❌ |
| Mute/Unmute | ✅ | ✅ | ✅ | ❌ | ❌ |
| Approve/Deny Requests | ✅ | ✅ | ✅ | ❌ | ❌ |
| Remove User | ✅ | ✅ | ✅ | ❌ | ❌ |
| Ban User | ✅ | ✅ | ✅ | ❌ | ❌ |
| Move to Listener | ✅ | ✅ | ✅ | ❌ | ❌ |
| Pin Message | ✅ | ✅ | ✅ | ❌ | ❌ |
| Request to Speak | ❌ | ❌ | ❌ | ❌ | ✅ |
| Speak | ✅ | ✅ | ✅ | ✅ | ❌ |
| React with Emoji | ✅ | ✅ | ✅ | ✅ | ✅ |
| Share Room | ✅ | ✅ | ✅ | ✅ | ✅ |
| Report User | ✅ | ✅ | ✅ | ✅ | ✅ |

---

## Notes

1. **Authentication:** All endpoints require authentication via `requireAuth` middleware.

2. **Socket.IO Integration:** All actions emit socket events that are broadcasted to ALL members of the voicemeet to keep everyone synchronized in real-time. This ensures that all participants see the same state (who is speaking, who is muted, who has been removed, etc.).

3. **Notifications:** Important actions trigger push notifications to relevant users.

4. **Activity Logging:** User actions may be logged in the Activity model for feed/history purposes.

5. **Future Enhancements:**
   - Chat/messaging functionality
   - Message pinning (currently placeholder)
   - AI auto-moderation
   - Shadow-banning feature
   - Recording functionality (if needed)

---

## Testing Recommendations

1. Test all permission checks (host, co-host, moderator, speaker, listener)
2. Test socket event emissions
3. Test notification delivery
4. Test edge cases (user already in role, banned users, etc.)
5. Test room ending and summary generation
6. Test speaking request workflow end-to-end

---

## Support

For issues or questions, contact the development team or refer to the main API documentation.

