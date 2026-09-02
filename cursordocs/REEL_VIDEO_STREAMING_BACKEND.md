# Reel Video Streaming API - Backend Documentation

## Overview

This document describes the video streaming implementation for reels, which enables efficient chunked video delivery similar to TikTok. The implementation uses HTTP Range requests to stream video content in small chunks, reducing initial load time and improving user experience.

---

## Table of Contents

1. [Introduction](#introduction)
2. [How It Works](#how-it-works)
3. [API Endpoint](#api-endpoint)
4. [HTTP Range Requests](#http-range-requests)
5. [Implementation Details](#implementation-details)
6. [AWS S3 Configuration](#aws-s3-configuration)
7. [Performance Considerations](#performance-considerations)
8. [Error Handling](#error-handling)

---

## Introduction

### Problem Statement

Previously, reel videos were served using presigned S3 URLs, which required the entire video file to be downloaded before playback could begin. This caused:
- Slow initial load times
- High bandwidth consumption
- Poor user experience, especially on slower connections
- Increased server costs

### Solution

The new streaming API implements HTTP Range request support, allowing video players to:
- Request specific byte ranges of the video
- Start playback while downloading
- Seek to any position without downloading the entire file
- Reduce bandwidth usage by only downloading what's needed

---

## How It Works

### HTTP Range Requests

HTTP Range requests allow clients to request specific portions of a file:

```
GET /api/reel/stream/:reelid
Range: bytes=0-1023
```

The server responds with:
- **HTTP 206 (Partial Content)** for range requests
- **HTTP 200 (OK)** for full content requests
- Appropriate headers indicating the content range and total file size

### Flow Diagram

```
Client Request
    ↓
[Range Header?]
    ↓ Yes                    ↓ No
Parse Range              Return Full Video
    ↓
Validate Range
    ↓
Request Chunk from S3
    ↓
Stream Chunk to Client
    ↓
Client Receives Chunk
    ↓
Continue Playback / Request Next Chunk
```

---

## API Endpoint

### Stream Reel Video

**Endpoint:** `GET /api/reel/stream/:reelid`

**Purpose:** Stream video content with HTTP Range request support for chunked delivery.

**Authentication:** Required (via `requireAuth` middleware)

**URL Parameters:**
- `reelid` (required) - The ID of the reel to stream

**Request Headers:**
```
Range: bytes=start-end
```

**Example Request:**
```http
GET /api/reel/stream/507f1f77bcf86cd799439011
Range: bytes=0-1048575
Authorization: Bearer <token>
```

**Response (206 Partial Content):**
```http
HTTP/1.1 206 Partial Content
Content-Range: bytes 0-1048575/5242880
Content-Length: 1048576
Content-Type: video/mp4
Accept-Ranges: bytes
Last-Modified: Wed, 21 Oct 2024 07:28:00 GMT
ETag: "d41d8cd98f00b204e9800998ecf8427e"
Cache-Control: public, max-age=3600

[Video Chunk Data]
```

**Response (200 OK - Full Content):**
```http
HTTP/1.1 200 OK
Content-Length: 5242880
Content-Type: video/mp4
Accept-Ranges: bytes
Last-Modified: Wed, 21 Oct 2024 07:28:00 GMT
ETag: "d41d8cd98f00b204e9800998ecf8427e"
Cache-Control: public, max-age=3600

[Full Video Data]
```

**Response (416 Range Not Satisfiable):**
```http
HTTP/1.1 416 Range Not Satisfiable
Content-Range: bytes */5242880
```

---

## HTTP Range Requests

### Range Header Format

The Range header follows this format:
```
Range: bytes=start-end
```

**Examples:**
- `Range: bytes=0-1023` - First 1024 bytes
- `Range: bytes=1024-2047` - Next 1024 bytes
- `Range: bytes=0-` - From start to end (full file)
- `Range: bytes=-500` - Last 500 bytes

### Response Headers

#### Content-Range
Indicates the range of bytes being returned:
```
Content-Range: bytes start-end/total
```
Example: `Content-Range: bytes 0-1048575/5242880`

#### Accept-Ranges
Indicates that the server supports range requests:
```
Accept-Ranges: bytes
```

#### Content-Length
The size of the chunk being returned (not the total file size):
```
Content-Length: 1048576
```

#### Content-Type
The MIME type of the video:
```
Content-Type: video/mp4
```

---

## Implementation Details

### Controller Function: `streamReelVideo`

**Location:** `controllers/reelController.js`

**Key Features:**
1. **Reel Validation:** Checks if reel exists and has a video
2. **Metadata Retrieval:** Uses `HeadObjectCommand` to get file metadata from S3
3. **Range Parsing:** Parses and validates the Range header
4. **Chunk Retrieval:** Uses `GetObjectCommand` with Range parameter to fetch specific chunks
5. **Streaming:** Pipes S3 stream directly to response

**Code Flow:**
```javascript
1. Find reel by ID
2. Get video metadata from S3 (HeadObjectCommand)
3. Parse Range header from request
4. Validate range bounds
5. Request chunk from S3 with Range parameter
6. Set appropriate HTTP headers
7. Stream chunk to client
```

### S3 Integration

The implementation leverages AWS S3's native Range request support:

```javascript
// Get metadata
const headCommand = new HeadObjectCommand({
  Bucket: bucketName,
  Key: reel.video
});

// Get chunk with range
const command = new GetObjectCommand({
  Bucket: bucketName,
  Key: reel.video,
  Range: `bytes=${start}-${end}`
});
```

### Error Handling

The API handles various error scenarios:

1. **Reel Not Found (404):**
   ```json
   { "error": "Reel not found" }
   ```

2. **Video Not Found (404):**
   ```json
   { "error": "Video not found for this reel" }
   ```

3. **Invalid Range (416):**
   - Returns 416 status with `Content-Range: bytes */total`

4. **Server Errors (500):**
   - Logs error and returns generic error message
   - Prevents header errors if response already sent

---

## AWS S3 Configuration

### Current Setup

**No changes required** to your existing S3 bucket configuration. S3 natively supports:
- ✅ HTTP Range requests
- ✅ Partial content delivery
- ✅ Streaming responses

### Recommended Settings

While no changes are required, these optimizations can improve performance:

#### 1. CORS Configuration

Ensure your S3 bucket CORS allows Range headers:

```json
[
  {
    "AllowedHeaders": ["Range", "Authorization"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedOrigins": ["*"],
    "ExposeHeaders": ["Content-Range", "Accept-Ranges", "Content-Length", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

#### 2. CloudFront (Optional but Recommended)

For better global performance, consider using CloudFront:

**Benefits:**
- Reduced latency
- Lower bandwidth costs
- Better caching
- DDoS protection

**Configuration:**
- Create CloudFront distribution pointing to S3 bucket
- Enable Range requests in CloudFront
- Update API to use CloudFront URL instead of direct S3

#### 3. S3 Bucket Policy

Ensure your bucket policy allows GetObject and HeadObject operations:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "AWS": "arn:aws:iam::ACCOUNT_ID:user/YOUR_USER"
      },
      "Action": [
        "s3:GetObject",
        "s3:HeadObject"
      ],
      "Resource": "arn:aws:s3:::YOUR_BUCKET_NAME/*"
    }
  ]
}
```

---

## Performance Considerations

### Chunk Size

The client (Flutter video_player) automatically determines chunk size based on:
- Network conditions
- Video bitrate
- Available bandwidth

Typical chunk sizes:
- Initial chunk: 1-2 MB
- Subsequent chunks: 512 KB - 2 MB
- Seek chunks: 256 KB - 1 MB

### Caching

The API sets cache headers:
```
Cache-Control: public, max-age=3600
```

This allows:
- Browser/CDN caching
- Reduced server load
- Faster subsequent requests

### Bandwidth Optimization

**Before (Presigned URLs):**
- Full video download: 10 MB
- Initial wait time: 5-10 seconds

**After (Streaming):**
- Initial chunk: 1-2 MB
- Initial wait time: 0.5-1 second
- Total bandwidth: Only what's watched

### Server Load

**Benefits:**
- Reduced initial load (chunks vs full file)
- Better connection management
- Lower memory usage (streaming vs buffering)

---

## Error Handling

### Client-Side Errors

**400 Bad Request:**
- Invalid reel ID format
- Missing required parameters

**404 Not Found:**
- Reel doesn't exist
- Video file missing from S3

**416 Range Not Satisfiable:**
- Invalid range (start > end)
- Range exceeds file size
- Negative range values

### Server-Side Errors

**500 Internal Server Error:**
- S3 connection issues
- Network problems
- Unexpected errors

**Error Response Format:**
```json
{
  "error": "Error message here"
}
```

### Logging

All errors are logged to console:
```javascript
console.error("Streaming error:", error);
```

For production, consider:
- Structured logging (Winston, Pino)
- Error tracking (Sentry, Rollbar)
- Monitoring (CloudWatch, Datadog)

---

## Testing

### Manual Testing with cURL

**Test Range Request:**
```bash
curl -H "Range: bytes=0-1023" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:4000/api/reel/stream/REEL_ID \
     --output chunk1.mp4
```

**Test Full Request:**
```bash
curl -H "Authorization: Bearer YOUR_TOKEN" \
     http://localhost:4000/api/reel/stream/REEL_ID \
     --output full_video.mp4
```

**Test Invalid Range:**
```bash
curl -H "Range: bytes=1000-500" \
     -H "Authorization: Bearer YOUR_TOKEN" \
     -v http://localhost:4000/api/reel/stream/REEL_ID
```

### Expected Behaviors

1. **Range Request:** Returns 206 with specified chunk
2. **No Range:** Returns 200 with full video
3. **Invalid Range:** Returns 416
4. **Missing Reel:** Returns 404
5. **Network Error:** Returns 500

---

## Security Considerations

### Authentication

Currently, the endpoint requires authentication via `requireAuth` middleware. Consider:

**Option 1: Keep Authenticated (Current)**
- More secure
- Can track usage per user
- Can implement rate limiting

**Option 2: Make Public with Token**
- Better for CDN caching
- Lower server load
- Use signed URLs with expiration

**Option 3: Hybrid Approach**
- Public endpoint with optional auth
- Auth for analytics/rate limiting
- Public for performance

### Rate Limiting

Consider implementing rate limiting:
```javascript
const rateLimit = require("express-rate-limit");

const streamLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // 100 requests per window
});

router.get("/stream/:reelid", streamLimiter, streamReelVideo);
```

### CORS

If serving from different domain, configure CORS:
```javascript
app.use(cors({
  origin: ['https://yourdomain.com'],
  credentials: true
}));
```

---

## Monitoring & Analytics

### Metrics to Track

1. **Request Count:** Total streaming requests
2. **Range Requests:** Number of range vs full requests
3. **Average Chunk Size:** Typical chunk size requested
4. **Error Rate:** 404, 416, 500 errors
5. **Bandwidth:** Total data transferred
6. **Latency:** Time to first byte (TTFB)

### Implementation Example

```javascript
// Add metrics collection
const metrics = {
  totalRequests: 0,
  rangeRequests: 0,
  fullRequests: 0,
  errors: 0
};

// In streamReelVideo function
metrics.totalRequests++;
if (range) {
  metrics.rangeRequests++;
} else {
  metrics.fullRequests++;
}
```

---

## Future Enhancements

### 1. Adaptive Bitrate Streaming (HLS/DASH)

For even better performance, consider implementing:
- **HLS (HTTP Live Streaming):** Apple's protocol
- **DASH (Dynamic Adaptive Streaming):** MPEG standard

**Benefits:**
- Automatic quality adjustment
- Better buffering
- Smoother playback

### 2. Video Transcoding

Pre-process videos into multiple qualities:
- 360p, 720p, 1080p
- Different bitrates
- HLS/DASH manifests

### 3. CDN Integration

Use CloudFront or similar:
- Global edge locations
- Reduced latency
- Lower bandwidth costs

### 4. Preloading

Preload next video in background:
- Seamless transitions
- Better UX
- Reduced wait times

---

## Troubleshooting

### Common Issues

**1. Video doesn't start playing:**
- Check Range header support
- Verify Content-Type header
- Check CORS configuration

**2. Seeking doesn't work:**
- Ensure Range requests are working
- Check video player configuration
- Verify S3 permissions

**3. Slow streaming:**
- Check S3 region (should match server region)
- Consider CloudFront
- Check network conditions

**4. 416 errors:**
- Verify range parsing logic
- Check file size from S3
- Ensure range validation

---

## Summary

The video streaming API provides:
- ✅ Efficient chunked video delivery
- ✅ Fast initial playback
- ✅ Reduced bandwidth usage
- ✅ Better user experience
- ✅ No AWS S3 changes required
- ✅ Native HTTP Range support

The implementation is production-ready and follows best practices for video streaming.

---

## Support

For issues or questions:
1. Check error logs
2. Verify S3 permissions
3. Test with cURL
4. Review this documentation
5. Contact development team

