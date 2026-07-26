# Nano Banana Pro 内部生图模型

## Change Summary

wulu-server 新增内部员工可见图片模型：

- `banana-pro`：MiniMax Gemini 3 Pro Image / Nano Banana Pro，支持文生图和参考图生图。

该模型仅 OpenID/internal 员工账号可见和可调用。普通 YID 用户即使直接传 model 调用生成接口也会被后端拒绝。

## Endpoint Details

### 获取图片模型

```http
GET /api/media/images/models
Authorization: Bearer <accessToken>
```

返回值仍为已有 `MediaModelDTO[]`。内部账号会看到 `banana-pro`；非内部账号不会看到该模型。

### 生成图片

```http
POST /api/media/images/generate
Authorization: Bearer <accessToken>
Content-Type: application/json
```

```json
{
  "model": "banana-pro",
  "type": "t2i",
  "prompt": "生成一张图片，描绘下足球比赛越位的详细规则",
  "params": {
    "temperature": 0.7,
    "aspectRatio": "16:9",
    "imageSize": "1K"
  }
}
```

参考图生图时继续使用 `params.images`，元素为 data URL/base64 或 HTTP URL。

## Response Body

成功响应沿用现有 `MediaTaskResponse`，同步返回：

```json
{
  "status": "succeeded",
  "progress": 100,
  "resultUrls": ["data:image/png;base64,..."],
  "metadata": {
    "usage": {
      "textInputTokens": 47,
      "imageOutputTokens": 1120,
      "thinkingOutputTokens": 111
    }
  }
}
```

`resultUrls` 为 data URL，客户端继续使用现有本地落盘逻辑。

## Frontend Action Items

- 图片模型列表以 `GET /api/media/images/models` 为准，不要硬编码展示 `banana-pro`。
- 现有 token 计费展示逻辑可读取 `billingUnit=per_token`、`usagePricing` 和 `unitCredits`，默认显示约 `94 credits/次`。
- 参考图继续传 `params.images`；该模型最多 14 张。
- 不要在日志、调试面板或持久化状态里输出完整 data URL。
- 如果后端返回 `MODEL_ACCESS_DENIED`，按不可用模型处理。

## Auth Requirements

- 需要 Electron JWT Bearer token。
- 仅 OpenID/internal 员工账号可见和可调用。

## Notes & Caveats

- 后端跳过 `thought=true` 的临时思考图片，只把最终图片放入 `resultUrls`。
- 后端按上游返回 usage 做实际扣费，换算口径为 `1 USD = 7 CNY`、`1 CNY = 100 积分`；客户端不需要自行计算费用。
