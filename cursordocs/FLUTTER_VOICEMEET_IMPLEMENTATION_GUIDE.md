# Flutter VoiceMeet & Space-X Voice Chat Implementation Guide

## Table of Contents
1. [Base Configuration](#base-configuration)
2. [Authentication](#authentication)
3. [API Endpoints Reference](#api-endpoints-reference)
4. [Socket Events Reference](#socket-events-reference)
5. [Complete Implementation Flow](#complete-implementation-flow)
6. [Flutter Code Examples](#flutter-code-examples)

---

## Base Configuration

### Base URL
```
{{base_url}}
```

### API Base Path
```
/voicemeet
```

**Note:** There is NO `/api` prefix in the routes. All endpoints are directly under `/voicemeet`.

---

## Authentication

### Required Headers for All API Requests

Every API request MUST include the following headers:

```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer YOUR_ACCESS_TOKEN',
  'ngrok-skip-browser-warning': 'true'  // Only if using ngrok
}
```

### How to Send Bearer Token

The access token must be sent in the `Authorization` header with the format:
```
Authorization: Bearer {your_access_token}
```

**Example in Flutter:**
```dart
final headers = {
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
};
```

---

## API Endpoints Reference

### 1. Create VoiceMeet

**Purpose:** Create a new voice meet for a club or join existing one if it exists.

**Endpoint:** `POST /voicemeet/createVoiceMeet`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",      // Current user's ID
  "clubid": "string",      // Club ID
  "members": ["string"]    // Array of member IDs to invite (optional)
}
```

**Response (Success - 200):**
```dart
{
  "_id": "voicemeet_id",
  "channelName": "random_channel_name",
  "token": "agora_rtc_token",
  "username": "host_username",
  "profilePic": "profile_picture_url",
  "usersData": [
    {
      "username": "string",
      "profilePicture": "url",
      "admin": true/false
    }
  ]
}
```

**Response (Error - 400):**
```dart
{
  "error": "Error message here"
}
```

**Socket Events Emitted:**
- `newUserJoined` - Broadcasted to all existing members when a new user joins
  ```dart
  {
    "username": "string",
    "profilePicture": "url"
  }
  ```

**When to Use:**
- User wants to start a new voice chat for a club
- If a voice meet already exists for the club, user joins the existing one

---

### 2. Join Stream/VoiceMeet

**Purpose:** Join an existing voice meet/stream.

**Endpoint:** `PATCH /voicemeet/joinStream`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",      // Current user's ID
  "streamid": "string"     // VoiceMeet ID
}
```

**Response (Success - 200):**
```dart
{
  "_id": "voicemeet_id",
  "channelName": "channel_name",
  "token": "agora_token",
  "members": [
    {
      "_id": "user_id",
      "username": "string",
      "profilePicture": "url"
    }
  ]
}
```

**Response (Error - 400):**
```dart
{
  "error": "Error message"
}
```

**Socket Events Emitted:**
- `memberCount` - Broadcasted to all members
  ```dart
  {
    "memberCount": 5
  }
  ```
- `newUserJoined` - Broadcasted to all members when user joins
  ```dart
  {
    "_id": "user_id",
    "username": "string",
    "profilePicture": "url"
  }
  ```

**When to Use:**
- User wants to join an existing voice meet using the VoiceMeet ID

---

### 3. Leave VoiceMeet

**Purpose:** Leave a voice meet.

**Endpoint:** `PATCH /voicemeet/leaveVoiceMeet`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "clubid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "_id": "voicemeet_id",
  "message": "You left the voice call"
}
```

**Socket Events Emitted:**
- None (user leaves silently)

**When to Use:**
- User wants to leave the voice chat

---

### 4. Delete Stream

**Purpose:** Delete a voice meet/stream (typically by host).

**Endpoint:** `DELETE /voicemeet/deleteStream`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "streamid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "message": "Stream Deleted"
}
```

**Socket Events Emitted:**
- `streamended` - Broadcasted to all members before deletion
  ```dart
  {
    "streamid": "voicemeet_id"
  }
  ```

**When to Use:**
- Host wants to delete/end the voice meet

---

### 5. Get Stream by User ID

**Purpose:** Get voice meet created by a specific user.

**Endpoint:** `GET /voicemeet/getStreamByUserId/:userid`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `userid` - User ID in the URL path

**Response (Success - 200):**
```dart
{
  "stream": {
    // Full VoiceMeet object
  }
}
```

**Socket Events Emitted:**
- None

---

### 6. Get Streams of Following

**Purpose:** Get all voice meets from users the current user is following.

**Endpoint:** `GET /voicemeet/getStreamsOfFollowing/:userid`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `userid` - Current user's ID

**Response (Success - 200):**
```dart
{
  "streams": [
    {
      // VoiceMeet objects
    }
  ]
}
```

**Socket Events Emitted:**
- None

---

### 7. Get Viewers

**Purpose:** Get all members/viewers of a voice meet.

**Endpoint:** `GET /voicemeet/getViewers/:streamid`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `streamid` - VoiceMeet ID in the URL path

**Response (Success - 200):**
```dart
{
  "members": [
    {
      "_id": "user_id",
      "username": "string",
      "profilePic": "url",
      "isModerator": true/false,
      "isHost": true/false
    }
  ]
}
```

**Socket Events Emitted:**
- None

**When to Use:**
- Load the member list for the voice chat UI
- Check user roles (host, moderator)

---

### 8. Get Viewers Count

**Purpose:** Get the count of members in a voice meet.

**Endpoint:** `GET /voicemeet/getViewersCount/:streamid`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `streamid` - VoiceMeet ID

**Response (Success - 200):**
```dart
{
  "memberCount": 5
}
```

**Socket Events Emitted:**
- None

---

### 9. Send Invite

**Purpose:** Send an invite to join a voice meet.

**Endpoint:** `POST /voicemeet/sendInvite`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",        // User to invite
  "streamid": "string",      // VoiceMeet ID
  "channel": "string",       // Channel name
  "token": "string"          // Agora token
}
```

**Response (Success - 200):**
```dart
{
  "message": "Invite sent successfully"
}
```

**Socket Events Emitted:**
- None (sends notification instead)

---

### 10. Send Audience Invite

**Purpose:** Send an invite to join as audience.

**Endpoint:** `POST /voicemeet/sendAudianceInvite`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",        // User to invite
  "streamid": "string",      // VoiceMeet ID
  "senderid": "string"       // Sender's user ID
}
```

**Response (Success - 200):**
```dart
{
  "message": "Invite sent successfully"
}
```

**Socket Events Emitted:**
- None

---

### 11. Add Members

**Purpose:** Add members to an existing voice meet.

**Endpoint:** `PATCH /voicemeet/addMembers`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "streamid": "string",
  "userid": "string",        // Current user ID
  "members": ["string"]      // Array of member IDs to add
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "invite sent"
}
```

**Socket Events Emitted:**
- None (sends notifications)

---

### 12. Kick User

**Purpose:** Kick a user from the voice meet.

**Endpoint:** `PATCH /voicemeet/kickUser`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",        // User to kick
  "clubid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "_id": "voicemeet_id",
  "message": "user kicked out"
}
```

**Socket Events Emitted:**
- `userKicked` - Broadcasted to all members
  ```dart
  {
    "_id": "user_id",
    "username": "string",
    "profilePicture": "url"
  }
  ```

---

### 13. Schedule VoiceMeet

**Purpose:** Schedule a voice meet for a future time.

**Endpoint:** `POST /voicemeet/scheduleVoiceMeet`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "clubid": "string",
  "scheduleTime": "2024-12-31T12:00:00Z",  // ISO 8601 format
  "members": ["string"]                     // Array of member IDs
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Voice meet scheduled successfully"
}
```

**Socket Events Emitted:**
- None (sends notifications and creates scheduled job)

---

### 14. Make Moderator (Legacy)

**Purpose:** Make a user a moderator (legacy API).

**Endpoint:** `PATCH /voicemeet/makeModerator`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",        // User to make moderator
  "streamid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "message": "Stream Updated"
}
```

**Socket Events Emitted:**
- None

---

### 15. Remove Moderator (Legacy)

**Endpoint:** `PATCH /voicemeet/removeModerator`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "streamid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "message": "Stream Updated"
}
```

**Socket Events Emitted:**
- None

---

### 16. Get Moderators

**Purpose:** Get list of moderators for a voice meet.

**Endpoint:** `GET /voicemeet/getModerators/:streamid`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `streamid` - VoiceMeet ID

**Response (Success - 200):**
```dart
{
  "moderators": [
    {
      "_id": "user_id",
      "username": "string",
      "profilePic": "url"
    }
  ]
}
```

**Socket Events Emitted:**
- None

---

### 17. Get Blocked

**Purpose:** Get list of blocked users for a voice meet.

**Endpoint:** `GET /voicemeet/getBlocked/:streamid`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `streamid` - VoiceMeet ID

**Response (Success - 200):**
```dart
{
  "blocked": [
    {
      "_id": "user_id",
      "username": "string",
      "profilePic": "url"
    }
  ]
}
```

**Socket Events Emitted:**
- None

---

## Space-X Style Voice Chat APIs

### 18. Request to Speak

**Purpose:** Listener requests permission to become a speaker.

**Endpoint:** `POST /voicemeet/requestToSpeak`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Speaking request sent"
}
```

