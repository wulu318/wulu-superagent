# gpt-image-2 / Banana 2 内部生图模型

## Change Summary

wulu-server 新增两个内部员工可见的图片模型：

- `gpt-image-2`：公开/客户端可见 ID，支持文生图和图片编辑；服务端请求 MiniMax 时仍使用上游 `canvas-20`。
- `banana-2`：MiniMax Gemini 3.1 Flash Image，支持文生图和参考图生图。

两个模型仅 OpenID/internal 员工账号可见和可调用。普通 YID 用户即使直接传 model 调用生成接口也会被后端拒绝。

## Endpoint Details

### 获取图片模型

```http
GET /api/media/images/models
Authorization: Bearer <accessToken>
```

返回值仍为已有 `MediaModelDTO[]`。内部账号会看到 `gpt-image-2` 和 `banana-2`；非内部账号不会看到这两个模型。

### 生成图片

```http
POST /api/media/images/generate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

`gpt-image-2` 文生图：

```json
{
  "model": "gpt-image-2",
  "type": "t2i",
  "prompt": "A full-body fashion photo...",
  "params": {
    "n": 1,
    "output_format": "png",
    "size": "1024x1024",
    "quality": "auto"
  }
}
```

`gpt-image-2` 图片编辑：

```json
{
  "model": "gpt-image-2",
  "type": "i2i",
  "prompt": "生成一张照片，内容为一个人正在使用电脑",
  "params": {
    "images": ["data:image/png;base64,..."],
    "n": 2,
    "size": "3840x2160",
    "output_format": "png"
  }
}
```

`banana-2`：

```json
{
  "model": "banana-2",
  "type": "t2i",
  "prompt": "A full-body fashion photo...",
  "params": {
    "temperature": 0.7,
    "aspectRatio": "16:9",
    "imageSize": "1K"
  }
}
```

## Response Body

成功响应沿用现有 `MediaTaskResponse`，同步返回：

```json
{
  "status": "succeeded",
  "progress": 100,
  "resultUrls": ["data:image/png;base64,..."],
  "metadata": {
    "usage": {
      "textInputTokens": 52,
      "imageOutputTokens": 5402
    }
  }
}
```

`resultUrls` 为 data URL。客户端不需要再从 NOS 或远程 URL 下载图片。

## Frontend Action Items

- 图片模型列表以 `GET /api/media/images/models` 为准，不要硬编码展示这两个模型。
- `gpt-image-2`、`banana-2`、`banana-pro` 的列表预估和预估计算说明由客户端本地展示逻辑维护，不依赖服务端 `pricing` 展示字段；`gpt-image-2` 额外显示 `6折` 标签。
- 图片编辑传入 `params.images`，元素使用 data URL；`gpt-image-2` 最多 16 张，`banana-2` 最多 14 张。
- 不要在日志、调试面板或持久化状态里输出完整 data URL。
- 如果后端返回 `MODEL_ACCESS_DENIED`，按不可用模型处理。

## Auth Requirements

- 需要 Electron JWT Bearer token。
- 仅 OpenID/internal 员工账号可见和可调用。

## Notes & Caveats

- `banana-2` 上游可能返回 `thought=true` 的中间文本或图片；后端已过滤，不会放入 `resultUrls`。
- `canvas-20` 仅作为后端兼容别名和 MiniMax upstream model ID 使用；客户端展示、工具参数和新请求都应使用 `gpt-image-2`。
- 后端按上游返回 usage 做实际扣费，换算口径为 `1 USD = 7 CNY`、`1 CNY = 100 积分`；客户端不需要自行计算费用。
