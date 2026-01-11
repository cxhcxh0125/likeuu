/**
 * Ark API 适配层
 * 根据是否有图片输入，选择正确的模型和请求格式
 */

export type Fidelity = 'low' | 'medium' | 'high';

/**
 * 根据保真度映射到图片尺寸和 patch 数量
 * @returns { size: string, patchesPerImage: number, maxTotalImages: number }
 */
export function mapFidelityToSizeAndPatchCount(fidelity: Fidelity = 'medium'): {
  size: string;
  patchesPerImage: number;
  maxTotalImages: number;
} {
  switch (fidelity) {
    case 'high':
      // 高保真：最高分辨率 + 每件衣物 2 张 patch
      return {
        size: '2K', // 或 '4K' 如果 Ark 支持
        patchesPerImage: 2,
        maxTotalImages: 8,
      };
    case 'medium':
      // 中保真：保持 2K 分辨率（doubao-seedream-4-5 不支持 1K）+ 每件衣物 1 张 patch（但实际可能被智能减法禁用）
      // 速度优化主要通过：减少输入图片数量、并行处理、缓存机制实现
      return {
        size: '2K',  // doubao-seedream-4-5 不支持 '1K'，必须使用 '2K'
        patchesPerImage: 1,
        maxTotalImages: 8,  // 保持上限，但实际会通过策略控制在 3-5 张
      };
    case 'low':
    default:
      // 低保真：较低分辨率，不生成 patch
      return {
        size: '1K',
        patchesPerImage: 0,
        maxTotalImages: 8,
      };
  }
}

/**
 * 判断是否应该使用 Seedream 4.5（支持多图输入/参考一致性）
 */
export function shouldUseSeedream4(
  clothingImages?: string[],
  bodyRefImage?: string,
  faceImages?: string[]
): boolean {
  return !!(
    (clothingImages && clothingImages.length > 0) ||
    bodyRefImage ||
    (faceImages && faceImages.length > 0)
  );
}

/**
 * 构建统一的图片输入数组
 * 优先级顺序（high/medium fidelity）：
 * 1. user detail patches（用户圈选的细节区域）- 最高优先级
 * 2. auto patches（自动生成的胸口/中心等）
 * 3. clothingImages（整图）
 * 4. bodyRefImage（如果存在）
 * 5. faceImages（如果存在）
 */
export function buildImageInputArray(options: {
  clothingImages?: string[];
  clothingPatches?: string[];
  userDetailPatches?: string[];  // 用户圈选的 detail patches
  bodyRefImage?: string;
  faceImages?: string[];
  maxTotalImages?: number;
}): string[] {
  const {
    clothingImages = [],
    clothingPatches = [],
    userDetailPatches = [],
    bodyRefImage,
    faceImages = [],
    maxTotalImages = 8,
  } = options;

  const imageInputs: string[] = [];

  // 1. 最高优先级：用户圈选的 detail patches
  for (const patch of userDetailPatches) {
    if (imageInputs.length >= maxTotalImages) break;
    imageInputs.push(patch);
  }

  // 2. 自动生成的 patches（胸口/中心等）
  for (const patch of clothingPatches) {
    if (imageInputs.length >= maxTotalImages) break;
    imageInputs.push(patch);
  }

  // 3. 衣物整图
  for (const img of clothingImages) {
    if (imageInputs.length >= maxTotalImages) break;
    imageInputs.push(img);
  }

  // 4. bodyRefImage（如果存在）
  if (bodyRefImage && imageInputs.length < maxTotalImages) {
    imageInputs.push(bodyRefImage);
  }

  // 5. 最后 push faceImages（如果存在）
  for (const faceImg of faceImages) {
    if (imageInputs.length >= maxTotalImages) break;
    imageInputs.push(faceImg);
  }

  return imageInputs;
}

/**
 * 构建 Ark 图片生成请求体
 * 使用 Ark OpenAI-compatible API 格式：image 字段（数组）
 */
export function buildArkImagePayload(options: {
  model: string;
  prompt: string;
  imageInputs: string[];
  fidelity?: Fidelity;
  n?: number;
}): any {
  const {
    model,
    prompt,
    imageInputs,
    fidelity = 'medium',
    n = 1,
  } = options;

  // 基础请求体
  const payload: any = {
    model,
    prompt,
    n: Math.min(n, 4),
    response_format: 'b64_json', // 返回 base64 格式
    watermark: false, // 不添加水印
    sequential_image_generation: 'disabled', // 禁用顺序生成
  };

  // 添加图片输入（如果有）
  if (imageInputs.length > 0) {
    // 确保所有图片都是有效的 data URL 格式
    // Ark API 需要完整的 data URL 格式：data:image/jpeg;base64,...
    const validatedImages = imageInputs.map((img, index) => {
      if (!img || typeof img !== 'string') {
        throw new Error(`Invalid image input at index ${index}: must be a string`);
      }
      // 确保是 data URL 格式
      if (!img.startsWith('data:')) {
        throw new Error(`Invalid image format at index ${index}: must be a data URL starting with 'data:'`);
      }
      // 验证 data URL 格式
      if (!img.includes(';base64,')) {
        throw new Error(`Invalid image format at index ${index}: data URL must include ';base64,'`);
      }
      return img;
    });
    payload.image = validatedImages; // 关键：字段名必须是 image（不是 images）
    console.log(`[ArkAdapter] Added ${validatedImages.length} images to payload, first image preview: ${validatedImages[0]?.substring(0, 50)}...`);
  }

  // 添加尺寸参数（根据保真度）
  const { size } = mapFidelityToSizeAndPatchCount(fidelity);
  payload.size = size;

  return payload;
}

/**
 * 获取应该使用的图片生成模型
 * 如果有图片输入，优先使用 Seedream 4.5
 */
export function getImageModel(
  defaultModel: string,
  hasImages: boolean
): string {
  if (hasImages) {
    // 如果有图片输入，强制使用 Seedream 4.5
    // 允许通过环境变量覆盖
    return process.env.ARK_SEEDREAM_MODEL || 'doubao-seedream-4-5-251128';
  }
  return defaultModel;
}