**Response (Error - 400):**
```dart
{
  "error": "You are already a speaker" | "You have already requested to speak" | etc.
}
```

**Socket Events Emitted:**
- `speakingRequest` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "requester": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    }
  }
  ```

**When to Use:**
- Listener wants to request speaking permission
- Show "Request to Speak" button for listeners only

**Socket Listener Setup:**
```dart
socket.on('speakingRequest', (data) {
  // Update UI to show new speaking request
  // If you're host/moderator/co-host, add to requests queue
  // If you're the requester, show "Request pending" status
});
```

---

### 19. Approve Speaking Request

**Purpose:** Host/Moderator/Co-Host approves a listener's request to speak.

**Endpoint:** `POST /voicemeet/approveSpeakingRequest`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Host/Moderator/Co-Host user ID
  "voicemeetid": "string",
  "requesterid": "string"       // User who requested to speak
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Speaking request approved"
}
```

**Socket Events Emitted:**
- `speakingRequestApproved` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "requesterid": "string",
    "requester": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    }
  }
  ```

**When to Use:**
- Host/Moderator/Co-Host approves a speaking request
- User moves from listener to speaker

**Socket Listener Setup:**
```dart
socket.on('speakingRequestApproved', (data) {
  // If requesterid matches current user, update role to speaker
  // Remove from speaking requests list
  // Update member list to show user as speaker
  // Enable microphone controls for the new speaker
});
```

---

### 20. Deny Speaking Request

**Purpose:** Host/Moderator/Co-Host denies a listener's request to speak.

**Endpoint:** `POST /voicemeet/denySpeakingRequest`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string",
  "requesterid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Speaking request denied"
}
```

