# 图生图/多参考图输入修复总结

## 问题诊断

**根因**：后端构建的 Ark 请求体使用了自定义字段 `clothingImages/bodyRefImage/faceImages`，这些字段不被 Ark Seedream API 识别，导致参考图被忽略，实际效果等同纯文生图。

## 修复内容

### 1. 修改的文件

#### A) 后端核心文件

1. **`server/src/utils/arkAdapter.ts`**
   - ✅ 移除无效的 `mapFidelityToParams`（依赖可能无效的 strength/steps）
   - ✅ 新增 `mapFidelityToSizeAndPatchCount()`：根据保真度映射到 size 和 patch 数量
   - ✅ 新增 `buildImageInputArray()`：统一构建图片输入数组
   - ✅ 重写 `buildArkImagePayload()`：使用正确的 Ark API 字段格式

2. **`server/src/routes/image.ts`**
   - ✅ 重构图片输入处理流程
   - ✅ 根据保真度生成相应数量的 patches
   - ✅ 统一所有图片输入到 `image` 字段
   - ✅ 增强 prompt 构建（调用 `buildFullPrompt`）

3. **`server/src/utils/promptBuilder.ts`**
   - ✅ 强化 prompt 约束：明确必须使用参考图
   - ✅ 添加严格禁止项：禁止重新设计、logo 必须一致等

4. **`server/src/utils/imagePatches.ts`**
   - ✅ 优化 patch 生成：支持按数量生成（1 或 2 张）
   - ✅ 改进裁剪区域：优先胸口区域（logo 最常见位置）
   - ✅ 预处理：先 resize 到最长边 1536 再裁剪

---

## Ark 图片请求体格式

### 最终请求体结构

```json
{
  "model": "doubao-seedream-4-5-251128",
  "prompt": "增强后的中文 prompt（包含 DETAIL LOCK）",
  "image": [
    "data:image/png;base64,...",  // 衣物图 1（整图）
    "data:image/png;base64,...",  // 衣物图 2（整图）
    "data:image/png;base64,...",  // 衣物图 1 的 patch（胸口区域）
    "data:image/png;base64,...",  // 衣物图 1 的 patch（中心区域，仅 high）
    "data:image/png;base64,...",  // bodyRefImage（如果存在）
    "data:image/png;base64,..."   // faceImage（如果存在）
  ],
  "n": 1,
  "response_format": "b64_json",
  "watermark": false,
  "sequential_image_generation": "disabled",
  "size": "2K"  // 根据 fidelity 映射
}
```

### 关键字段说明

- **`image`**（数组）：所有参考图统一放在此字段，顺序为：衣物整图 → patches → bodyRef → faceImages
- **`response_format`**：固定为 `"b64_json"` 以获取 base64 格式图片
- **`watermark`**：设置为 `false` 不添加水印
- **`size`**：根据保真度映射（low: "1K", medium/high: "2K"）

---

## Fidelity 映射策略

### `mapFidelityToSizeAndPatchCount(fidelity)`

| 保真度 | size | patchesPerImage | maxTotalImages | 说明 |
|--------|------|-----------------|----------------|------|
| **low** | `"1K"` | `0` | `8` | 只传衣物整图，不生成 patch，较低分辨率 |
| **medium** | `"2K"` | `1` | `8` | 每件衣物生成 1 张 patch（优先胸口区域），默认分辨率 |
| **high** | `"2K"` | `2` | `8` | 每件衣物生成 2 张 patch（胸口 + 中心），最高分辨率 |

### Patch 生成策略

- **Low 保真度**：不生成 patch，只传衣物整图
- **Medium 保真度**：每件衣物生成 **1 张 patch**（优先胸口区域，logo/口袋/刺绣最常见位置）
- **High 保真度**：每件衣物生成 **2 张 patch**（胸口区域 + 中心区域）

### 图片输入顺序

1. **衣物整图**（所有 clothingImages）
2. **衣物 patches**（根据保真度生成）
3. **bodyRefImage**（如果提供，用于保持身材比例）
4. **faceImages**（如果提供，用于面部相似度）

总数量限制：最多 8 张图片（防止超出 API 限制）

---

## Enhanced Prompt 示例

### 示例输入

```typescript
{
  prompt: "穿着这套衣服在咖啡厅工作",
  clothingImages: ["data:image/png;base64,..."], // 1 张衬衫图
  bodyRefImage: "data:image/png;base64,...",
  fidelity: "high"
}
```

### 生成的 Enhanced Prompt（中文）

