# Frenzone Backend – API Integration Notes (Frontend)

This document covers the new/updated APIs added in this chat and already included in `frenzone_collection.json`.

## Base URL

All requests in Postman use the `{{server}}` variable (example: `http://44.206.194.217:4000`).

## Auth

Most of these endpoints are protected behind `requireAuth`.

Send header:

- `Authorization: Bearer <jwt_token>`

In Postman you can use the collection-level Bearer token or set per-request.

---

## 1) Minutes spent in app

### `POST /user/trackAppMinute`

Purpose:
- Track how many minutes the logged-in user has spent in the app.

How to use (frontend logic):
- Call this endpoint **once per minute** while the user is active in the app (foreground).
- If the app calls multiple times quickly, backend de-dupes by time (roughly **55 seconds** threshold).

Request:
- No body required
- Auth required

Response:
- `success`: boolean
- `counted`: boolean (true if a minute was added, false if request came too soon)
- `minutesSpentInApp`: number
- `lastAppMinutePingAt`: ISO date or null

Notes:
- When a minute is counted, backend also updates the user’s `rankingPoints` (creator ranking).

---

## 2) Top Influencers (admin-set list)

These influencers are stored in backend config (Business doc) and returned in a lightweight format.

Influencer object fields returned:
- `firstname`
- `lastname`
- `username`
- `profilePicture` (resolved via existing AWS signed URL logic)
- `totalFollowers`
- `totalFollowings`

### `PATCH /user/setTopInfluencers`

Purpose:
- Set the **top 15 influencers** list.

Auth:
- Required

Body (JSON):
```json
{
  "influencerIds": ["<userId1>", "<userId2>", "... up to 15 total ..."]
}
```

Rules:
- Must provide **exactly 15 unique** user ids.
- All ids must exist.

Response:
- `success`: boolean
- `message`: string
- `count`: 15

### `GET /user/getTopInfluencers`

Purpose:
- Get the influencer list (all currently set).

Auth:
- Required

Response:
- `success`: boolean
- `count`: number
- `influencers`: array of influencer objects (fields listed above)

### `GET /user/getRandomTopInfluencers`

Purpose:
- Get **5 random influencers** from the set list.

Auth:
- Required

Response:
- `success`: boolean
- `count`: number (<= 5)
- `influencers`: array of influencer objects (fields listed above)

---

## 3) Latest feed with Trending + Top Creators

### `GET /post/getAllPostsLatest/:userid/:pageNo/:perPage`

Purpose:
- Returns the same `posts` feed concept as existing `getAllposts`, plus:
  - `trendingPosts`: shuffled posts with likes > 4
  - `topCreators`: users sorted by `rankingPoints`

Auth:
- Not enforced by `routes/postRoutes.js` currently (matches existing pattern in repo). If your environment expects auth, add Bearer token anyway.

Path params:
- `userid`: current user id
- `pageNo`: page number (number)
- `perPage`: items per page (number)

Query params (optional):
- `trendingPostsCount` (number): default 10, max 50
- `topCreatorsCount` (number): default 10, max 50

Response:
- `posts`: array (same shape as existing post feed responses)
- `trendingPosts`: array (same shape as `posts`, shuffled, likes > 4)
- `topCreators`: array of creators sorted by points

`topCreators` item fields:
- `_id`
- `firstname`
- `lastname`
- `username`
- `profilePicture` (AWS signed URL logic)
- `totalFollowers`
- `totalFollowings`
- `rankingPoints`
- `badges` (array of badge objects)

`badges` item fields:
- `_id`
- `title`
- `text`
- `imageUrl`

---

## 4) Ranking points (creator leaderboard)

Ranking is stored on `User.rankingPoints`.

Formula:
- `1 x likes (collective of all posts of that user) = 1 point`
- `1 x follower = 2 points`
- `1 x hour = 0.1 point` (hours derived from `minutesSpentInApp / 60`)

When points update automatically:
- When someone likes/unlikes a post, backend recalculates points for the **post owner**.
- When someone follows/unfollows a user, backend recalculates points for the **followed/unfollowed** user.
- When a user’s app minute is counted (`trackAppMinute`), backend recalculates points for that user.

### `POST /user/recalculateRankingPointsAllUsers`

Purpose:
- One-time backfill to populate `rankingPoints` for existing users.

Auth:
- Required

Request:
- No body required

Response:
- `success`: boolean
- `count`: number of users processed
- `message`: string

