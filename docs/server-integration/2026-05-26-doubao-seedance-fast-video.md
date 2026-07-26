# doubao-seedance-2-0-fast 视频生成接入

## Change Summary

wulu-server 新增并启用视频生成模型 `doubao-seedance-2-0-fast`。服务端继续复用现有媒体生成接口，无新增 endpoint。

服务端会在提交任务前按预估 token 预扣积分；任务成功后，如果火山返回 `usage.completion_tokens`，服务端会按实际 completion tokens 对账，多退少补。任务提交失败、生成失败、取消或超时会退回预扣积分。

## Endpoint Details

### 创建视频任务

- Method: `POST`
- Path: `/api/media/videos/generate`
- Auth: `Authorization: Bearer <accessToken>`

Request example:

```json
{
  "model": "doubao-seedance-2-0-fast",
  "type": "t2v",
  "prompt": "A cinematic shot of a red sports car driving along a coastal road",
  "params": {
    "duration": 5,
    "resolution": "720p",
    "ratio": "16:9",
    "audio": true,
    "priority": 0,
    "watermark": false
  }
}
```

Image-to-video example:

```json
{
  "model": "doubao-seedance-2-0-fast",
  "type": "i2v",
  "prompt": "The scene slowly comes alive with natural camera motion",
  "params": {
    "duration": 5,
    "resolution": "720p",
    "firstFrame": "https://example.com/frame.png"
  }
}
```

Video-reference example:

```json
{
  "model": "doubao-seedance-2-0-fast",
  "type": "ref2v",
  "prompt": "Keep the motion style and create a new clip",
  "params": {
    "duration": 5,
    "resolution": "720p",
    "referenceVideos": ["https://example.com/input.mp4"],
    "referenceVideoDurations": [6]
  }
}
```

Response shape is unchanged:

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "taskId": 123,
    "upstreamTaskId": "cgt-xxx",
    "model": "doubao-seedance-2-0-fast",
    "type": "t2v",
    "status": "processing",
    "progress": 0
  }
}
```

### 查询视频任务

- Method: `GET`
- Path: `/api/media/videos/tasks/{taskIdOrUpstreamTaskId}`
- Auth: `Authorization: Bearer <accessToken>`

Successful response includes generated video URLs in `data.resultUrls`.

## Frontend Action Items

- Add `doubao-seedance-2-0-fast` to the selectable video models.
- Only offer `480p` and `720p`; do not send `1080p` for this model.
- Allow `duration` values `4..15` or `-1`; `-1` is billed conservatively as 15 seconds before final reconciliation.
- Forward optional params when available: `ratio`, `audio` or `generate_audio`, `priority`, `firstFrame`, `lastFrame`, `referenceImages`, `referenceVideos`, `referenceAudios`, `returnLastFrame`, `watermark`, `seed`.
- For video references, send `inputVideoDuration` or `referenceVideoDurations` when the client can determine duration. If omitted, the server estimates input video duration as 15 seconds before final reconciliation.
- Treat `MEDIA_QUOTA_EXHAUSTED` as a pre-submit failure. The server rejects long requests before calling the upstream provider when available credits are insufficient.

## Auth Requirements

JWT Bearer auth is required, same as existing `/api/media/videos/*` APIs.

## Notes & Caveats

- `i2v` with only image inputs is billed as non-video-input pricing.
- Requests with actual video references use video-input pricing.
- Server-side billing is conservative at submit time; final cost may be lower if Volcengine returns lower `usage.completion_tokens`.
- Failed, cancelled, expired, timed out, or upstream-submit-failed tasks are refunded by the server.