**Socket Events Emitted:**
- `speakingRequestDenied` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "requesterid": "string",
    "requester": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('speakingRequestDenied', (data) {
  // Remove from speaking requests list
  // If requesterid matches current user, show "Request denied" message
  // User remains as listener
});
```

---

### 21. Get Speaking Requests

**Purpose:** Get all pending speaking requests (Host/Moderator/Co-Host only).

**Endpoint:** `GET /voicemeet/getSpeakingRequests/:userid?voicemeetid=voicemeet_id`

**Headers:**
```dart
{
  'Authorization': 'Bearer $accessToken',
}
```

**URL Parameters:**
- `userid` - Current user's ID (in path)
- `voicemeetid` - VoiceMeet ID (query parameter)

**Response (Success - 200):**
```dart
{
  "success": true,
  "requests": [
    {
      "userid": "string",
      "username": "string",
      "profilePicture": "url",
      "requestedAt": "2024-01-01T12:00:00Z"
    }
  ]
}
```

**Response (Error - 400):**
```dart
{
  "error": "You don't have permission to view speaking requests"
}
```

**Socket Events Emitted:**
- None

**When to Use:**
- Load speaking requests queue for Host/Moderator/Co-Host
- Poll periodically or refresh after socket events

---

### 22. Mute Speaker

**Purpose:** Host/Moderator/Co-Host mutes a speaker (hard or soft mute).

**Endpoint:** `POST /voicemeet/muteSpeaker`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Host/Moderator/Co-Host user ID
  "voicemeetid": "string",
  "targetUserid": "string",     // User to mute
  "muteType": "hard" | "soft"   // Default: "hard"
}
```

**Mute Types:**
- `"hard"` - User cannot unmute themselves
- `"soft"` - User can unmute themselves

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "User hard muted successfully" | "User soft muted successfully"
}
```

**Socket Events Emitted:**
- `userMuted` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "muteType": "hard" | "soft",
    "mutedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('userMuted', (data) {
  // Update UI to show muted indicator for targetUserid
  // If targetUserid matches current user:
  //   - If muteType is "hard", disable unmute button
  //   - If muteType is "soft", enable self-unmute button
  //   - Mute microphone in Agora SDK
});
```

---

### 23. Unmute Speaker

**Purpose:** Host/Moderator/Co-Host unmutes a speaker. Soft-muted users can also unmute themselves.

**Endpoint:** `POST /voicemeet/unmuteSpeaker`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Can be same as targetUserid for self-unmute
  "voicemeetid": "string",
  "targetUserid": "string"      // User to unmute
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "User unmuted successfully"
}
```

**Response (Error - 400):**
```dart
{
  "error": "You cannot unmute yourself (hard muted)"
}
```

**Socket Events Emitted:**
- `userUnmuted` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "unmutedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('userUnmuted', (data) {
  // Remove muted indicator for targetUserid
  // If targetUserid matches current user, enable microphone
  // Unmute microphone in Agora SDK
});
```

---

### 24. Assign Co-Host

**Purpose:** Host assigns a co-host (Host only).

