# HappyHorse Video Models

## Change Summary

wulu-server adds Aliyun Bailian HappyHorse video-generation support through the existing media endpoints. New model IDs are:

- `happyhorse-1.0-t2v`
- `happyhorse-1.0-i2v`
- `happyhorse-1.0-r2v`

Pricing is pre-deducted from subscription/free/reward/boost credits before the upstream task is created. Long duration requests are rejected before submission when the user does not have enough credits.

## Endpoint Details

### List Video Models

`GET /api/media/videos/models`

No auth required. The response includes model pricing, `parameterSpec`, and capabilities.

### Generate Video

`POST /api/media/videos/generate`

Auth: `Authorization: Bearer <accessToken>`

Text-to-video:

```json
{
  "model": "happyhorse-1.0-t2v",
  "type": "t2v",
  "prompt": "A miniature cardboard city at night",
  "params": {
    "resolution": "720P",
    "ratio": "16:9",
    "duration": 5,
    "watermark": false
  }
}
```

Image-to-video from first frame:

```json
{
  "model": "happyhorse-1.0-i2v",
  "type": "i2v",
  "prompt": "A cat running on grass",
  "params": {
    "firstFrame": "https://example.com/frame.png",
    "resolution": "720P",
    "duration": 5,
    "watermark": false
  }
}
```

Reference-to-video:

```json
{
  "model": "happyhorse-1.0-r2v",
  "type": "r2v",
  "prompt": "[Image 1] waves the folding fan from [Image 2]",
  "params": {
    "referenceImages": [
      "https://example.com/person.jpg",
      "https://example.com/fan.jpg"
    ],
    "resolution": "720P",
    "ratio": "16:9",
    "duration": 5,
    "watermark": false
  }
}
```

The response shape is unchanged and returns a local `taskId`, upstream task ID, and `processing`/`pending` status.

### Poll Task

`GET /api/media/videos/tasks/{taskId}`

Auth: `Authorization: Bearer <accessToken>`

When complete, `resultUrls[0]` contains the generated video URL.

## Frontend Action Items

- Show the three HappyHorse models from `/api/media/videos/models`.
- For `happyhorse-1.0-i2v`, send exactly one `firstFrame` image URL/base64; do not send `ratio`.
- For `happyhorse-1.0-r2v`, send `referenceImages` with 1-9 image URLs/base64 strings.
- Surface `MEDIA_QUOTA_EXHAUSTED` as insufficient credits before generation starts.

## Auth Requirements

Generation, polling, list, and cancel task endpoints require Electron JWT bearer auth, except model listing which remains public.

## Notes & Caveats

- Pricing is duration-based: `720P` costs 90 credits/second and `1080P` costs 160 credits/second.
- `duration` must be an integer from 3 to 15. `durationSeconds` is also accepted.
- Generated upstream video URLs are temporary; clients should download or persist them promptly if long retention is needed.
