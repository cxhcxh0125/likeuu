# Preview 模式多件衣物预算制算法说明

## 概述

Preview 模式现在支持多件衣物（2-3件）的复刻，通过"输入图预算制"控制总输入图数量（≤5张），在保持速度优势（10-20秒）的前提下，提升多件穿搭预览效果。

## 核心参数

- **最大输入图数量**: 5张（Preview 模式）
- **预算分配策略**: 优先级顺序 + 预算制

## 算法流程

### 1. 衣物重要性排序

按类别优先级排序（数值越小，优先级越高）：
- 上衣: 1
- 外套: 2
- 下装: 3
- 鞋: 4
- 配饰: 5
- 未知类别: 10

### 2. 预算分配优先级

按照以下顺序分配预算（每步最多1张/件，全局最多5张）：

#### 步骤1：用户圈选的 detail patch（最高优先级）
- 为每件衣物最多加入1张 detail patch
- 按衣物重要性排序处理
- 如果某件衣物有 detail patch，优先使用 detail patch 而非整图

#### 步骤2：衣物整图
- 为每件衣物最多加入1张整图
- 按衣物重要性排序处理
- 如果某件衣物已有 detail patch，跳过整图（避免重复）

#### 步骤3：剩余预算分配
- **Auto patch**: 仅在没有用户圈选 detail patch 时，全局最多加入1张
- **BodyRef**: 如果用户显式开启 `includeBodyRefInPreview` 且有剩余预算，加入1张

### 3. 输入图优先级总结

```
优先级顺序（Preview 模式）：
1. 所有衣物的用户圈选 detail patch（按重要性排序，最多1张/件）
2. 每件衣物整图（按重要性排序，最多1张/件，已有 detail patch 的跳过）
3. 1张 auto patch（仅在没有 detail patch 时）
4. 1张 bodyRef（仅当用户显式开启时）
```

## 示例场景

### 场景1：3件衣物，都有 detail patch

**输入**：
- 上衣（imageUrl1） + detailCrop1
- 外套（imageUrl2） + detailCrop2
- 下装（imageUrl3） + detailCrop3

**输出**（5张）：
1. detailPatch1（上衣）
2. detailPatch2（外套）
3. detailPatch3（下装）
4. （无需整图，因为每件都有 detail patch）
5. （剩余预算：2张，但不再添加）

**实际结果**: 3张（detail patches）

---

### 场景2：3件衣物，只有上衣有 detail patch

**输入**：
- 上衣（imageUrl1） + detailCrop1
- 外套（imageUrl2）
- 下装（imageUrl3）

**输出**（5张）：
1. detailPatch1（上衣）
2. imageUrl2（外套整图）
3. imageUrl3（下装整图）
4. （可选：1张 auto patch 或 bodyRef，如果没有 detail patch）

**实际结果**: 3-4张（1个 detail patch + 2-3张整图 + 可选 auto patch）

---

### 场景3：3件衣物，都没有 detail patch

**输入**：
- 上衣（imageUrl1）
- 外套（imageUrl2）
- 下装（imageUrl3）

**输出**（5张）：
1. imageUrl1（上衣整图）
2. imageUrl2（外套整图）
3. imageUrl3（下装整图）
4. （可选：1张 auto patch）
5. （可选：1张 bodyRef，如果用户开启）

**实际结果**: 3-5张（3张整图 + 可选 auto patch + 可选 bodyRef）

---

### 场景4：2件衣物，1件有 detail patch

**输入**：
- 上衣（imageUrl1） + detailCrop1
- 鞋（imageUrl2）

**输出**（5张）：
1. detailPatch1（上衣）
2. imageUrl2（鞋整图）
3. （剩余预算：3张，但不再添加）

**实际结果**: 2张（1个 detail patch + 1张整图）

## 速度优化保证

1. **跳过 analyze（Detail Lock）**: Preview 模式不执行 analyze，节省时间
2. **限制输入图数量**: 最多5张，确保快速处理
3. **并行处理**: detail patches 处理并行化
4. **缓存机制**: auto patches 使用缓存（如果已生成）
5. **分辨率**: 使用 2K 分辨率（doubao-seedream-4-5 不支持 1K）

## 与 Refine 模式的对比

| 特性 | Preview 模式 | Refine 模式 |
|------|-------------|-------------|
| 最大输入图 | 5张 | 6-8张 |
| 分辨率 | 2K | 2K（medium/high） |
| Detail patches | 按预算分配（最多1张/件） | 全部处理 |
| Auto patches | 全局最多1张（仅无 detail patch 时） | 智能减法策略 |
| Analyze | 跳过 | 仅在 high 时执行 |
| 预期时间 | 10-20秒 | 30-60秒 |

## API 调用示例

```typescript
// 前端调用
const imageOptions = {
  prompt: "A stylish outfit",
  mode: 'preview',
  clothingImages: [
    'data:image/jpeg;base64,...',  // 上衣
    'data:image/jpeg;base64,...',  // 外套
    'data:image/jpeg;base64,...'   // 下装
  ],
  clothingCategories: ['上衣', '外套', '下装'],  // 与 clothingImages 按顺序对应
  clothingDetailCrops: [
    { imageDataUrl: '...', rect: { x: 100, y: 100, w: 200, h: 200 } },  // 上衣的 detail crop
    // 外套和下装没有 detail crop
  ],
  includeBodyRefInPreview: false,  // 默认不包含 bodyRef
  fidelity: 'medium'  // Preview 模式下不生效，仅用于 Refine
};
```

## 注意事项

1. **detailCrops 匹配**: 后端会尝试通过索引和 imageDataUrl 匹配 detailCrop 与 clothingImage，建议前端按顺序传递
2. **类别重要性**: 如果没有传递 `clothingCategories`，则按传递顺序排序（第一件最重要）
3. **BodyRef**: Preview 模式默认不包含 bodyRef，如需包含请设置 `includeBodyRefInPreview: true`
4. **速度保证**: 即使支持多件衣物，Preview 模式仍然保持 10-20 秒的速度优势