Notes:
- This loops all users sequentially to avoid overloading DB; it may take time on large datasets.

---

## Postman

The Postman collection already includes the requests:
- `user/trackAppMinute`
- `user/setTopInfluencers`
- `user/getTopInfluencers`
- `user/getRandomTopInfluencers`
- `user/recalculateRankingPointsAllUsers`
- `user/getTopCreators`
- `user/getAllCreators`
- `user/assignBadgeToCreator`
- `user/toggleHideFollowersFollowing`
- `user/togglePrivateAccount`
- `user/toggleAcceptMessages`
- `user/getFollowRequests`
- `user/respondFollowRequest`
- `post/getAllPostsLatest`
- `badge/createBadge`
- `badge/updateBadge`
- `badge/deleteBadge`
- `badge/getAllBadges`
- `badge/getBadgeById`

File:
- `frenzone_collection.json`

---

## 9) Admin – broadcast email

### `POST /admin/broadcastEmail`

Purpose:
- Send an email broadcast to all users that have an email saved in DB.

Auth:
- Required (admin token via `requireAuth` on admin routes)

Body (JSON):
```json
{
  "subject": "Frenzone update",
  "body": "<p>Hello from Frenzone</p>"
}
```

Notes:
- `body` is sent as HTML and also converted to a plain-text fallback.
- Sending is chunked internally; some invalid emails may fail but the broadcast continues.

---

## 5) Badges (top creator badges)

Badges are created by admin and then assigned to creators. These badges are returned in creator objects in:
- `GET /post/getAllPostsLatest/...` (`topCreators` array)
- `GET /user/getTopCreators`
- `GET /user/getAllCreators`

### `GET /badge/getAllBadges`
- Returns all badges with `imageUrl` resolved from S3.

### `POST /badge/createBadge`
- Create a badge with `title`, `text`, and optional `image` (multipart/form-data).

### `PATCH /badge/updateBadge`
- Update badge fields by `badgeId`, optionally replace `image` (multipart/form-data).

### `DELETE /badge/deleteBadge`
- Delete badge by `badgeId` (also deletes S3 image if present).

### `PATCH /user/assignBadgeToCreator`

Purpose:
- Assign or remove a badge for a creator (toggle behavior).

Body (JSON):
```json
{
  "creatorId": "<creatorUserId>",
  "badgeId": "<badgeId>"
}
```

Response:
- `message`: `"Badge assigned"` or `"Badge removed"`

---

## 6) Creators list (paginated)

### `GET /user/getTopCreators?page=1&limit=10`

Purpose:
- Paginated list of creators sorted by `rankingPoints` (desc).

Response:
- `page`, `limit`, `total`
- `creators`: array of creator summaries including `rankingPoints` and `badges`

### `GET /user/getAllCreators?page=1&limit=10`
- Alias of `getTopCreators` (same response).

---

## 7) Profile privacy toggles

### `PATCH /user/toggleHideFollowersFollowing`

Purpose:
- Toggle `hideFollowersFollowing` for a user (frontend uses this to hide/show followers/following lists).

Body:
```json
{ "userid": "<userId>" }
```

Response:
- `hideFollowersFollowing`: boolean

### `PATCH /user/toggleAcceptMessages`

Purpose:
- Toggle `acceptMessages` (frontend can disable incoming messages UI/entry points).

Body:
```json
{ "userid": "<userId>" }
```

Response:
- `acceptMessages`: boolean

### `PATCH /user/togglePrivateAccount`

Purpose:
- Toggle account privacy (`isPrivate`).

Body:
```json
{ "userid": "<userId>" }
```

Response:
- `isPrivate`: boolean

### `GET /user/getUserToggles/:userid`

Purpose:
- Fetch all three toggle values for a user in a single call.

Response:
- `hideFollowersFollowing`: boolean
- `isPrivate`: boolean
- `acceptMessages`: boolean

---

## 8) Private accounts – follow requests

Behavior:
- If target user has `isPrivate=true`, calling the existing follow API (`/user/followUser`) will **send a follow request** instead of directly following.

### `GET /user/getFollowRequests`

Purpose:
- Get pending follow requests for the logged-in user.

Response:
- `requests`: array with requester summary + `createdAt`

### `PATCH /user/respondFollowRequest`

Purpose:
- Accept or reject a follow request.

Body:
```json
{
  "requesterId": "<requesterUserId>",
  "action": "accept"
}
```

On accept:
- Backend adds follower/following relationship.
- Backend updates ranking points for the user being followed.