**Endpoint:** `POST /voicemeet/assignCoHost`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Host user ID
  "voicemeetid": "string",
  "targetUserid": "string"      // User to assign as co-host
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Co-host assigned successfully"
}
```

**Socket Events Emitted:**
- `coHostAssigned` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "assignedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('coHostAssigned', (data) {
  // Update member list to show co-host badge
  // If targetUserid matches current user, enable co-host controls
  // Co-host can: approve requests, mute users, assign moderators, remove users
  // Co-host cannot: end the room
});
```

---

### 25. Assign Moderator

**Purpose:** Host or Co-Host assigns a moderator.

**Endpoint:** `POST /voicemeet/assignModerator`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Host or Co-Host user ID
  "voicemeetid": "string",
  "targetUserid": "string"      // User to assign as moderator
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Moderator assigned successfully"
}
```

**Socket Events Emitted:**
- `moderatorAssigned` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "assignedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('moderatorAssigned', (data) {
  // Update member list to show moderator badge
  // If targetUserid matches current user, enable moderator controls
  // Moderator can: approve requests, mute users, remove users
  // Moderator cannot: assign co-hosts or moderators, end room
});
```

---

### 26. Move to Listener

**Purpose:** Host/Moderator/Co-Host moves a speaker back to listener status.

**Endpoint:** `POST /voicemeet/moveToListener`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string",
  "targetUserid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "User moved to listener"
}
```

**Socket Events Emitted:**
- `movedToListener` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "movedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('movedToListener', (data) {
  // Update member list: move user from speakers to listeners
  // If targetUserid matches current user:
  //   - Disable microphone
  //   - Remove from speakers list
  //   - Show "Request to Speak" button again
});
```

---

### 27. Remove from Space

**Purpose:** Host/Moderator/Co-Host removes a user from the voice chat.

**Endpoint:** `POST /voicemeet/removeFromSpace`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string",
  "targetUserid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "User removed from space"
}
```

**Socket Events Emitted:**
- `removedFromSpace` - Broadcasted to ALL members AND sent to removed user
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "removedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('removedFromSpace', (data) {
  // Remove user from member list
  // If targetUserid matches current user:
  //   - Leave the voice chat
  //   - Disconnect from Agora
  //   - Navigate back to previous screen
  //   - Show "You were removed" message
});
```

---

### 28. Ban User

**Purpose:** Host/Moderator/Co-Host permanently bans a user from the voice chat.

**Endpoint:** `POST /voicemeet/banUser`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string",
  "targetUserid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "User banned successfully"
}
```

**Socket Events Emitted:**
- `userBanned` - Broadcasted to ALL members AND sent to banned user
  ```dart
  {
    "voicemeetid": "string",
    "targetUserid": "string",
    "targetUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "bannedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('userBanned', (data) {
  // Remove user from member list
  // If targetUserid matches current user:
  //   - Leave the voice chat immediately
  //   - Disconnect from Agora
  //   - Navigate back
  //   - Show "You were banned" message
  //   - Prevent user from joining this voice meet again
});
```

---

### 29. Report User in Space

**Purpose:** Any user can report another user for inappropriate behavior.

**Endpoint:** `POST /voicemeet/reportUserInSpace`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Current user ID
  "voicemeetid": "string",
  "reportedUserid": "string",
  "reason": "string",            // Optional
  "reportType": "string"         // Optional: "nudity" | "harassment" | "hate_speech" | "scam" | "underage" | "spam"
}
```

**Valid Report Types:**
- `"nudity"`
- `"harassment"`
- `"hate_speech"`
- `"scam"`
- `"underage"`
- `"spam"`

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "User reported successfully"
}
```

**Socket Events Emitted:**
- `userReported` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "reportedUserid": "string",
    "reportedUser": {
      "userid": "string",
      "username": "string",
      "profilePicture": "url"
    },
    "reportedBy": {
      "userid": "string",
      "username": "string"
    },
    "reportType": "string",
    "reason": "string"
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('userReported', (data) {
  // Show notification to moderators/host
  // Update moderation dashboard if visible
  // Log the report for admin review
});
```

---

### 30. React with Emoji

**Purpose:** Any user can react with an emoji during the voice chat.

