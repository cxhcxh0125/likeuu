# Ark 图片生成升级总结

## 概述

本次升级将图片生成从"纯文生图"升级为"多参考图/图生图"模式，支持衣物细节保真度控制，提升小细节（logo、条纹、纽扣等）的还原准确率。

---

## 修改的文件清单

### 后端文件

1. **`server/src/routes/image.ts`** (已修改)
   - 新增接口参数：`clothingImages`, `bodyRefImage`, `faceImages`, `fidelity`
   - 集成局部放大 patches 生成
   - 集成细节识别（Detail Lock）
   - 自动选择 Seedream 4.5 模型（当有图片输入时）
   - 构建包含优先级分组的完整 prompt

2. **`server/src/utils/imagePatches.ts`** (新增)
   - 生成衣物图的局部裁剪 patches（中心裁剪 + 胸口区域）
   - 支持批量生成并限制总数量（防止超出模型限制）

3. **`server/src/services/analyzeService.ts`** (新增)
   - 调用 `doubao-seed-1-8-251228` 进行衣物细节识别
   - 返回结构化 JSON（garments, logos, patterns, hardware 等）

4. **`server/src/utils/promptBuilder.ts`** (新增)
   - 构建包含 BODY/CLOTHING/FACE/DETAIL LOCK 分组的完整 prompt
   - 包含禁止项和优先级规则

5. **`server/src/utils/arkAdapter.ts`** (新增)
   - 保真度参数映射（low/medium/high）
   - Ark API 请求体构建适配层
   - 自动模型选择逻辑

### 前端文件

6. **`services/geminiService.ts`** (已修改)
   - `generateFashionImage` 函数升级为支持新参数的对象形式
   - 保持向后兼容（仍支持旧格式）

7. **`App.tsx`** (已修改)
   - 新增 `fidelity` 状态管理
   - Stylist 视图添加保真度选择 UI
   - Try-on 模态框添加保真度选择 UI
   - 所有图片生成调用都传递 `fidelity` 参数

### 依赖

- **`server/package.json`**: 新增 `sharp` 依赖（图片处理）
- **`server/package.json`**: 新增 `@types/sharp` 开发依赖（TypeScript 类型）

---

## API 接口变更

### POST `/api/image`

#### 请求体示例

```json
{
  "prompt": "A person wearing a stylish outfit in a modern city setting.",
  "clothingImages": [
    "data:image/png;base64,iVBORw0KGgoAAAANS...",
    "data:image/png;base64,iVBORw0KGgoAAAANS..."
  ],
  "bodyRefImage": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "faceImages": [
    "data:image/png;base64,iVBORw0KGgoAAAANS..."
  ],
  "fidelity": "high",
  "n": 1
}
```

#### 新增字段说明

- `clothingImages` (可选): 衣物参考图数组（data URL 格式）
- `bodyRefImage` (可选): 用户全身参考图（用于身材比例）
- `faceImages` (可选): 人脸参考图数组（用于身份相似度）
- `fidelity` (可选): 保真度等级，可选值：`"low"` | `"medium"` | `"high"`，默认 `"medium"`

#### 响应示例

```json
{
  "image": "data:image/png;base64,iVBORw0KGgoAAAANS...",
  "raw": { /* Ark API 原始响应 */ },
  "metadata": {
    "model": "doubao-seedream-4-5-251128",
    "fidelity": "high",
    "hasClothingDetails": true,
    "patchCount": 2
  }
}
```

---

## 生成的 Prompt 样例

当提供衣物参考图且 `fidelity` 为 `high` 或 `medium` 时，系统会自动构建如下格式的 prompt（中文版本，提高对中文模型的准确性）：

```
一张真人全身时尚穿搭照片。A person wearing a stylish outfit in a modern city setting.

=== 身材参考 ===
严格按照身材参考图保持身材比例和体型。

=== 衣物参考 ===
严格按照参考图片保持衣物的颜色、图案、logo、材质、纽扣、缝线等所有细节完全一致。
禁止重新设计、修改或添加参考图片中不存在的元素。

=== 面部参考 ===
保持面部相似度，同时确保衣物准确性为最高优先级。

=== 细节锁定（必须严格遵守） ===

衣物 1（衬衫）：
- Logo 文字："ACME"，位置：左胸口，文字颜色：白色
- 主要颜色：海军蓝、白色
- 图案：细竖条纹
- 材质：棉
- 配件：银色金属纽扣、4 个纽扣
- 独特细节：刺绣 logo、对比色缝线

=== 禁止事项 ===
- 禁止更改或移除 logo 文字
- 禁止更改或简化图案
- 禁止改变颜色或色调
- 禁止添加未明确要求的额外配饰
- 禁止重新设计衣物或改变风格
```

---

## 保真度参数说明

### `fidelity: "high"` (高保真)
- **优先级**: 衣物细节还原 > 画面美观度
- **特点**: 
  - 尽可能保留参考图的细节（logo、图案、纽扣、材质等）
  - 降低重绘强度（`strength: 0.2`）
  - 较高引导强度（`guidance_scale: 9.0`，范围 1.0-10.0）
  - 更多推理步数（`num_inference_steps: 50`）
- **适用场景**: 用户要求"衣物必须一模一样"时
- **代价**: 画面整体可能稍微不那么美化

### `fidelity: "medium"` (中保真，默认)
- **优先级**: 平衡细节保留和美观度
- **特点**:
  - 平衡的参数设置（`strength: 0.5`, `guidance_scale: 6.0`）
- **适用场景**: 大多数情况下的推荐选择