```
一张真人全身时尚穿搭照片。单人全身，中性站立姿势，真实照片风格，自然光线。穿着这套衣服在咖啡厅工作

【重要】提供的参考图片必须用于保持衣物细节。必须严格按照参考图片还原。

=== 身材参考 ===
严格按照身材参考图保持身材比例和体型。
保持身体比例与身材参考图一致。

=== 衣物参考 ===
严格按照参考图片保持衣物的颜色、图案、logo、材质、纽扣、缝线等所有细节完全一致。
【禁止重新设计衣物】。禁止修改或添加参考图片中不存在的元素。
必须保持 logo 文字完全一致，不得更改或移除。
必须保持图案间距和样式完全一致。
必须保持纽扣和缝线细节完全一致。

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

## 技术实现细节

### 1. Patch 生成流程

```typescript
// 1. 原图先 resize 到最长边 1536（优化输入尺寸）
const resizedImage = await sharp(imageBuffer)
  .resize(1536, 1536, { fit: 'inside', withoutEnlargement: true })
  .toBuffer();

// 2. 生成胸口区域 patch（优先，logo 最常见位置）
// 区域：高度 15%-55%，宽度 20%-80%
const chestPatch = await image.extract({...}).resize(1024, 1024).toBuffer();

// 3. 生成中心区域 patch（仅 high 保真度）
// 区域：中心 50% x 50%
const centerPatch = await image.extract({...}).resize(1024, 1024).toBuffer();
```

### 2. 图片输入数组构建

```typescript
const imageInputs = buildImageInputArray({
  clothingImages: ["img1", "img2"],      // 2 张衣物整图
  clothingPatches: ["patch1", "patch2"], // 2 张 patches（medium/high）
  bodyRefImage: "bodyImg",               // 1 张身材参考
  faceImages: ["face1"],                 // 1 张面部参考
  maxTotalImages: 8                      // 最多 8 张
});
// 结果：["img1", "img2", "patch1", "patch2", "bodyImg", "face1"]
```

### 3. 请求体构建

```typescript
const payload = {
  model: "doubao-seedream-4-5-251128",
  prompt: enhancedPrompt,
  image: imageInputs,                    // 关键：使用 image 字段
  n: 1,
  response_format: "b64_json",
  watermark: false,
  sequential_image_generation: "disabled",
  size: "2K"                             // 根据 fidelity 映射
};
```

---

## 前端兼容性

前端代码已支持新格式（无需修改）：

```typescript
// services/geminiService.ts
generateFashionImage({
  prompt: "...",
  clothingImages: ["data:image/png;base64,..."],
  bodyRefImage: "data:image/png;base64,...",
  faceImages: ["data:image/png;base64,..."],
  fidelity: "high"
});
```

前端已包含 fidelity 选择 UI（Low/Medium/High），默认 Medium。

---

## 测试验证

### 测试场景 1：High 保真度

**输入**：
- 1 张衬衫图（有清晰 logo）
- fidelity: "high"

**预期结果**：
- 请求体包含：1 张整图 + 2 张 patches（胸口 + 中心）
- size: "2K"
- prompt 包含 DETAIL LOCK 和严格约束
- 生成的图片应完全保留 logo 文字和细节

### 测试场景 2：Medium 保真度

**输入**：
- 2 张衣物图（上衣 + 裤子）
- fidelity: "medium"

**预期结果**：
- 请求体包含：2 张整图 + 2 张 patches（每件 1 张）
- size: "2K"
- 总共 4-6 张图片（取决于是否提供 bodyRef/faceImages）

### 测试场景 3：Low 保真度

**输入**：
- 1 张衣物图
- fidelity: "low"

**预期结果**：
- 请求体包含：仅 1 张整图（不生成 patch）
- size: "1K"
- 更快的生成速度，但细节可能不够精确

---

## 关键改进点

1. ✅ **字段名修复**：从自定义字段改为 Ark 标准的 `image` 字段
2. ✅ **图片顺序优化**：衣物整图 → patches → bodyRef → faceImages
3. ✅ **Patch 策略**：根据保真度智能生成 0/1/2 张 patches
4. ✅ **Prompt 强化**：明确必须使用参考图，禁止重新设计
5. ✅ **Size 映射**：根据保真度选择合适的分辨率
6. ✅ **细节识别集成**：Medium/High 时自动识别并锁定细节

---

## 注意事项

1. **图片数量限制**：最多 8 张图片输入，超出会被截断
2. **Patch 生成失败**：如果 patch 生成失败，会降级为只使用整图
3. **细节识别失败**：如果细节识别失败，会继续生成但不包含 DETAIL LOCK
4. **Size 参数**：如果 Ark 不支持 "4K"，high 保真度使用 "2K"

---

## 完成时间

2025-01-XX

