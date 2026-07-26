# Kling V3 Video Generation

## Change Summary

wulu-server adds Aliyun Bailian `kling/kling-v3-video-generation` through the existing video media endpoints. The server submits DashScope async tasks, polls `/api/v1/tasks/{task_id}`, and reconciles final credits from upstream `usage.duration`, `usage.SR`, and `usage.audio`.

Pricing is pre-deducted before task creation. Long duration or audio-enabled requests are charged against the full estimated cost first, so users with insufficient remaining credits receive `MEDIA_QUOTA_EXHAUSTED` before the upstream task is submitted.

## Endpoint Details

### List Video Models

`GET /api/media/videos/models`

No auth required. The response includes `pricing`, `parameterSpec`, `capabilities`, and `subjectIds` inside the pricing config.

### Generate Video

`POST /api/media/videos/generate`

Auth: `Authorization: Bearer <accessToken>`

Text-to-video:

```json
{
  "model": "kling/kling-v3-video-generation",
  "type": "t2v",
  "prompt": "A small cat running under moonlight",
  "params": {
    "mode": "std",
    "aspectRatio": "16:9",
    "duration": 5,
    "audio": false,
    "watermark": true
  }
}
```

Image-to-video with first and last frame:

```json
{
  "model": "kling/kling-v3-video-generation",
  "type": "i2v",
  "prompt": "Camera slowly rises from the first frame to the final composition",
  "params": {
    "firstFrame": "https://example.com/start.png",
    "lastFrame": "https://example.com/end.png",
    "mode": "pro",
    "duration": 5,
    "audio": false,
    "watermark": false
  }
}
```

Custom multi-shot:

```json
{
  "model": "kling/kling-v3-video-generation",
  "type": "t2v",
  "prompt": "",
  "params": {
    "multi_shot": true,
    "shot_type": "customize",
    "multi_prompt": [
      { "index": 1, "prompt": "A rainy rooftop at night", "duration": 5 },
      { "index": 2, "prompt": "The camera pushes toward the glowing skyline", "duration": 5 }
    ],
    "mode": "pro",
    "aspectRatio": "9:16",
    "duration": 10,
    "audio": true,
    "watermark": true
  }
}
```

Subject IDs can be sent as either `elementIds` or native `element_list`:

```json
{
  "model": "kling/kling-v3-video-generation",
  "type": "i2v",
  "prompt": "Add falling snow around the subject",
  "params": {
    "firstFrame": "https://example.com/frame.png",
    "elementIds": [108],
    "mode": "std",
    "duration": 5,
    "audio": false
  }
}
```

### Poll Task

`GET /api/media/videos/tasks/{taskIdOrUpstreamTaskId}`

Auth: `Authorization: Bearer <accessToken>`

Successful responses include generated video URLs in `data.resultUrls`. If Aliyun returns both `video_url` and `watermark_video_url`, both are exposed in order.

## Frontend Action Items

- Add `kling/kling-v3-video-generation` to selectable video models using `/api/media/videos/models`.
- Prefer `mode` over `resolution`: `std` means 720P, `pro` means 1080P.
- Send `duration` as an integer from 3 to 15. The server also accepts `durationSeconds`.
- Send `audio` explicitly because it materially changes price.
- For first-frame/first-last-frame generation, send `firstFrame` and optional `lastFrame`; do not require `aspectRatio`.
- For multi-shot customize mode, send `multi_shot=true`, `shot_type=customize`, `multi_prompt`, and `duration` equal to or greater than the sum of segment durations.
- Surface `MEDIA_QUOTA_EXHAUSTED` before generation starts as insufficient credits.

## Auth Requirements

Generation, polling, task list, and cancellation require Electron JWT bearer auth. Model listing remains public.

## Notes & Caveats

- Pricing: silent 720P = 60 credits/sec, silent 1080P = 80 credits/sec, audio 720P = 90 credits/sec, audio 1080P = 120 credits/sec.
- Supported subject IDs: `101`, `103`, `104`, `105`, `106`, `107`, `108`, `109`, `111`, `171`.
- Upstream task IDs are valid for 24 hours. Generated Aliyun video URLs are temporary; persist locally if long retention is needed.
