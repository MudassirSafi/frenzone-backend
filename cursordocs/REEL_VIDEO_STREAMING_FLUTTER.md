# Reel Video Streaming - Flutter Integration Guide

## Overview

This guide explains how to integrate the video streaming API into your Flutter application using the `video_player` plugin. The streaming implementation enables smooth, TikTok-like video playback with efficient chunked delivery.

---

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Setup](#setup)
3. [Basic Implementation](#basic-implementation)
4. [Advanced Features](#advanced-features)
5. [Performance Optimization](#performance-optimization)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)
8. [Troubleshooting](#troubleshooting)

---

## Prerequisites

### Required Packages

Add these dependencies to your `pubspec.yaml`:

```yaml
dependencies:
  flutter:
    sdk: flutter
  video_player: ^2.8.2
  http: ^1.1.0
  provider: ^6.1.1  # or your preferred state management
```

### Permissions

**Android (`android/app/src/main/AndroidManifest.xml`):**
```xml
<uses-permission android:name="android.permission.INTERNET"/>
```

**iOS (`ios/Runner/Info.plist`):**
```xml
<key>NSAppTransportSecurity</key>
<dict>
  <key>NSAllowsArbitraryLoads</key>
  <true/>
</dict>
```

---

## Setup

### 1. Install Dependencies

```bash
flutter pub get
```

### 2. Import Required Packages

```dart
import 'package:video_player/video_player.dart';
import 'package:http/http.dart' as http;
import 'dart:convert';
```

---

## Basic Implementation

### Simple Video Player Widget

```dart
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';

class StreamingReelPlayer extends StatefulWidget {
  final String reelId;
  final String? authToken;

  const StreamingReelPlayer({
    Key? key,
    required this.reelId,
    this.authToken,
  }) : super(key: key);

  @override
  State<StreamingReelPlayer> createState() => _StreamingReelPlayerState();
}

class _StreamingReelPlayerState extends State<StreamingReelPlayer> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  bool _isLoading = true;
  String? _error;

  @override
  void initState() {
    super.initState();
    _initializePlayer();
  }

  Future<void> _initializePlayer() async {
    try {
      // Build streaming URL
      final streamUrl = '${YOUR_API_BASE_URL}/api/reel/stream/${widget.reelId}';
      
      // Create video controller with streaming URL
      _controller = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: widget.authToken != null
            ? {'Authorization': 'Bearer ${widget.authToken}'}
            : {},
      );

      // Initialize the controller
      await _controller.initialize();

      // Auto-play
      _controller.setLooping(true);
      _controller.play();

      setState(() {
        _isInitialized = true;
        _isLoading = false;
      });
    } catch (e) {
      setState(() {
        _error = e.toString();
        _isLoading = false;
      });
    }
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Text('Error: $_error'),
      );
    }

    if (!_isInitialized) {
      return const SizedBox.shrink();
    }

    return AspectRatio(
      aspectRatio: _controller.value.aspectRatio,
      child: VideoPlayer(_controller),
    );
  }
}
```

### Usage

```dart
StreamingReelPlayer(
  reelId: '507f1f77bcf86cd799439011',
  authToken: 'your_auth_token',
)
```

---

## Advanced Features

### 1. Reel Feed with Streaming

```dart
class ReelFeedScreen extends StatefulWidget {
  @override
  State<ReelFeedScreen> createState() => _ReelFeedScreenState();
}

class _ReelFeedScreenState extends State<ReelFeedScreen> {
  final PageController _pageController = PageController();
  final Map<String, VideoPlayerController> _controllers = {};
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    _loadReels();
  }

  Future<void> _loadReels() async {
    // Fetch reels from your API
    final reels = await fetchReels();
    
    // Preload first 3 videos
    for (int i = 0; i < reels.length && i < 3; i++) {
      _initializeController(reels[i].id);
    }
  }

  Future<void> _initializeController(String reelId) async {
    if (_controllers.containsKey(reelId)) return;

    final streamUrl = '${YOUR_API_BASE_URL}/api/reel/stream/$reelId';
    
    final controller = VideoPlayerController.networkUrl(
      Uri.parse(streamUrl),
      httpHeaders: {'Authorization': 'Bearer ${YOUR_TOKEN}'},
      videoPlayerOptions: VideoPlayerOptions(
        mixWithOthers: true,
        allowBackgroundPlayback: false,
      ),
    );

    await controller.initialize();
    controller.setLooping(true);
    
    setState(() {
      _controllers[reelId] = controller;
    });
  }

  void _onPageChanged(int index) {
    // Pause previous video
    if (_currentIndex < _controllers.length) {
      final prevReelId = _reels[_currentIndex].id;
      _controllers[prevReelId]?.pause();
    }

    // Play current video
    _currentIndex = index;
    final currentReelId = _reels[index].id;
    _controllers[currentReelId]?.play();

    // Preload next videos
    if (index + 1 < _reels.length) {
      _initializeController(_reels[index + 1].id);
    }
    if (index + 2 < _reels.length) {
      _initializeController(_reels[index + 2].id);
    }
  }

  @override
  Widget build(BuildContext context) {
    return PageView.builder(
      controller: _pageController,
      scrollDirection: Axis.vertical,
      onPageChanged: _onPageChanged,
      itemCount: _reels.length,
      itemBuilder: (context, index) {
        final reel = _reels[index];
        final controller = _controllers[reel.id];

        if (controller == null || !controller.value.isInitialized) {
          return const Center(child: CircularProgressIndicator());
        }

        return Stack(
          children: [
            // Video Player
            Center(
              child: AspectRatio(
                aspectRatio: controller.value.aspectRatio,
                child: VideoPlayer(controller),
              ),
            ),
            // Overlay UI (like, comment buttons, etc.)
            _buildOverlay(reel),
          ],
        );
      },
    );
  }

  Widget _buildOverlay(Reel reel) {
    return Positioned(
      bottom: 0,
      left: 0,
      right: 0,
      child: Container(
        padding: const EdgeInsets.all(16),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            // Left side: User info, description
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text('@${reel.username}'),
                  Text(reel.description),
                ],
              ),
            ),
            // Right side: Action buttons
            Column(
              children: [
                IconButton(
                  icon: const Icon(Icons.favorite),
                  onPressed: () => _likeReel(reel.id),
                ),
                IconButton(
                  icon: const Icon(Icons.comment),
                  onPressed: () => _showComments(reel.id),
                ),
                IconButton(
                  icon: const Icon(Icons.share),
                  onPressed: () => _shareReel(reel.id),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  @override
  void dispose() {
    _controllers.values.forEach((controller) => controller.dispose());
    _pageController.dispose();
    super.dispose();
  }
}
```

### 2. Video Player Service

```dart
class VideoStreamingService {
  static const String baseUrl = 'YOUR_API_BASE_URL';

  /// Get streaming URL for a reel
  static String getStreamingUrl(String reelId) {
    return '$baseUrl/api/reel/stream/$reelId';
  }

  /// Create video player controller with streaming
  static VideoPlayerController createStreamingController(
    String reelId, {
    String? authToken,
    Map<String, String>? additionalHeaders,
  }) {
    final headers = <String, String>{};
    
    if (authToken != null) {
      headers['Authorization'] = 'Bearer $authToken';
    }
    
    if (additionalHeaders != null) {
      headers.addAll(additionalHeaders);
    }

    return VideoPlayerController.networkUrl(
      Uri.parse(getStreamingUrl(reelId)),
      httpHeaders: headers,
      videoPlayerOptions: VideoPlayerOptions(
        mixWithOthers: true,
        allowBackgroundPlayback: false,
      ),
    );
  }

  /// Preload video (initialize without playing)
  static Future<VideoPlayerController> preloadVideo(
    String reelId, {
    String? authToken,
  }) async {
    final controller = createStreamingController(reelId, authToken: authToken);
    await controller.initialize();
    return controller;
  }
}
```

### 3. State Management with Provider

```dart
class ReelPlayerProvider with ChangeNotifier {
  final Map<String, VideoPlayerController> _controllers = {};
  String? _currentReelId;
  bool _isLoading = false;

  VideoPlayerController? getController(String reelId) {
    return _controllers[reelId];
  }

  Future<void> loadReel(String reelId, {String? authToken}) async {
    if (_controllers.containsKey(reelId)) {
      _currentReelId = reelId;
      notifyListeners();
      return;
    }

    _isLoading = true;
    notifyListeners();

    try {
      final controller = VideoStreamingService.createStreamingController(
        reelId,
        authToken: authToken,
      );

      await controller.initialize();
      controller.setLooping(true);

      _controllers[reelId] = controller;
      _currentReelId = reelId;
      _isLoading = false;
      
      notifyListeners();
    } catch (e) {
      _isLoading = false;
      notifyListeners();
      rethrow;
    }
  }

  void playReel(String reelId) {
    // Pause current
    if (_currentReelId != null && _controllers.containsKey(_currentReelId!)) {
      _controllers[_currentReelId!]?.pause();
    }

    // Play new
    _currentReelId = reelId;
    _controllers[reelId]?.play();
    notifyListeners();
  }

  void pauseReel(String reelId) {
    _controllers[reelId]?.pause();
    notifyListeners();
  }

  void disposeController(String reelId) {
    _controllers[reelId]?.dispose();
    _controllers.remove(reelId);
    if (_currentReelId == reelId) {
      _currentReelId = null;
    }
    notifyListeners();
  }

  @override
  void dispose() {
    _controllers.values.forEach((controller) => controller.dispose());
    super.dispose();
  }
}
```

---

## Performance Optimization

### 1. Preloading Strategy

```dart
class ReelPreloader {
  final List<String> _preloadQueue = [];
  final Map<String, VideoPlayerController> _preloaded = {};
  static const int maxPreload = 3;

  /// Preload next N videos
  Future<void> preloadNext(List<String> reelIds, int currentIndex) async {
    // Clear old preloaded videos
    _cleanupPreloaded(currentIndex);

    // Preload next videos
    for (int i = 1; i <= maxPreload && currentIndex + i < reelIds.length; i++) {
      final reelId = reelIds[currentIndex + i];
      if (!_preloaded.containsKey(reelId)) {
        _preloadVideo(reelId);
      }
    }
  }

  Future<void> _preloadVideo(String reelId) async {
    try {
      final controller = VideoStreamingService.createStreamingController(reelId);
      await controller.initialize();
      controller.pause(); // Don't auto-play
      _preloaded[reelId] = controller;
    } catch (e) {
      print('Preload error for $reelId: $e');
    }
  }

  void _cleanupPreloaded(int currentIndex) {
    // Dispose videos that are too far back
    final toRemove = <String>[];
    _preloaded.forEach((reelId, controller) {
      // Keep only current and next 3
      // Dispose others
      toRemove.add(reelId);
    });
    
    toRemove.forEach((reelId) {
      _preloaded[reelId]?.dispose();
      _preloaded.remove(reelId);
    });
  }

  VideoPlayerController? getPreloaded(String reelId) {
    return _preloaded[reelId];
  }

  void dispose() {
    _preloaded.values.forEach((controller) => controller.dispose());
    _preloaded.clear();
  }
}
```

### 2. Caching Strategy

```dart
class VideoCacheManager {
  static const int maxCacheSize = 5; // Max cached videos
  final Map<String, VideoPlayerController> _cache = {};

  VideoPlayerController? getCached(String reelId) {
    return _cache[reelId];
  }

  void cacheController(String reelId, VideoPlayerController controller) {
    // Remove oldest if cache is full
    if (_cache.length >= maxCacheSize) {
      final firstKey = _cache.keys.first;
      _cache[firstKey]?.dispose();
      _cache.remove(firstKey);
    }

    _cache[reelId] = controller;
  }

  void clearCache() {
    _cache.values.forEach((controller) => controller.dispose());
    _cache.clear();
  }
}
```

### 3. Network-Aware Loading

```dart
import 'package:connectivity_plus/connectivity_plus.dart';

class NetworkAwarePlayer {
  final Connectivity _connectivity = Connectivity();
  VideoQuality _currentQuality = VideoQuality.auto;

  Future<VideoPlayerController> createController(
    String reelId, {
    String? authToken,
  }) async {
    final connectivityResult = await _connectivity.checkConnectivity();
    
    // Adjust quality based on connection
    if (connectivityResult == ConnectivityResult.mobile) {
      // Lower quality for mobile data
      _currentQuality = VideoQuality.low;
    } else if (connectivityResult == ConnectivityResult.wifi) {
      _currentQuality = VideoQuality.high;
    }

    return VideoStreamingService.createStreamingController(
      reelId,
      authToken: authToken,
    );
  }
}

enum VideoQuality { low, medium, high, auto }
```

---

## Error Handling

### Comprehensive Error Handling

```dart
class StreamingReelPlayer extends StatefulWidget {
  final String reelId;
  final String? authToken;
  final Function(String)? onError;

  const StreamingReelPlayer({
    Key? key,
    required this.reelId,
    this.authToken,
    this.onError,
  }) : super(key: key);

  @override
  State<StreamingReelPlayer> createState() => _StreamingReelPlayerState();
}

class _StreamingReelPlayerState extends State<StreamingReelPlayer> {
  late VideoPlayerController _controller;
  bool _isInitialized = false;
  bool _isLoading = true;
  String? _error;
  int _retryCount = 0;
  static const int maxRetries = 3;

  Future<void> _initializePlayer() async {
    try {
      setState(() {
        _isLoading = true;
        _error = null;
      });

      final streamUrl = '${YOUR_API_BASE_URL}/api/reel/stream/${widget.reelId}';
      
      _controller = VideoPlayerController.networkUrl(
        Uri.parse(streamUrl),
        httpHeaders: widget.authToken != null
            ? {'Authorization': 'Bearer ${widget.authToken}'}
            : {},
      );

      // Listen for errors
      _controller.addListener(_videoListener);

      await _controller.initialize();
      _controller.setLooping(true);
      _controller.play();

      setState(() {
        _isInitialized = true;
        _isLoading = false;
        _retryCount = 0;
      });
    } catch (e) {
      _handleError(e);
    }
  }

  void _videoListener() {
    if (_controller.value.hasError) {
      _handleError(_controller.value.errorDescription ?? 'Unknown error');
    }
  }

  void _handleError(dynamic error) {
    if (_retryCount < maxRetries) {
      _retryCount++;
      Future.delayed(Duration(seconds: _retryCount), () {
        _initializePlayer();
      });
    } else {
      setState(() {
        _error = error.toString();
        _isLoading = false;
      });
      
      if (widget.onError != null) {
        widget.onError!(error.toString());
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    if (_isLoading) {
      return const Center(
        child: CircularProgressIndicator(),
      );
    }

    if (_error != null) {
      return Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.error_outline, size: 48, color: Colors.red),
            const SizedBox(height: 16),
            Text('Error loading video: $_error'),
            const SizedBox(height: 16),
            ElevatedButton(
              onPressed: () {
                _retryCount = 0;
                _initializePlayer();
              },
              child: const Text('Retry'),
            ),
          ],
        ),
      );
    }

    if (!_isInitialized) {
      return const SizedBox.shrink();
    }

    return AspectRatio(
      aspectRatio: _controller.value.aspectRatio,
      child: VideoPlayer(_controller),
    );
  }

  @override
  void dispose() {
    _controller.removeListener(_videoListener);
    _controller.dispose();
    super.dispose();
  }
}
```

---

## Best Practices

### 1. Memory Management

```dart
// Always dispose controllers
@override
void dispose() {
  _controllers.values.forEach((controller) => controller.dispose());
  _controllers.clear();
  super.dispose();
}

// Limit number of active controllers
static const int maxControllers = 5;

void _manageControllers() {
  if (_controllers.length > maxControllers) {
    // Dispose oldest
    final oldest = _controllers.keys.first;
    _controllers[oldest]?.dispose();
    _controllers.remove(oldest);
  }
}
```

### 2. Loading States

```dart
Widget buildPlayer(VideoPlayerController? controller) {
  if (controller == null) {
    return const Center(child: CircularProgressIndicator());
  }

  if (!controller.value.isInitialized) {
    return const Center(child: CircularProgressIndicator());
  }

  if (controller.value.hasError) {
    return const Center(child: Icon(Icons.error));
  }

  return VideoPlayer(controller);
}
```

### 3. Seek Optimization

```dart
void seekToPosition(Duration position) {
  if (_controller.value.isInitialized) {
    _controller.seekTo(position);
  }
}

// Show loading indicator while seeking
bool _isSeeking = false;

void _handleSeek() {
  setState(() => _isSeeking = true);
  _controller.seekTo(_targetPosition).then((_) {
    setState(() => _isSeeking = false);
  });
}
```

---

## Troubleshooting

### Common Issues

**1. Video doesn't play:**
- Check network connectivity
- Verify authentication token
- Check API endpoint URL
- Ensure video_player plugin is properly installed

**2. Slow loading:**
- Check network speed
- Verify S3 region matches server region
- Consider preloading next videos
- Check for too many simultaneous requests

**3. Seeking issues:**
- Ensure Range requests are supported
- Check video format compatibility
- Verify controller is initialized

**4. Memory issues:**
- Limit number of active controllers
- Dispose unused controllers
- Implement proper cleanup

**5. Authentication errors:**
- Verify token is valid
- Check token expiration
- Ensure headers are set correctly

### Debug Tips

```dart
// Enable debug logging
_controller.addListener(() {
  print('Video state: ${_controller.value}');
  print('Position: ${_controller.value.position}');
  print('Duration: ${_controller.value.duration}');
  print('Buffered: ${_controller.value.buffered}');
});
```

---

## Complete Example

```dart
import 'package:flutter/material.dart';
import 'package:video_player/video_player.dart';
import 'package:provider/provider.dart';

void main() {
  runApp(MyApp());
}

class MyApp extends StatelessWidget {
  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'Reel Streaming',
      home: ChangeNotifierProvider(
        create: (_) => ReelPlayerProvider(),
        child: ReelFeedScreen(),
      ),
    );
  }
}

// Use the ReelFeedScreen and ReelPlayerProvider from Advanced Features section
```

---

## Summary

The Flutter integration provides:
- ✅ Smooth video streaming
- ✅ Efficient memory usage
- ✅ Automatic chunked loading
- ✅ Seek support
- ✅ Error handling
- ✅ Preloading capabilities

The `video_player` plugin automatically handles HTTP Range requests, making integration seamless.

---

## Additional Resources

- [video_player Plugin Documentation](https://pub.dev/packages/video_player)
- [Flutter Video Player Examples](https://github.com/flutter/plugins/tree/main/packages/video_player/video_player/example)
- [HTTP Range Requests](https://developer.mozilla.org/en-US/docs/Web/HTTP/Range_requests)

---

## Support

For issues:
1. Check error messages
2. Verify network connectivity
3. Test with different videos
4. Review this documentation
5. Contact development team