### `fidelity: "low"` (低保真)
- **优先级**: 画面美观度 > 细节还原
- **特点**:
  - 更自由的重绘（`strength: 0.7`）
  - 较低引导强度（`guidance_scale: 3.5`，范围 1.0-10.0）
  - 允许细节漂移以换取更好的视觉效果
- **适用场景**: 用户更关注整体风格而非精确细节时

---

## 技术实现要点

### 1. 局部放大 Patches

- **实现位置**: `server/src/utils/imagePatches.ts`
- **功能**: 自动为每张衣物参考图生成 2 张局部裁剪
  - 中心裁剪（捕获主要图案/logo）
  - 胸口区域裁剪（logo/口袋/刺绣最常见位置）
- **限制**: 最多生成 8 张 patches（防止超出模型输入限制）

### 2. 细节识别（Detail Lock）

- **实现位置**: `server/src/services/analyzeService.ts`
- **模型**: `doubao-seed-1-8-251228`
- **输出格式**: 结构化 JSON
  ```json
  {
    "garments": [
      {
        "category": "shirt",
        "dominant_colors": ["navy blue", "white"],
        "pattern": "thin vertical pinstripes",
        "material": "cotton",
        "logos": [{"text": "ACME", "position": "left chest", "color": "white"}],
        "hardware": ["silver metal buttons"],
        "unique_details": ["embroidered logo"]
      }
    ]
  }
  ```
- **降级处理**: 如果识别失败，继续生成但不包含 Detail Lock

### 3. 模型选择策略

- **纯文本生成**: 使用环境变量 `ARK_IMAGE_MODEL` 指定的模型
- **有图片输入**: 自动切换到 `doubao-seedream-4-5-251128`（可通过 `ARK_SEEDREAM_MODEL` 环境变量覆盖）

### 4. Ark API 适配

- **实现位置**: `server/src/utils/arkAdapter.ts`
- **格式**: 假设 Ark API 支持在 `/images/generations` endpoint 的请求体中包含 `images` 字段（base64 data URLs）
- **注意**: 如果实际 API 格式不同，需要调整 `buildArkImagePayload` 函数

---

## 前端 UI 使用说明

### Stylist 视图

1. 在聊天界面顶部，新增了"保真度"选择控件（Low/Medium/High）
2. 默认选择 Medium
3. 用户可选择 High 以获得最高细节还原度

### Try-on 视图

1. 在 Try-on 模态框中，场景输入框下方新增了"保真度"选择控件
2. 选择 High 时，系统会在提示中说明："High fidelity: Preserves clothing details exactly (logo, pattern, buttons). May be less stylized."

---

## 环境变量配置

### 必需的环境变量（已有）
- `ARK_API_KEY`: Ark API 密钥
- `ARK_BASE_URL`: Ark API 基础 URL（如 `https://ark.cn-beijing.volces.com/api/v3`）
- `ARK_IMAGE_MODEL`: 默认图片生成模型
- `ARK_CHAT_MODEL`: 聊天模型（用于细节识别，建议设置为 `doubao-seed-1-8-251228`）

### 可选的环境变量（新增）
- `ARK_SEEDREAM_MODEL`: 当有图片输入时使用的 Seedream 模型（默认：`doubao-seedream-4-5-251128`）

---

## 向后兼容性

- ✅ 纯文本 prompt 仍然可以正常工作（走旧的 text-to-image 流程）
- ✅ 前端 `generateFashionImage` 函数保持向后兼容（仍支持旧的两个参数格式）

---

## 如何测试

### 1. 测试高保真度细节还原

1. 上传一张有清晰 logo/图案的衣物图
2. 在 Stylist 或 Try-on 中选择 **High** 保真度
3. 生成图片后，检查：
   - Logo 文字是否准确保留
   - 图案细节（如条纹间距）是否一致
   - 纽扣形状/数量是否正确
   - 颜色是否匹配

### 2. 对比不同保真度

1. 使用相同的 prompt 和参考图
2. 分别选择 Low、Medium、High 保真度生成
3. 对比：
   - High: 细节最准，但可能画面稍硬
   - Medium: 平衡
   - Low: 画面最美，但细节可能漂移

### 3. 测试多图输入

1. 选择多件衣物（上衣 + 裤子 + 鞋）
2. 系统会自动：
   - 生成 patches
   - 识别每件衣物的细节
   - 将所有信息整合进 prompt

---

## 注意事项

1. **API 字段格式**: 当前实现假设 Ark API 的 `/images/generations` endpoint 支持 `images` 字段。如果实际 API 格式不同（例如需要不同的 endpoint 或字段名），需要修改 `server/src/utils/arkAdapter.ts` 中的 `buildArkImagePayload` 函数。

2. **Seedream 4.5 参数**: 保真度映射中的参数名（`strength`, `guidance_scale`, `num_inference_steps`）是基于常见图像生成 API 的推测。实际使用时可能需要根据 Seedream 4.5 的官方文档调整。

3. **图片大小限制**: 如果参考图过大，可能会影响处理速度。建议前端在上传时压缩图片。

4. **错误处理**: 系统设计了多层降级机制：
   - patches 生成失败 → 继续使用原图
   - 细节识别失败 → 继续生成但不包含 Detail Lock
   - Seedream 4.5 不可用 → 可降级到默认模型（但可能不支持图片输入）

---

## 下一步优化建议

1. **缓存细节识别结果**: 对于相同的衣物图，可以缓存识别结果，避免重复调用
2. **前端图片预览**: 在生成前预览 patches，让用户确认
3. **批量生成优化**: 支持同时生成多张图片时，复用 patches 和细节识别结果
4. **更多 patch 策略**: 根据衣物类型（上衣/裤子/鞋）选择不同的 patch 区域

---

## 完成时间

2025-01-XX