**Endpoint:** `POST /voicemeet/reactWithEmoji`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string",
  "emoji": "👍"                 // Emoji string
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Reaction sent"
}
```

**Socket Events Emitted:**
- `emojiReaction` - Broadcasted to ALL members
  ```dart
  {
    "userid": "string",
    "username": "string",
    "profilePicture": "url",
    "emoji": "👍",
    "voicemeetid": "string"
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('emojiReaction', (data) {
  // Show emoji animation on screen
  // Display: "{username} reacted with {emoji}"
  // Animate emoji from user's avatar position
});
```

---

### 31. Share Room

**Purpose:** Get shareable information about the voice chat room.

**Endpoint:** `POST /voicemeet/shareRoom`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "shareData": {
    "voicemeetid": "string",
    "title": "string",
    "topic": "string",
    "host": {
      "username": "string",
      "profilePicture": "url"
    }
  },
  "message": "Room share data retrieved"
}
```

**Socket Events Emitted:**
- None

**When to Use:**
- User wants to share the voice chat room
- Use shareData to create shareable link or message

---

### 32. End Voice Chat

**Purpose:** Host ends the voice chat and generates a summary (Host only).

**Endpoint:** `POST /voicemeet/endVoiceChat`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",           // Host user ID
  "voicemeetid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Voice chat ended",
  "summary": {
    "totalListeners": 50,
    "maxConcurrentListeners": 75,
    "activeSpeakers": 5,
    "duration": 3600            // in seconds
  }
}
```

**Socket Events Emitted:**
- `voiceChatEnded` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "summary": {
      "totalListeners": 50,
      "maxConcurrentListeners": 75,
      "activeSpeakers": 5,
      "duration": 3600
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('voiceChatEnded', (data) {
  // Disconnect from Agora
  // Show summary screen with statistics
  // Navigate back after showing summary
  // Update all users' isOnCall status
});
```

---

### 33. Pin Message

**Purpose:** Host/Moderator/Co-Host pins a message (placeholder for future chat feature).

**Endpoint:** `POST /voicemeet/pinMessage`

**Headers:**
```dart
{
  'Content-Type': 'application/json',
  'Authorization': 'Bearer $accessToken',
}
```

**Request Body:**
```dart
{
  "userid": "string",
  "voicemeetid": "string",
  "messageid": "string"
}
```

**Response (Success - 200):**
```dart
{
  "success": true,
  "message": "Message pinned successfully"
}
```

**Socket Events Emitted:**
- `messagePinned` - Broadcasted to ALL members
  ```dart
  {
    "voicemeetid": "string",
    "messageid": "string",
    "pinnedBy": {
      "userid": "string",
      "username": "string"
    }
  }
  ```

**Socket Listener Setup:**
```dart
socket.on('messagePinned', (data) {
  // Add message to pinned messages list
  // Show pinned indicator in chat UI
  // Display pinned messages at top of chat
});
```

---

## Socket Events Reference

### Socket Connection Setup

**Base URL:** Same as API base URL
```
{{base_url}}
```

**Connection:**
```dart
final socket = IO.io(
  '{{base_url}}',
  IO.OptionBuilder()
    .setTransports(['websocket'])
    .setAuth({'userid': currentUserId})  // Pass userid in auth
    .build(),
);
```

### Complete Socket Events List

All socket events are broadcasted to **ALL members** of the voice meet for real-time synchronization.

#### 1. `newUserJoined`
**Emitted By:** `createVoiceMeet`, `joinStream`

**When:** New user joins the voice meet

**Payload:**
```dart
{
  "username": "string",
  "profilePicture": "url"
}
// OR (from joinStream)
{
  "_id": "user_id",
  "username": "string",
  "profilePicture": "url"
}
```

**Action:**
- Add user to member list
- Show "User joined" notification
- Update member count

---

#### 2. `memberCount`
**Emitted By:** `joinStream`

**When:** Member count changes

**Payload:**
```dart
{
  "memberCount": 5
}
```

**Action:**
- Update member count display

---

#### 3. `speakingRequest`
**Emitted By:** `requestToSpeak`

**When:** Listener requests to speak

**Payload:**
```dart
{
  "voicemeetid": "string",
  "requester": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  }
}
```

**Action:**
- If you're host/moderator/co-host: Add to speaking requests queue
- If you're the requester: Show "Request pending" status
- Show notification to moderators

---

#### 4. `speakingRequestApproved`
**Emitted By:** `approveSpeakingRequest`

**When:** Speaking request is approved

**Payload:**
```dart
{
  "voicemeetid": "string",
  "requesterid": "string",
  "requester": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  }
}
```

**Action:**
- Remove from speaking requests queue
- Move user from listeners to speakers
- If requesterid matches current user: Enable microphone, update role
- Update member list UI

---

#### 5. `speakingRequestDenied`
**Emitted By:** `denySpeakingRequest`

**When:** Speaking request is denied

**Payload:**
```dart
{
  "voicemeetid": "string",
  "requesterid": "string",
  "requester": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  }
}
```

**Action:**
- Remove from speaking requests queue
- If requesterid matches current user: Show "Request denied" message
- User remains as listener

---

#### 6. `userMuted`
**Emitted By:** `muteSpeaker`

**When:** User is muted by host/moderator/co-host

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "muteType": "hard" | "soft",
  "mutedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Show muted indicator for targetUserid
- If targetUserid matches current user:
  - Mute microphone in Agora SDK
  - If muteType is "hard": Disable unmute button
  - If muteType is "soft": Enable self-unmute button

