# Flutter Implementation Guide - X-Space Style Voice Chat

## Overview
This guide provides step-by-step instructions for implementing the X-Space style voice chat features in your Flutter application. It covers API integration, state management, UI components, and real-time updates using Socket.IO.

---

## Table of Contents
1. [Setup & Dependencies](#setup--dependencies)
2. [API Service Layer](#api-service-layer)
3. [State Management](#state-management)
4. [Socket.IO Integration](#socketio-integration)
5. [UI Components](#ui-components)
6. [Workflow Implementation](#workflow-implementation)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## Setup & Dependencies

### Required Packages

Add these dependencies to your `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  http: ^1.1.0
  socket_io_client: ^2.0.3+1
  provider: ^6.1.1  # or riverpod, bloc, etc.
  shared_preferences: ^2.2.2
  permission_handler: ^11.0.1
  agora_rtc_engine: ^6.3.0  # For voice chat functionality
```

### Permissions

Add to `android/app/src/main/AndroidManifest.xml`:
```xml
<uses-permission android:name="android.permission.INTERNET"/>
<uses-permission android:name="android.permission.RECORD_AUDIO"/>
<uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS"/>
```

Add to `ios/Runner/Info.plist`:
```xml
<key>NSMicrophoneUsageDescription</key>
<string>We need microphone access for voice chat</string>
```

---

## API Service Layer

### Create API Service Class

```dart
// lib/services/voice_chat_service.dart
import 'dart:convert';
import 'package:http/http.dart' as http;

class VoiceChatService {
  final String baseUrl = 'YOUR_API_BASE_URL';
  final String? authToken; // Get from SharedPreferences or Auth service

  VoiceChatService(this.authToken);

  Map<String, String> get _headers => {
    'Content-Type': 'application/json',
    'Authorization': 'Bearer $authToken',
  };

  // Request to Speak
  Future<Map<String, dynamic>> requestToSpeak({
    required String userId,
    required String voiceMeetId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/requestToSpeak'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Approve Speaking Request
  Future<Map<String, dynamic>> approveSpeakingRequest({
    required String userId,
    required String voiceMeetId,
    required String requesterId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/approveSpeakingRequest'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'requesterid': requesterId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Deny Speaking Request
  Future<Map<String, dynamic>> denySpeakingRequest({
    required String userId,
    required String voiceMeetetId,
    required String requesterId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/denySpeakingRequest'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetetId,
        'requesterid': requesterId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Get Speaking Requests
  Future<Map<String, dynamic>> getSpeakingRequests({
    required String userId,
    required String voiceMeetId,
  }) async {
    final response = await http.get(
      Uri.parse('$baseUrl/api/voicemeet/getSpeakingRequests/$userId?voicemeetid=$voiceMeetId'),
      headers: _headers,
    );
    return jsonDecode(response.body);
  }

  // Mute Speaker
  Future<Map<String, dynamic>> muteSpeaker({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
    String muteType = 'hard',
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/muteSpeaker'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
        'muteType': muteType,
      }),
    );
    return jsonDecode(response.body);
  }

  // Unmute Speaker
  Future<Map<String, dynamic>> unmuteSpeaker({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/unmuteSpeaker'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Assign Co-Host
  Future<Map<String, dynamic>> assignCoHost({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/assignCoHost'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Assign Moderator
  Future<Map<String, dynamic>> assignModerator({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/assignModerator'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Move to Listener
  Future<Map<String, dynamic>> moveToListener({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/moveToListener'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Remove from Space
  Future<Map<String, dynamic>> removeFromSpace({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/removeFromSpace'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Ban User
  Future<Map<String, dynamic>> banUser({
    required String userId,
    required String voiceMeetId,
    required String targetUserId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/banUser'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'targetUserid': targetUserId,
      }),
    );
    return jsonDecode(response.body);
  }

  // Report User in Space
  Future<Map<String, dynamic>> reportUserInSpace({
    required String userId,
    required String voiceMeetId,
    required String reportedUserId,
    String? reason,
    String? reportType,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/reportUserInSpace'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'reportedUserid': reportedUserId,
        'reason': reason,
        'reportType': reportType,
      }),
    );
    return jsonDecode(response.body);
  }

  // React with Emoji
  Future<Map<String, dynamic>> reactWithEmoji({
    required String userId,
    required String voiceMeetId,
    required String emoji,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/reactWithEmoji'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
        'emoji': emoji,
      }),
    );
    return jsonDecode(response.body);
  }

  // Share Room
  Future<Map<String, dynamic>> shareRoom({
    required String userId,
    required String voiceMeetId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/shareRoom'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
      }),
    );
    return jsonDecode(response.body);
  }

  // End Voice Chat
  Future<Map<String, dynamic>> endVoiceChat({
    required String userId,
    required String voiceMeetId,
  }) async {
    final response = await http.post(
      Uri.parse('$baseUrl/api/voicemeet/endVoiceChat'),
      headers: _headers,
      body: jsonEncode({
        'userid': userId,
        'voicemeetid': voiceMeetId,
      }),
    );
    return jsonDecode(response.body);
  }
}
```

---

## State Management

### Voice Chat State Model

```dart
// lib/models/voice_chat_state.dart
class VoiceChatState {
  final String? voiceMeetId;
  final String? userId;
  final UserRole? role;
  final bool isMuted;
  final bool isSpeaking;
  final List<SpeakingRequest> speakingRequests;
  final List<User> speakers;
  final List<User> listeners;
  final bool isActive;

  VoiceChatState({
    this.voiceMeetId,
    this.userId,
    this.role,
    this.isMuted = false,
    this.isSpeaking = false,
    this.speakingRequests = const [],
    this.speakers = const [],
    this.listeners = const [],
    this.isActive = true,
  });

  VoiceChatState copyWith({
    String? voiceMeetId,
    String? userId,
    UserRole? role,
    bool? isMuted,
    bool? isSpeaking,
    List<SpeakingRequest>? speakingRequests,
    List<User>? speakers,
    List<User>? listeners,
    bool? isActive,
  }) {
    return VoiceChatState(
      voiceMeetId: voiceMeetId ?? this.voiceMeetId,
      userId: userId ?? this.userId,
      role: role ?? this.role,
      isMuted: isMuted ?? this.isMuted,
      isSpeaking: isSpeaking ?? this.isSpeaking,
      speakingRequests: speakingRequests ?? this.speakingRequests,
      speakers: speakers ?? this.speakers,
      listeners: listeners ?? this.listeners,
      isActive: isActive ?? this.isActive,
    );
  }
}

enum UserRole {
  host,
  coHost,
  moderator,
  speaker,
  listener,
}

class SpeakingRequest {
  final String userId;
  final String username;
  final String profilePicture;
  final DateTime requestedAt;

  SpeakingRequest({
    required this.userId,
    required this.username,
    required this.profilePicture,
    required this.requestedAt,
  });

  factory SpeakingRequest.fromJson(Map<String, dynamic> json) {
    return SpeakingRequest(
      userId: json['userid'],
      username: json['username'],
      profilePicture: json['profilePicture'],
      requestedAt: DateTime.parse(json['requestedAt']),
    );
  }
}
```

### Provider/Bloc Example

```dart
// lib/providers/voice_chat_provider.dart
import 'package:flutter/foundation.dart';
import '../services/voice_chat_service.dart';
import '../models/voice_chat_state.dart';

class VoiceChatProvider with ChangeNotifier {
  final VoiceChatService _service;
  VoiceChatState _state = VoiceChatState();

  VoiceChatState get state => _state;

  VoiceChatProvider(this._service);

  Future<void> requestToSpeak() async {
    try {
      final response = await _service.requestToSpeak(
        userId: _state.userId!,
        voiceMeetId: _state.voiceMeetId!,
      );
      if (response['success'] == true) {
        // Handle success
        notifyListeners();
      }
    } catch (e) {
      // Handle error
    }
  }

  Future<void> approveRequest(String requesterId) async {
    try {
      final response = await _service.approveSpeakingRequest(
        userId: _state.userId!,
        voiceMeetId: _state.voiceMeetId!,
        requesterId: requesterId,
      );
      if (response['success'] == true) {
        _state = _state.copyWith(
          speakingRequests: _state.speakingRequests
              .where((req) => req.userId != requesterId)
              .toList(),
        );
        notifyListeners();
      }
    } catch (e) {
      // Handle error
    }
  }

  // Add similar methods for other actions...
}
```

---

## Socket.IO Integration

### Socket Service

```dart
// lib/services/socket_service.dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  IO.Socket? _socket;
  final String socketUrl = 'YOUR_SOCKET_URL';

  void connect(String userId) {
    _socket = IO.io(
      socketUrl,
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setQuery({'userId': userId})
          .build(),
    );

    _socket!.connect();

    // Listen to events
    // All events are broadcasted to ALL members for real-time synchronization
    
    _socket!.on('speakingRequest', (data) {
      // Handle new speaking request (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final requester = data['requester'];
      // Update UI to show new speaking request
    });

    _socket!.on('speakingRequestApproved', (data) {
      // Handle speaking request approved (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final requesterid = data['requesterid'];
      final requester = data['requester'];
      // Update UI: move user from listeners to speakers
      // Update speaking requests list
    });

    _socket!.on('speakingRequestDenied', (data) {
      // Handle speaking request denied (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final requesterid = data['requesterid'];
      final requester = data['requester'];
      // Update UI: remove from speaking requests list
    });

    _socket!.on('userMuted', (data) {
      // Handle user muted (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final muteType = data['muteType']; // 'hard' or 'soft'
      final mutedBy = data['mutedBy'];
      // Update UI: show muted indicator for the user
      // Update Agora mute state if needed
    });

    _socket!.on('userUnmuted', (data) {
      // Handle user unmuted (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final unmutedBy = data['unmutedBy'];
      // Update UI: remove muted indicator
      // Update Agora mute state if needed
    });

    _socket!.on('movedToListener', (data) {
      // Handle moved to listener (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final movedBy = data['movedBy'];
      // Update UI: move user from speakers to listeners
    });

    _socket!.on('removedFromSpace', (data) {
      // Handle removed from space (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final removedBy = data['removedBy'];
      // Update UI: remove user from all lists
      // If current user was removed, navigate away
    });

    _socket!.on('userBanned', (data) {
      // Handle user banned (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final bannedBy = data['bannedBy'];
      // Update UI: remove user from all lists
      // If current user was banned, navigate away
    });

    _socket!.on('coHostAssigned', (data) {
      // Handle co-host assigned (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final assignedBy = data['assignedBy'];
      // Update UI: show co-host badge/indicator
    });

    _socket!.on('moderatorAssigned', (data) {
      // Handle moderator assigned (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final targetUserid = data['targetUserid'];
      final targetUser = data['targetUser'];
      final assignedBy = data['assignedBy'];
      // Update UI: show moderator badge/indicator
    });

    _socket!.on('userReported', (data) {
      // Handle user reported (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final reportedUserid = data['reportedUserid'];
      final reportedUser = data['reportedUser'];
      final reportedBy = data['reportedBy'];
      final reportType = data['reportType'];
      final reason = data['reason'];
      // Update UI: show report indicator (if moderator/host)
    });

    _socket!.on('messagePinned', (data) {
      // Handle message pinned (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final messageid = data['messageid'];
      final pinnedBy = data['pinnedBy'];
      // Update UI: show pinned message
    });

    _socket!.on('emojiReaction', (data) {
      // Handle emoji reaction (broadcasted to all members)
      final userId = data['userid'];
      final username = data['username'];
      final profilePicture = data['profilePicture'];
      final emoji = data['emoji'];
      final voicemeetid = data['voicemeetid'];
      // Update UI: show emoji reaction animation
    });

    _socket!.on('voiceChatEnded', (data) {
      // Handle voice chat ended (broadcasted to all members)
      final voicemeetid = data['voicemeetid'];
      final summary = data['summary'];
      // Update UI: show summary and navigate away
      // Disconnect from Agora
    });

    _socket!.on('newUserJoined', (data) {
      // Handle new user joined
      // Update UI: add user to members list
    });

    _socket!.on('userLeft', (data) {
      // Handle user left
      // Update UI: remove user from members list
    });
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
  }

  void emit(String event, Map<String, dynamic> data) {
    _socket?.emit(event, data);
  }
}
```

---

## UI Components

### Speaking Request Button (Listener)

```dart
// lib/widgets/request_to_speak_button.dart
import 'package:flutter/material.dart';

class RequestToSpeakButton extends StatelessWidget {
  final VoidCallback onPressed;
  final bool isRequested;

  const RequestToSpeakButton({
    Key? key,
    required this.onPressed,
    this.isRequested = false,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return ElevatedButton.icon(
      onPressed: isRequested ? null : onPressed,
      icon: Icon(Icons.mic),
      label: Text(isRequested ? 'Requested' : 'Request to Speak'),
      style: ElevatedButton.styleFrom(
        backgroundColor: isRequested ? Colors.grey : Colors.blue,
      ),
    );
  }
}
```

### Speaking Requests List (Host/Moderator)

```dart
// lib/widgets/speaking_requests_list.dart
import 'package:flutter/material.dart';
import '../models/voice_chat_state.dart';

class SpeakingRequestsList extends StatelessWidget {
  final List<SpeakingRequest> requests;
  final Function(String) onApprove;
  final Function(String) onDeny;

  const SpeakingRequestsList({
    Key? key,
    required this.requests,
    required this.onApprove,
    required this.onDeny,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    if (requests.isEmpty) {
      return Center(child: Text('No speaking requests'));
    }

    return ListView.builder(
      itemCount: requests.length,
      itemBuilder: (context, index) {
        final request = requests[index];
        return ListTile(
          leading: CircleAvatar(
            backgroundImage: NetworkImage(request.profilePicture),
          ),
          title: Text(request.username),
          subtitle: Text('Requested ${_timeAgo(request.requestedAt)}'),
          trailing: Row(
            mainAxisSize: MainAxisSize.min,
            children: [
              IconButton(
                icon: Icon(Icons.check, color: Colors.green),
                onPressed: () => onApprove(request.userId),
              ),
              IconButton(
                icon: Icon(Icons.close, color: Colors.red),
                onPressed: () => onDeny(request.userId),
              ),
            ],
          ),
        );
      },
    );
  }

  String _timeAgo(DateTime dateTime) {
    final now = DateTime.now();
    final difference = now.difference(dateTime);
    if (difference.inMinutes < 1) return 'just now';
    if (difference.inMinutes < 60) return '${difference.inMinutes}m ago';
    if (difference.inHours < 24) return '${difference.inHours}h ago';
    return '${difference.inDays}d ago';
  }
}
```

### Emoji Reaction Widget

```dart
// lib/widgets/emoji_reaction_widget.dart
import 'package:flutter/material.dart';

class EmojiReactionWidget extends StatelessWidget {
  final Function(String) onEmojiSelected;

  const EmojiReactionWidget({
    Key? key,
    required this.onEmojiSelected,
  }) : super(key: key);

  final List<String> emojis = ['👍', '👏', '❤️', '😂', '🔥', '🎉'];

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: EdgeInsets.all(8),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceEvenly,
        children: emojis.map((emoji) {
          return GestureDetector(
            onTap: () => onEmojiSelected(emoji),
            child: Container(
              padding: EdgeInsets.all(8),
              child: Text(
                emoji,
                style: TextStyle(fontSize: 24),
              ),
            ),
          );
        }).toList(),
      ),
    );
  }
}
```

### User Action Menu (Host/Moderator)

```dart
// lib/widgets/user_action_menu.dart
import 'package:flutter/material.dart';

class UserActionMenu extends StatelessWidget {
  final String userId;
  final bool isHost;
  final bool isModerator;
  final bool isCoHost;
  final Function(String) onMute;
  final Function(String) onUnmute;
  final Function(String) onMoveToListener;
  final Function(String) onRemove;
  final Function(String) onBan;
  final Function(String) onAssignModerator;
  final Function(String) onAssignCoHost;

  const UserActionMenu({
    Key? key,
    required this.userId,
    required this.isHost,
    required this.isModerator,
    required this.isCoHost,
    required this.onMute,
    required this.onUnmute,
    required this.onMoveToListener,
    required this.onRemove,
    required this.onBan,
    required this.onAssignModerator,
    required this.onAssignCoHost,
  }) : super(key: key);

  @override
  Widget build(BuildContext context) {
    return PopupMenuButton<String>(
      onSelected: (value) {
        switch (value) {
          case 'mute':
            onMute(userId);
            break;
          case 'unmute':
            onUnmute(userId);
            break;
          case 'move_to_listener':
            onMoveToListener(userId);
            break;
          case 'remove':
            onRemove(userId);
            break;
          case 'ban':
            onBan(userId);
            break;
          case 'assign_moderator':
            onAssignModerator(userId);
            break;
          case 'assign_cohost':
            onAssignCoHost(userId);
            break;
        }
      },
      itemBuilder: (context) => [
        if (isHost || isModerator || isCoHost)
          PopupMenuItem(value: 'mute', child: Text('Mute')),
        if (isHost || isModerator || isCoHost)
          PopupMenuItem(value: 'unmute', child: Text('Unmute')),
        if (isHost || isModerator || isCoHost)
          PopupMenuItem(value: 'move_to_listener', child: Text('Move to Listener')),
        if (isHost || isModerator || isCoHost)
          PopupMenuItem(value: 'remove', child: Text('Remove from Space')),
        if (isHost || isModerator || isCoHost)
          PopupMenuItem(value: 'ban', child: Text('Ban User')),
        if (isHost || isCoHost)
          PopupMenuItem(value: 'assign_moderator', child: Text('Assign Moderator')),
        if (isHost)
          PopupMenuItem(value: 'assign_cohost', child: Text('Assign Co-Host')),
      ],
    );
  }
}
```

---

## Workflow Implementation

### Complete Voice Chat Screen Example

```dart
// lib/screens/voice_chat_screen.dart
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import '../providers/voice_chat_provider.dart';
import '../widgets/request_to_speak_button.dart';
import '../widgets/speaking_requests_list.dart';
import '../widgets/emoji_reaction_widget.dart';

class VoiceChatScreen extends StatefulWidget {
  final String voiceMeetId;
  final String userId;

  const VoiceChatScreen({
    Key? key,
    required this.voiceMeetId,
    required this.userId,
  }) : super(key: key);

  @override
  State<VoiceChatScreen> createState() => _VoiceChatScreenState();
}

class _VoiceChatScreenState extends State<VoiceChatScreen> {
  @override
  void initState() {
    super.initState();
    // Initialize voice chat state
    // Connect to socket
    // Join Agora channel
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: Text('Voice Chat'),
        actions: [
          // End chat button (host only)
          if (Provider.of<VoiceChatProvider>(context).state.role == UserRole.host)
            IconButton(
              icon: Icon(Icons.close),
              onPressed: () => _showEndChatDialog(context),
            ),
        ],
      ),
      body: Consumer<VoiceChatProvider>(
        builder: (context, provider, child) {
          final state = provider.state;
          final isListener = state.role == UserRole.listener;
          final isHost = state.role == UserRole.host;
          final isModerator = state.role == UserRole.moderator || 
                            state.role == UserRole.coHost;

          return Column(
            children: [
              // Speaking requests panel (host/moderator only)
              if (isHost || isModerator)
                Expanded(
                  flex: 2,
                  child: Card(
                    child: Column(
                      children: [
                        Text('Speaking Requests'),
                        Expanded(
                          child: SpeakingRequestsList(
                            requests: state.speakingRequests,
                            onApprove: (userId) => provider.approveRequest(userId),
                            onDeny: (userId) => provider.denyRequest(userId),
                          ),
                        ),
                      ],
                    ),
                  ),
                ),

              // Speakers list
              Expanded(
                flex: 3,
                child: ListView.builder(
                  itemCount: state.speakers.length,
                  itemBuilder: (context, index) {
                    final speaker = state.speakers[index];
                    return ListTile(
                      leading: CircleAvatar(
                        backgroundImage: NetworkImage(speaker.profilePicture),
                      ),
                      title: Text(speaker.username),
                      trailing: isHost || isModerator
                          ? UserActionMenu(
                              userId: speaker.id,
                              isHost: isHost,
                              isModerator: isModerator,
                              isCoHost: state.role == UserRole.coHost,
                              onMute: (id) => provider.muteUser(id),
                              onUnmute: (id) => provider.unmuteUser(id),
                              onMoveToListener: (id) => provider.moveToListener(id),
                              onRemove: (id) => provider.removeUser(id),
                              onBan: (id) => provider.banUser(id),
                              onAssignModerator: (id) => provider.assignModerator(id),
                              onAssignCoHost: (id) => provider.assignCoHost(id),
                            )
                          : null,
                    );
                  },
                ),
              ),

              // Listener actions
              if (isListener)
                Padding(
                  padding: EdgeInsets.all(16),
                  child: RequestToSpeakButton(
                    onPressed: () => provider.requestToSpeak(),
                    isRequested: state.speakingRequests
                        .any((req) => req.userId == widget.userId),
                  ),
                ),

              // Emoji reactions
              EmojiReactionWidget(
                onEmojiSelected: (emoji) => provider.reactWithEmoji(emoji),
              ),
            ],
          );
        },
      ),
    );
  }

  void _showEndChatDialog(BuildContext context) {
    showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('End Voice Chat?'),
        content: Text('Are you sure you want to end this voice chat?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(context),
            child: Text('Cancel'),
          ),
          TextButton(
            onPressed: () {
              Provider.of<VoiceChatProvider>(context, listen: false)
                  .endVoiceChat();
              Navigator.pop(context);
              Navigator.pop(context);
            },
            child: Text('End Chat'),
          ),
        ],
      ),
    );
  }
}
```

---

## Error Handling

### Error Handler Utility

```dart
// lib/utils/error_handler.dart
class ErrorHandler {
  static void handleError(BuildContext context, dynamic error) {
    String message = 'An error occurred';
    
    if (error is Map<String, dynamic> && error.containsKey('error')) {
      message = error['error'];
    } else if (error is String) {
      message = error;
    }

    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(
        content: Text(message),
        backgroundColor: Colors.red,
      ),
    );
  }

  static Future<bool> handleApiResponse(
    BuildContext context,
    Map<String, dynamic> response,
  ) async {
    if (response['success'] == true) {
      return true;
    } else {
      handleError(context, response['error'] ?? 'Operation failed');
      return false;
    }
  }
}
```

### Usage in Provider

```dart
Future<void> requestToSpeak() async {
  try {
    final response = await _service.requestToSpeak(
      userId: _state.userId!,
      voiceMeetId: _state.voiceMeetId!,
    );
    
    if (response['success'] == true) {
      // Update state
      notifyListeners();
    } else {
      throw Exception(response['error'] ?? 'Failed to request speaking');
    }
  } catch (e) {
    // Log error or show to user
    rethrow;
  }
}
```

---

## Best Practices

### 1. **State Management**
- Use a single source of truth for voice chat state
- Update state immediately for optimistic UI updates
- Sync with server responses

### 2. **Socket.IO**
- Always check socket connection before emitting
- Handle reconnection scenarios
- Clean up listeners on dispose
- **Important:** All socket events are broadcasted to ALL members of the voicemeet. Always update your local state when receiving these events to keep the UI synchronized with the server state.
- Handle events even if they don't directly affect the current user (e.g., when another user is muted, update your UI to show their muted status)

### 3. **Permissions**
- Request microphone permission before joining
- Handle permission denial gracefully
- Show clear error messages

### 4. **UI/UX**
- Show loading states during API calls
- Provide feedback for all actions
- Handle edge cases (banned users, ended rooms, etc.)

### 5. **Performance**
- Debounce emoji reactions
- Limit speaking requests list size
- Cache user profile pictures

### 6. **Testing**
- Test all user roles and permissions
- Test socket event handling
- Test error scenarios

---

## Example Integration Flow

1. **User joins voice chat:**
   ```dart
   // Initialize state
   // Connect to socket
   // Join Agora channel
   // Fetch current room state
   ```

2. **Listener requests to speak:**
   ```dart
   // Call requestToSpeak API
   // Update UI to show "Requested" state
   // Listen for socket event: speakingRequestApproved
   ```

3. **Host approves request:**
   ```dart
   // Call approveSpeakingRequest API
   // Update state: move user from listeners to speakers
   // Emit socket event to notify user
   ```

4. **Speaker gets muted:**
   ```dart
   // Listen for socket event: userMuted
   // Update Agora mute state
   // Show UI indicator
   ```

5. **Host ends chat:**
   ```dart
   // Call endVoiceChat API
   // Receive summary
   // Disconnect from socket
   // Leave Agora channel
   // Navigate back
   ```

---

## Additional Resources

- [Agora RTC Flutter SDK Documentation](https://docs.agora.io/en/video-calling/get-started/get-started-sdk?platform=flutter)
- [Socket.IO Flutter Client](https://pub.dev/packages/socket_io_client)
- [Flutter State Management](https://flutter.dev/docs/development/data-and-backend/state-mgmt)

---

## Support

For implementation questions or issues, refer to the API documentation or contact the development team.

