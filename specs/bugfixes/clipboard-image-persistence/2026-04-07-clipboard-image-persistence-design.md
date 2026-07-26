# 剪贴板图片未持久化到磁盘设计文档

## 1. 概述

### 1.1 问题

截图粘贴或从网页复制的图片在 Cowork 对话中仅存于内存（base64 dataUrl），不写入磁盘。第二轮对话时 agent 用工具在磁盘上找不到文件，提示用户"请重新发送图片"。

这是附件系统五条处理路径中**唯一不写磁盘**的分支（路径 E）。详见 `specs/features/attachment/2026-04-07-attachment-design.md` 的处理路径分类表。

### 1.2 根因

`CoworkPromptInput.tsx` 第 516-527 行：

```typescript
} else {
  // No native path (clipboard/drag from browser) - read via FileReader
  try {
    const dataUrl = await fileToDataUrl(file);
    addImageAttachmentFromDataUrl(file.name, dataUrl);  // ← 仅内存，伪路径 inline:...
  } catch (error) {
    const stagedPath = await saveInlineFile(file);       // ← 写磁盘仅在 error fallback
    if (stagedPath) addAttachment(stagedPath);
  }
}
```

**两个问题叠加**：
1. `addImageAttachmentFromDataUrl` 生成伪路径 `inline:{name}:{timestamp}`，不对应磁盘文件
2. 提交时 `!a.path.startsWith('inline:')` 过滤掉伪路径，prompt 中不包含文件信息

---

## 2. 用户场景

### 场景 1: 截图粘贴后第一轮对话

**Given** 用户截图并粘贴到对话框，模型支持 vision
**When** 用户发送 "这张图片说了什么？"
**Then** LLM 通过 base64 vision 正确识别图片（修复前后均可用）

### 场景 2: 截图粘贴后第二轮对话

**Given** 用户在第一轮发送了截图
**When** 用户在第二轮发送 "把这张图片的背景改成白色"
**Then** agent 通过 prompt 中的路径找到磁盘文件，使用工具处理（修复后）

### 场景 3: 磁盘保存失败的降级

**Given** 工作目录不可写
**When** 用户截图粘贴
**Then** 降级为仅 vision（`addImageAttachmentFromDataUrl`），不阻塞用户

---

## 3. 功能需求

### FR-1: Clipboard 图片写入磁盘

无 `nativePath` 的图片必须通过 `saveInlineFile` 写入磁盘，使用 `addAttachment(savedPath, { isImage, dataUrl })` 以真实路径添加。

### FR-2: Vision 功能不受影响

`dataUrl` 仍然读取并存储在 `DraftAttachment` 中，提交时 base64 提取逻辑不变。

### FR-3: 优雅降级

磁盘写入失败时降级为 `addImageAttachmentFromDataUrl`（修复前行为），dataUrl 读取失败时仅保存磁盘文件。两者都失败时记录错误，不添加附件。

---

## 4. 实现方案

### 修改文件

`src/renderer/components/cowork/CoworkPromptInput.tsx`（第 516-527 行）— **唯一改动文件**

### 修改后代码

```typescript
} else {
  let dataUrl: string | null = null;
  try {
    dataUrl = await fileToDataUrl(file);
  } catch (error) {
    console.error('Failed to read clipboard image as data URL:', error);
  }

  const stagedPath = await saveInlineFile(file);

  if (stagedPath) {
    addAttachment(stagedPath, {
      isImage: true,
      dataUrl: dataUrl ?? undefined,
    });
  } else if (dataUrl) {
    console.warn('Clipboard image saved only in memory (disk save failed)');
    addImageAttachmentFromDataUrl(file.name, dataUrl);
  } else {
    console.error('Failed to process clipboard image');
  }
}
```

### 无需修改其他文件的原因

| 关注点 | 说明 |
|--------|------|
| `addAttachment` | 已支持 `{ isImage: true, dataUrl }` 参数（路径 C 已在用） |
| 提交时 base64 提取 | 检查 `isImage && dataUrl`，与路径无关 |
| 提交时路径拼接 | 过滤 `inline:` 前缀，真实路径自动通过 |
| `saveInlineFile` | 已有完整实现 |

---

## 5. 边界情况

| 场景 | 处理 |
|------|------|
| Clipboard 图片名为 `image.png`（通用名） | `saveInlineFile` 生成 `image-{timestamp}-{random}.png`，不冲突 |
| 图片超过 25MB | `saveInlineFile` 返回失败，降级到 `addImageAttachmentFromDataUrl` |
| 工作目录未设置 | `resolveInlineAttachmentDir` 降级到 `/tmp/wulu/attachments/` |
| 工作目录只读 | `saveInlineFile` 返回失败，降级到仅 vision |
| File 对象被读两次 | `fileToDataUrl` 和 `saveInlineFile` 各自创建 `FileReader` 实例，互不干扰 |

---

## 6. 验收标准

1. 截图粘贴后，`.cowork-temp/attachments/manual/` 中出现对应文件
2. 发送消息后，prompt 文本包含图片的磁盘路径
3. 第二轮对话中 agent 能通过路径访问文件
4. LLM vision 识别功能不受影响
5. 从 Finder 粘贴文件、文件选择器上传等路径不受影响
6. 磁盘保存失败时不阻塞用户，降级为仅 vision