---

#### 7. `userUnmuted`
**Emitted By:** `unmuteSpeaker`

**When:** User is unmuted

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "unmutedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Remove muted indicator
- If targetUserid matches current user: Unmute microphone in Agora SDK

---

#### 8. `coHostAssigned`
**Emitted By:** `assignCoHost`

**When:** User is assigned as co-host

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "assignedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Update member list: Show co-host badge
- If targetUserid matches current user: Enable co-host controls

---

#### 9. `moderatorAssigned`
**Emitted By:** `assignModerator`

**When:** User is assigned as moderator

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "assignedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Update member list: Show moderator badge
- If targetUserid matches current user: Enable moderator controls

---

#### 10. `movedToListener`
**Emitted By:** `moveToListener`

**When:** Speaker is moved back to listener

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "movedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Move user from speakers to listeners in UI
- If targetUserid matches current user:
  - Disable microphone
  - Show "Request to Speak" button
  - Remove from speakers list

---

#### 11. `removedFromSpace`
**Emitted By:** `removeFromSpace`

**When:** User is removed from voice chat

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "removedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Remove user from member list
- If targetUserid matches current user:
  - Leave voice chat
  - Disconnect from Agora
  - Navigate back
  - Show "You were removed" message

---

#### 12. `userBanned`
**Emitted By:** `banUser`

**When:** User is banned from voice chat

**Payload:**
```dart
{
  "voicemeetid": "string",
  "targetUserid": "string",
  "targetUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "bannedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Remove user from member list
- If targetUserid matches current user:
  - Leave voice chat immediately
  - Disconnect from Agora
  - Navigate back
  - Show "You were banned" message
  - Prevent rejoining

---

#### 13. `userReported`
**Emitted By:** `reportUserInSpace`

**When:** User is reported

**Payload:**
```dart
{
  "voicemeetid": "string",
  "reportedUserid": "string",
  "reportedUser": {
    "userid": "string",
    "username": "string",
    "profilePicture": "url"
  },
  "reportedBy": {
    "userid": "string",
    "username": "string"
  },
  "reportType": "string",
  "reason": "string"
}
```

**Action:**
- Show notification to moderators/host
- Log report for admin review
- Update moderation dashboard if visible

---

#### 14. `emojiReaction`
**Emitted By:** `reactWithEmoji`

**When:** User reacts with emoji

**Payload:**
```dart
{
  "userid": "string",
  "username": "string",
  "profilePicture": "url",
  "emoji": "👍",
  "voicemeetid": "string"
}
```

**Action:**
- Show emoji animation on screen
- Display "{username} reacted with {emoji}"
- Animate emoji from user's avatar position

---

#### 15. `voiceChatEnded`
**Emitted By:** `endVoiceChat`

**When:** Host ends the voice chat

**Payload:**
```dart
{
  "voicemeetid": "string",
  "summary": {
    "totalListeners": 50,
    "maxConcurrentListeners": 75,
    "activeSpeakers": 5,
    "duration": 3600
  }
}
```

**Action:**
- Disconnect from Agora
- Show summary screen with statistics
- Navigate back after showing summary
- Update all users' isOnCall status

---

#### 16. `messagePinned`
**Emitted By:** `pinMessage`

**When:** Message is pinned

**Payload:**
```dart
{
  "voicemeetid": "string",
  "messageid": "string",
  "pinnedBy": {
    "userid": "string",
    "username": "string"
  }
}
```

**Action:**
- Add message to pinned messages list
- Show pinned indicator in chat UI
- Display pinned messages at top

---

#### 17. `userKicked`
**Emitted By:** `kickUser`

**When:** User is kicked from voice meet

**Payload:**
```dart
{
  "_id": "user_id",
  "username": "string",
  "profilePicture": "url"
}
```

**Action:**
- Remove user from member list
- Update member count

---

#### 18. `streamended`
**Emitted By:** `deleteStream`

**When:** Stream/voice meet is deleted

**Payload:**
```dart
{
  "streamid": "voicemeet_id"
}
```

**Action:**
- Disconnect from Agora
- Navigate back
- Show "Stream ended" message

---

## Complete Implementation Flow

### Step 1: Initialize Socket Connection

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class VoiceMeetService {
  IO.Socket? socket;
  String? currentUserId;
  String? accessToken;
  
  void connectSocket(String userId) {
    currentUserId = userId;
    
    socket = IO.io(
      '{{base_url}}',
      IO.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'userid': userId})
        .build(),
    );
    
    // Listen to all socket events
    setupSocketListeners();
  }
  
  void setupSocketListeners() {
    socket?.on('connect', (_) {
      print('Socket connected');
    });
    
    socket?.on('disconnect', (_) {
      print('Socket disconnected');
    });
    
    // Add all socket event listeners here
    socket?.on('newUserJoined', (data) {
      // Handle new user joined
    });
    
    // ... (add all other socket listeners)
  }
}
```

### Step 2: Create or Join VoiceMeet

```dart
// Create VoiceMeet
Future<Map<String, dynamic>> createVoiceMeet({
  required String userid,
  required String clubid,
  List<String>? members,
}) async {
  final response = await http.post(
    Uri.parse('$baseUrl/voicemeet/createVoiceMeet'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    },
    body: jsonEncode({
      'userid': userid,
      'clubid': clubid,
      'members': members ?? [],
    }),
  );
  
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    // Connect socket after successful creation
    connectSocket(userid);
    return data;
  } else {
    throw Exception(jsonDecode(response.body)['error']);
  }
}

// Join VoiceMeet
Future<Map<String, dynamic>> joinVoiceMeet({
  required String userid,
  required String streamid,
}) async {
  final response = await http.patch(
    Uri.parse('$baseUrl/voicemeet/joinStream'),
    headers: {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    },
    body: jsonEncode({
      'userid': userid,
      'streamid': streamid,
    }),
  );
  
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    // Connect socket after successful join
    connectSocket(userid);
    return data;
  } else {
    throw Exception(jsonDecode(response.body)['error']);
  }
}
```

### Step 3: Load Members

```dart
Future<List<Member>> getViewers(String streamid) async {
  final response = await http.get(
    Uri.parse('$baseUrl/voicemeet/getViewers/$streamid'),
    headers: {
      'Authorization': 'Bearer $accessToken',
    },
  );
  
  if (response.statusCode == 200) {
    final data = jsonDecode(response.body);
    return (data['members'] as List)
        .map((m) => Member.fromJson(m))
        .toList();
  } else {
    throw Exception(jsonDecode(response.body)['error']);
  }
}
```

### Step 4: Handle Real-time Updates

```dart
void setupSocketListeners() {
  // Update member list when new user joins
  socket?.on('newUserJoined', (data) {
    // Add user to member list
    // Update UI
  });
  
  // Handle speaking requests
  socket?.on('speakingRequest', (data) {
    // If you're host/moderator/co-host: Add to requests queue
    // If you're requester: Show "Request pending"
  });
  
  socket?.on('speakingRequestApproved', (data) {
    // Remove from requests
    // Move to speakers
    // If it's you: Enable microphone
  });
  
  // Handle mute/unmute
  socket?.on('userMuted', (data) {
    // Show muted indicator
    // If it's you: Mute microphone in Agora
  });
  
  socket?.on('userUnmuted', (data) {
    // Remove muted indicator
    // If it's you: Unmute microphone in Agora
  });
  
  // Handle role changes
  socket?.on('coHostAssigned', (data) {
    // Update member role
    // If it's you: Enable co-host controls
  });
  
  socket?.on('moderatorAssigned', (data) {
    // Update member role
    // If it's you: Enable moderator controls
  });
  
  // Handle user removal
  socket?.on('removedFromSpace', (data) {
    // Remove from member list
    // If it's you: Leave voice chat
  });
  
  socket?.on('userBanned', (data) {
    // Remove from member list
    // If it's you: Leave immediately, show banned message
  });
  
  // Handle room end
  socket?.on('voiceChatEnded', (data) {
    // Show summary
    // Disconnect from Agora
    // Navigate back
  });
  
  // Handle emoji reactions
  socket?.on('emojiReaction', (data) {
    // Show emoji animation
  });
}
```

---

## Flutter Code Examples

### Complete Service Class

```dart
import 'dart:convert';
import 'package:http/http.dart' as http;
import 'package:socket_io_client/socket_io_client.dart' as IO;

class VoiceMeetService {
  static const String baseUrl = '{{base_url}}';
  String? accessToken;
  IO.Socket? socket;
  String? currentUserId;
  String? currentVoiceMeetId;
  
  // Set access token
  void setAccessToken(String token) {
    accessToken = token;
  }
  
  // Get headers for API requests
  Map<String, String> getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': 'Bearer $accessToken',
    };
  }
  
  // Connect socket
  void connectSocket(String userId) {
    currentUserId = userId;
    
    socket = IO.io(
      baseUrl,
      IO.OptionBuilder()
        .setTransports(['websocket'])
        .setAuth({'userid': userId})
        .build(),
    );
    
    setupSocketListeners();
  }
  
  // Setup all socket listeners
  void setupSocketListeners() {
    socket?.on('connect', (_) => print('Socket connected'));
    socket?.on('disconnect', (_) => print('Socket disconnected'));
    
    socket?.on('newUserJoined', _handleNewUserJoined);
    socket?.on('memberCount', _handleMemberCount);
    socket?.on('speakingRequest', _handleSpeakingRequest);
    socket?.on('speakingRequestApproved', _handleSpeakingRequestApproved);
    socket?.on('speakingRequestDenied', _handleSpeakingRequestDenied);
    socket?.on('userMuted', _handleUserMuted);
    socket?.on('userUnmuted', _handleUserUnmuted);
    socket?.on('coHostAssigned', _handleCoHostAssigned);
    socket?.on('moderatorAssigned', _handleModeratorAssigned);
    socket?.on('movedToListener', _handleMovedToListener);
    socket?.on('removedFromSpace', _handleRemovedFromSpace);
    socket?.on('userBanned', _handleUserBanned);
    socket?.on('userReported', _handleUserReported);
    socket?.on('emojiReaction', _handleEmojiReaction);
    socket?.on('voiceChatEnded', _handleVoiceChatEnded);
    socket?.on('messagePinned', _handleMessagePinned);
    socket?.on('userKicked', _handleUserKicked);
    socket?.on('streamended', _handleStreamEnded);
  }
  
  // Socket event handlers
  void _handleNewUserJoined(dynamic data) {
    // Implement your handler
  }
  
  // ... (implement all handlers)
  
  // API Methods
  Future<Map<String, dynamic>> createVoiceMeet({
    required String userid,
    required String clubid,
    List<String>? members,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/voicemeet/createVoiceMeet'),
      headers: getHeaders(),
      body: jsonEncode({
        'userid': userid,
        'clubid': clubid,
        'members': members ?? [],
      }),
    );
    
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      currentVoiceMeetId = data['_id'];
      connectSocket(userid);
      return data;
    } else {
      throw Exception(jsonDecode(response.body)['error']);
    }
  }
  
  Future<Map<String, dynamic>> joinVoiceMeet({
    required String userid,
    required String streamid,
  }) async {
    final response = await http.patch(
      Uri.parse('$baseUrl/voicemeet/joinStream'),
      headers: getHeaders(),
      body: jsonEncode({
        'userid': userid,
        'streamid': streamid,
      }),
    );
    
    if (response.statusCode == 200) {
      final data = jsonDecode(response.body);
      currentVoiceMeetId = streamid;
      connectSocket(userid);
      return data;
    } else {
      throw Exception(jsonDecode(response.body)['error']);
    }
  }
  
  Future<void> requestToSpeak({
    required String userid,
    required String voicemeetid,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/voicemeet/requestToSpeak'),
      headers: getHeaders(),
      body: jsonEncode({
        'userid': userid,
        'voicemeetid': voicemeetid,
      }),
    );
    
    if (response.statusCode != 200) {
      throw Exception(jsonDecode(response.body)['error']);
    }
  }
  
  Future<void> approveSpeakingRequest({
    required String userid,
    required String voicemeetid,
    required String requesterid,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/voicemeet/approveSpeakingRequest'),
      headers: getHeaders(),
      body: jsonEncode({
        'userid': userid,
        'voicemeetid': voicemeetid,
        'requesterid': requesterid,
      }),
    );
    
    if (response.statusCode != 200) {
      throw Exception(jsonDecode(response.body)['error']);
    }
  }
  
  Future<void> muteSpeaker({
    required String userid,
    required String voicemeetid,
    required String targetUserid,
    String muteType = 'hard',
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/voicemeet/muteSpeaker'),
      headers: getHeaders(),
      body: jsonEncode({
        'userid': userid,
        'voicemeetid': voicemeetid,
        'targetUserid': targetUserid,
        'muteType': muteType,
      }),
    );
    
    if (response.statusCode != 200) {
      throw Exception(jsonDecode(response.body)['error']);
    }
  }
  
  // Add all other API methods following the same pattern...
  
  // Cleanup
  void disconnect() {
    socket?.disconnect();
    socket?.dispose();
  }
}
```

---

## Important Notes

1. **All APIs require Bearer token** in Authorization header
2. **Socket connection requires userid** in auth object
3. **All socket events are broadcasted to ALL members** - handle accordingly
4. **Check user roles** before showing/hiding UI controls
5. **Handle socket events immediately** - don't wait for API polling
6. **Update Agora SDK state** when mute/unmute events are received
7. **Navigate away** when user is removed/banned or room ends
8. **Store access token securely** (use secure storage in Flutter)

---

## Error Handling

All APIs return errors in this format:
```dart
{
  "error": "Error message here"
}
```

Common HTTP status codes:
- `200` - Success
- `400` - Bad Request (validation errors, permission denied, etc.)
- `404` - Not Found

Always check `response.statusCode` and handle errors appropriately.

---

This guide provides complete information for implementing VoiceMeet and Space-X voice chat in Flutter. Use this as a reference when integrating the APIs and socket events into your Flutter application.

