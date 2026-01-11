import express from 'express';
import dotenv from 'dotenv';
import { getAuthHeader } from '../utils/auth.js';
import { generateMultipleImagePatches } from '../utils/imagePatches.js';
import { processDetailCrops } from '../utils/cropPatch.js';
import { analyzeClothingDetails } from '../services/analyzeService.js';
import { buildFullPrompt } from '../utils/promptBuilder.js';
import { normalizeDataUrlToJpeg, normalizeDataUrlsToJpeg } from '../utils/normalizeImage.js';
import { clothingDetailsCache, patchesCache, generateCacheKey } from '../utils/cache.js';
import { 
  buildArkImagePayload, 
  getImageModel, 
  shouldUseSeedream4, 
  buildImageInputArray,
  mapFidelityToSizeAndPatchCount,
  Fidelity 
} from '../utils/arkAdapter.js';

dotenv.config();

const router = express.Router();

/**
 * 衣物类别优先级映射（用于排序）
 * 数值越小，优先级越高
 */
const CATEGORY_PRIORITY: Record<string, number> = {
  '上衣': 1,
  '外套': 2,
  '下装': 3,
  '鞋': 4,
  '配饰': 5,
  // 英文类别
  'top': 1,
  'jacket': 2,
  'coat': 2,
  'bottom': 3,
  'pants': 3,
  'shoes': 4,
  'accessories': 5,
  // 默认：未知类别优先级最低
  'default': 10,
};

/**
 * 获取衣物类别优先级
 */
function getCategoryPriority(category: string | undefined): number {
  if (!category) return CATEGORY_PRIORITY.default;
  const normalized = category.toLowerCase().trim();
  return CATEGORY_PRIORITY[normalized] || CATEGORY_PRIORITY[category] || CATEGORY_PRIORITY.default;
}

/**
 * Preview 模式：预算制选择输入图（<=5张）
 * 
 * 预算分配策略：
 * 1. 优先加入：所有衣物的用户圈选 detail patch（按衣物重要性排序，最多1张/件）
 * 2. 然后加入：每件衣物整图（按衣物重要性排序，最多1张/件）
 * 3. 最后（若有剩余预算）：最多1张 auto patch 或 bodyRef
 * 
 * @param options - 输入参数
 * @returns 选中的图片输入数组（<=5张）
 */
async function buildPreviewImageInputs(options: {
  clothingImages: string[];  // 标准化后的衣物整图数组
  clothingCategories?: string[];  // 衣物类别数组（与 clothingImages 按顺序对应）
  clothingDetailCrops?: Array<{ imageDataUrl: string; rect: { x: number; y: number; w: number; h: number } }>;  // 用户圈选的细节区域
  normalizedClothingDetailCrops?: Array<{ imageDataUrl: string; rect: { x: number; y: number; w: number; h: number } }>;  // 标准化后的 detail crops
  bodyRefImage?: string;  // 标准化后的 bodyRef
  includeBodyRef?: boolean;  // 是否包含 bodyRef（默认 false）
  autoPatches?: string[];  // 自动生成的 patches（可选）
}): Promise<string[]> {
  const {
    clothingImages = [],
    clothingCategories = [],
    normalizedClothingDetailCrops = [],
    bodyRefImage,
    includeBodyRef = false,
    autoPatches = [],
  } = options;

  const MAX_PREVIEW_IMAGES = 5;  // Preview 模式最多5张输入图
  const imageInputs: string[] = [];

  // 步骤1：建立衣物索引，将 clothingImages 和 clothingCategories 配对
  interface ClothingItem {
    index: number;  // 原始索引
    imageUrl: string;
    category: string | undefined;
    priority: number;
    detailCrop?: { imageDataUrl: string; rect: { x: number; y: number; w: number; h: number } };
  }

  const clothingItems: ClothingItem[] = clothingImages.map((imgUrl, index) => {
    const category = clothingCategories[index];
    // 查找对应的 detailCrop：
    // 1. 优先按索引匹配（假设 clothingDetailCrops 和 clothingImages 按顺序对应）
    // 2. 如果索引不匹配，则尝试通过 imageDataUrl 匹配
    let detailCrop: { imageDataUrl: string; rect: { x: number; y: number; w: number; h: number } } | undefined = normalizedClothingDetailCrops[index];
    if (!detailCrop) {
      // 尝试通过 imageDataUrl 匹配（比较 base64 数据的前100个字符）
      const foundCrop = normalizedClothingDetailCrops.find(crop => {
        const imgBase64 = imgUrl.split(',')[1]?.substring(0, 100) || '';
        const cropBase64 = crop.imageDataUrl.split(',')[1]?.substring(0, 100) || '';
        return cropBase64 && imgBase64 && (cropBase64 === imgBase64 || crop.imageDataUrl.includes(imgBase64.substring(0, 50)));
      });
      if (foundCrop) {
        detailCrop = foundCrop;
      }
    }
    
    return {
      index,
      imageUrl: imgUrl,
      category,
      priority: getCategoryPriority(category),
      detailCrop,
    };
  });

  // 按优先级排序：优先级数值越小，越重要
  clothingItems.sort((a, b) => a.priority - b.priority);

    // 步骤2：优先加入所有衣物的用户圈选 detail patch（最多1张/件）
    // 注意：这里 processDetailCrops 已经在文件顶部导入
    for (const item of clothingItems) {
      if (imageInputs.length >= MAX_PREVIEW_IMAGES) break;
      if (item.detailCrop) {
        // 处理 detail crop（裁剪并放大）
        try {
          const patches = await processDetailCrops([item.detailCrop]);
          if (patches.length > 0) {
            imageInputs.push(patches[0]);
            console.log(`[Preview] Added detail patch for clothing[${item.index}] (category: ${item.category || 'unknown'})`);
          }
        } catch (error) {
          console.warn(`[Preview] Failed to process detail crop for clothing[${item.index}], skipping:`, error);
        }
      }
    }

  // 步骤3：按优先级加入每件衣物整图（最多1张/件）
  for (const item of clothingItems) {
    if (imageInputs.length >= MAX_PREVIEW_IMAGES) break;
    // 如果已经有该衣物的 detail patch，跳过整图（优先使用 detail patch）
    const hasDetailPatch = item.detailCrop;
    if (!hasDetailPatch) {
      imageInputs.push(item.imageUrl);
      console.log(`[Preview] Added full image for clothing[${item.index}] (category: ${item.category || 'unknown'})`);
    }
  }

  // 步骤4：最后（若有剩余预算）：最多1张 auto patch 或 bodyRef
  // 4a. 优先加入 1 张 auto patch（仅在没有用户圈选时，且全局最多1张）
  if (imageInputs.length < MAX_PREVIEW_IMAGES && autoPatches.length > 0 && normalizedClothingDetailCrops.length === 0) {
    imageInputs.push(autoPatches[0]);
    console.log(`[Preview] Added 1 auto patch (remaining budget: ${MAX_PREVIEW_IMAGES - imageInputs.length})`);
  }

  // 4b. 如果用户显式开启或剩余预算充足，加入 bodyRef
  if (imageInputs.length < MAX_PREVIEW_IMAGES && bodyRefImage && includeBodyRef) {
    imageInputs.push(bodyRefImage);
    console.log(`[Preview] Added bodyRef (remaining budget: ${MAX_PREVIEW_IMAGES - imageInputs.length})`);
  }

  console.log(`[Preview] Final image inputs: ${imageInputs.length}/${MAX_PREVIEW_IMAGES} (${clothingItems.length} clothing items)`);
  return imageInputs;
}

interface ImageRequest {
  prompt: string;
  mode?: "preview" | "refine"; // NEW：生成模式，默认 preview
  clothingImages?: string[];  // data URL 数组（衣物参考）
  clothingCategories?: string[];  // NEW: 衣物类别数组（与 clothingImages 按顺序对应），用于优先级排序
  clothingDetailCrops?: Array<{  // 用户圈选的细节区域
    imageDataUrl: string;
    rect: { x: number; y: number; w: number; h: number };
  }>;
  bodyRefImage?: string;      // 可选：用户全身参考（用于身材比例）
  includeBodyRefInPreview?: boolean;  // NEW: Preview 模式是否包含 bodyRef（默认 false）
  faceImages?: string[];      // 可选：人脸参考
  fidelity?: Fidelity;        // 新增：保真度 low/medium/high（refine 时使用）
  n?: number;
}

/**
 * POST /api/image
 * 转发图片生成请求到 Ark API (即梦/Seedream)
 * 支持多参考图输入和保真度控制
 */
router.post('/', async (req, res, next) => {
  try {
    const { 
      prompt, 
      mode = 'preview', // 默认 preview 模式
      clothingImages,
      clothingCategories,  // NEW: 衣物类别数组
      clothingDetailCrops,
      bodyRefImage,
      includeBodyRefInPreview = false,  // NEW: Preview 模式是否包含 bodyRef（默认 false）
      faceImages,
      fidelity = 'medium',
      n = 1 
    }: ImageRequest = req.body;

    if (!prompt || typeof prompt !== 'string') {
      return res.status(400).json({ error: 'prompt is required and must be a string' });
    }

    const apiKey = process.env.ARK_API_KEY;
    const baseUrl = process.env.ARK_BASE_URL;
    const defaultModel = process.env.ARK_IMAGE_MODEL;

    if (!apiKey || !baseUrl || !defaultModel) {
      return res.status(500).json({ 
        error: 'Server configuration error: ARK_API_KEY, ARK_BASE_URL, or ARK_IMAGE_MODEL is missing' 
      });
    }

    // 步骤0：标准化所有输入图片（HEIC/HEIF -> JPEG，确保所有下游处理都能正常工作）
    let normalizedClothingImages: string[] | undefined;
    let normalizedBodyRefImage: string | undefined;
    let normalizedFaceImages: string[] | undefined;
    let normalizedClothingDetailCrops: Array<{ imageDataUrl: string; rect: { x: number; y: number; w: number; h: number } }> | undefined;

    try {
      // Normalize clothingImages（整图）：进一步降低到 maxDim=1024, quality=80 以大幅提升速度
      if (clothingImages && clothingImages.length > 0) {
        console.log(`[Image Route] Normalizing ${clothingImages.length} clothing images (maxDim=1024, quality=80)...`);
        normalizedClothingImages = await normalizeDataUrlsToJpeg(clothingImages, { maxDim: 1024, quality: 80 });
        console.log(`[Image Route] Normalized ${normalizedClothingImages.length} clothing images to JPEG (resized to max 1024px)`);
      }

      // Normalize bodyRefImage：maxDim=1024, quality=80
      if (bodyRefImage) {
        console.log(`[Image Route] Normalizing body reference image (maxDim=1024, quality=80)...`);
        normalizedBodyRefImage = await normalizeDataUrlToJpeg(bodyRefImage, { maxDim: 1024, quality: 80 });
        console.log(`[Image Route] Normalized body reference image to JPEG (resized to max 1024px)`);
      }

      // Normalize faceImages：maxDim=512, quality=80（人脸进一步降低）
      if (faceImages && faceImages.length > 0) {
        console.log(`[Image Route] Normalizing ${faceImages.length} face images (maxDim=512, quality=80)...`);
        normalizedFaceImages = await normalizeDataUrlsToJpeg(faceImages, { maxDim: 512, quality: 80 });
        console.log(`[Image Route] Normalized ${normalizedFaceImages.length} face images to JPEG`);
      }

      // Normalize clothingDetailCrops：在 crop 前先 normalize maxDim=1024（否则大图 crop 很慢）
      if (clothingDetailCrops && clothingDetailCrops.length > 0) {
        console.log(`[Image Route] Normalizing ${clothingDetailCrops.length} detail crop images (maxDim=1024, quality=80)...`);
        normalizedClothingDetailCrops = await Promise.all(
          clothingDetailCrops.map(async (crop) => ({
            ...crop,
            imageDataUrl: await normalizeDataUrlToJpeg(crop.imageDataUrl, { maxDim: 1024, quality: 80 })
          }))
        );
        console.log(`[Image Route] Normalized ${normalizedClothingDetailCrops.length} detail crop images to JPEG (resized to max 1024px before crop)`);
      }
    } catch (normalizeError: any) {
      console.error('[Image Route] Image normalization failed:', normalizeError.message);
      
      // 检查是否有 HEIC/HEIF 格式的图片，如果有且转换失败，必须返回错误
      const checkForHeic = (images: string[] | undefined): boolean => {
        if (!images) return false;
        return images.some(img => img && img.startsWith('data:image/heic') || img.startsWith('data:image/heif'));
      };
      
      const hasHeicClothing = checkForHeic(clothingImages);
      const hasHeicBody = bodyRefImage && (bodyRefImage.startsWith('data:image/heic') || bodyRefImage.startsWith('data:image/heif'));
      const hasHeicFace = checkForHeic(faceImages);
      const hasHeicCrops = clothingDetailCrops?.some(crop => 
        crop.imageDataUrl && (crop.imageDataUrl.startsWith('data:image/heic') || crop.imageDataUrl.startsWith('data:image/heif'))
      );
      
      if (hasHeicClothing || hasHeicBody || hasHeicFace || hasHeicCrops) {
        // 如果有 HEIC 图片且转换失败，必须返回错误
        return res.status(400).json({ 
          error: 'HEIC 转换失败，请改用 JPG/PNG 格式的图片。如果已安装 heic-convert，请检查是否正确安装。'
        });
      }
      
      // 对于非 HEIC 格式，降级使用原图
      console.warn('[Image Route] Using original images as fallback (non-HEIC format)');
      if (!normalizedClothingImages) normalizedClothingImages = clothingImages;
      if (!normalizedBodyRefImage) normalizedBodyRefImage = bodyRefImage;
      if (!normalizedFaceImages) normalizedFaceImages = faceImages;
      if (!normalizedClothingDetailCrops) normalizedClothingDetailCrops = clothingDetailCrops;
    }

    // 归一化 normalizedClothingImages，确保后续使用不会出现 undefined
    const normalizedClothingImagesArr = normalizedClothingImages ?? [];

    // 判断是否有图片输入（使用标准化后的图片）
    const hasImages = shouldUseSeedream4(normalizedClothingImagesArr, normalizedBodyRefImage, normalizedFaceImages);
    
    // 选择模型：有图片输入时使用 Seedream 4.5
    const model = getImageModel(defaultModel, hasImages);

    // 步骤1：根据 mode 和保真度确定处理策略
    // Preview 模式：快速预览，使用最少资源（但必须使用 2K，因为 doubao-seedream-4-5 不支持 1K）
    // Refine 模式：高保真精修，使用完整流程
    const isPreview = mode === 'preview';
    // Preview 模式使用 medium fidelity (2K) 以保证兼容性，但通过减少输入图、跳过 patches/analyze 来加速
    const effectiveFidelity = isPreview ? 'medium' : fidelity;
    
    const { patchesPerImage, maxTotalImages } = mapFidelityToSizeAndPatchCount(effectiveFidelity);
    let clothingPatches: string[] = [];
    let userDetailPatches: string[] = [];
    let clothingDetails = undefined;

    // 步骤2-4：并行执行 userDetailPatches / auto patches / analyzeClothingDetails（使用 Promise.allSettled）
    const parallelTasks: Array<Promise<any>> = [];

    // 任务1：处理用户圈选的 detail crops
    // Preview 模式：在 buildPreviewImageInputs 中按需处理（支持多件衣物）
    // Refine 模式：预先处理所有 detail crops
    if (isPreview) {
      // Preview 模式：不在这里处理，而是在 buildPreviewImageInputs 中按需处理
      parallelTasks.push(Promise.resolve({ type: 'userDetailPatches', result: [] }));
    } else if (normalizedClothingDetailCrops && normalizedClothingDetailCrops.length > 0 && (fidelity === 'medium' || fidelity === 'high')) {
      parallelTasks.push(
        processDetailCrops(normalizedClothingDetailCrops)
          .then(patches => ({ type: 'userDetailPatches', result: patches }))
          .catch(err => ({ type: 'userDetailPatches', error: err }))
      );
    } else {
      parallelTasks.push(Promise.resolve({ type: 'userDetailPatches', result: [] }));
    }

    // 任务2：生成自动局部放大 patches（智能减法策略）
    // Preview 模式：生成少量 auto patches（用于 budget 分配，全局最多1张）
    // Refine 模式：使用智能减法策略
    const shouldGenerateAutoPatches = normalizedClothingImagesArr.length > 0 && patchesPerImage > 0;
    // Preview 模式：最多生成1张 auto patch（用于 budget 分配）
    let effectivePatchesPerImage = isPreview ? (normalizedClothingDetailCrops?.length === 0 ? 1 : 0) : patchesPerImage;
    
    if (shouldGenerateAutoPatches && normalizedClothingDetailCrops && normalizedClothingDetailCrops.length > 0) {
      if (fidelity === 'medium') {
        // medium 模式：有 userDetailPatches 时禁用 auto patches
        effectivePatchesPerImage = 0;
        console.log('[Image Route] Smart reduction: medium mode with userDetailPatches, disabling auto patches');
      } else if (fidelity === 'high') {
        // high 模式：有 userDetailPatches 时最多生成 1 张 auto patch
        effectivePatchesPerImage = 1;
        console.log('[Image Route] Smart reduction: high mode with userDetailPatches, limiting auto patches to 1 total');
      }
    }

    if (shouldGenerateAutoPatches && effectivePatchesPerImage > 0) {
      // 使用缓存
      const cacheKeys = normalizedClothingImagesArr.map(img => generateCacheKey(img));
      const cachedPatchesList: string[] = [];
      const uncachedImages: string[] = [];
      const uncachedIndices: number[] = [];

      normalizedClothingImagesArr.forEach((img, index) => {
        const cached = patchesCache.get(cacheKeys[index]);
        if (cached && Array.isArray(cached)) {
          cachedPatchesList.push(...cached);
        } else {
          uncachedImages.push(img);
          uncachedIndices.push(index);
        }
      });

      if (uncachedImages.length > 0) {
        // 计算剩余可用位置（考虑 user detail patches）
        const estimatedUserPatches = normalizedClothingDetailCrops?.length || 0;
        const remainingSlots = maxTotalImages - estimatedUserPatches - normalizedClothingImagesArr.length - (normalizedBodyRefImage ? 1 : 0) - (normalizedFaceImages?.length || 0);
        const maxAutoPatches = fidelity === 'medium' ? Math.min(remainingSlots, 2) : (fidelity === 'high' && estimatedUserPatches > 0 ? 1 : remainingSlots);

        parallelTasks.push(
          generateMultipleImagePatches(
            uncachedImages,
            effectivePatchesPerImage,
            maxAutoPatches,
            2 // maxConcurrency = 2
          )
            .then(newPatches => {
              // 缓存结果（每张图片的 patches）
              uncachedImages.forEach((img, idx) => {
                const originalIdx = uncachedIndices[idx];
                const imagePatches = newPatches.slice(idx * effectivePatchesPerImage, (idx + 1) * effectivePatchesPerImage);
                patchesCache.set(cacheKeys[originalIdx], imagePatches);
              });
              // 合并缓存和新生成的 patches
              return { type: 'autoPatches', result: [...cachedPatchesList, ...newPatches] };
            })
            .catch(err => {
              // 即使生成失败，也返回缓存的 patches
              return { type: 'autoPatches', result: cachedPatchesList, error: err };
            })
        );
      } else {
        // 全部命中缓存
        parallelTasks.push(Promise.resolve({ type: 'autoPatches', result: cachedPatchesList }));
        console.log('[Image Route] All patches from cache');
      }
    } else {
      parallelTasks.push(Promise.resolve({ type: 'autoPatches', result: [] }));
    }

    // 任务3：细节识别（Detail Lock）
    // Preview 模式：跳过 analyze 以加速
    // Refine 模式：仅 high 执行（medium 完全跳过以提升速度）
    const shouldAnalyze = !isPreview && normalizedClothingImagesArr.length > 0 && fidelity === 'high';
    
    if (shouldAnalyze) {
      // 使用缓存
      if (normalizedClothingImagesArr.length > 0) {
        const cacheKey = generateCacheKey(normalizedClothingImagesArr[0]); // 使用第一张图片作为 key
        const cached = clothingDetailsCache.get(cacheKey);
        
        if (cached) {
          parallelTasks.push(Promise.resolve({ type: 'clothingDetails', result: cached }));
          console.log('[Image Route] Clothing details from cache');
        } else {
          parallelTasks.push(
            analyzeClothingDetails(normalizedClothingImagesArr)
              .then(details => {
                clothingDetailsCache.set(cacheKey, details);
                return { type: 'clothingDetails', result: details };
              })
              .catch(err => ({ type: 'clothingDetails', error: err }))
          );
        }
      } else {
        parallelTasks.push(Promise.resolve({ type: 'clothingDetails', result: undefined }));
      }
    } else {
      parallelTasks.push(Promise.resolve({ type: 'clothingDetails', result: undefined }));
    }

    // 并行执行所有任务
    const results = await Promise.allSettled(parallelTasks);
    
    // 处理结果
    for (const result of results) {
      if (result.status === 'fulfilled') {
        const taskResult = result.value;
        if (taskResult.type === 'userDetailPatches') {
          if (taskResult.error) {
            console.warn('[Image Route] Failed to process user detail crops:', taskResult.error);
          } else {
            userDetailPatches = taskResult.result || [];
            console.log(`[Image Route] Generated ${userDetailPatches.length} user detail patches`);
          }
        } else if (taskResult.type === 'autoPatches') {
          if (taskResult.error) {
            console.warn('[Image Route] Failed to generate auto patches:', taskResult.error);
          } else {
            clothingPatches = taskResult.result || [];
            console.log(`[Image Route] Generated ${clothingPatches.length} auto patches`);
          }
        } else if (taskResult.type === 'clothingDetails') {
          if (taskResult.error) {
            console.warn('[Image Route] Failed to analyze clothing details:', taskResult.error);
          } else {
            clothingDetails = taskResult.result;
            if (clothingDetails) {
              console.log('[Image Route] Clothing details analyzed:', JSON.stringify(clothingDetails).substring(0, 200));
            }
          }
        }
      }
    }

    // 步骤5：构建完整 prompt（包含 DETAIL LOCK，使用标准化后的图片）
    const enhancedPrompt = buildFullPrompt({
      prompt,
      bodyRefImage: normalizedBodyRefImage,
      clothingImages: normalizedClothingImagesArr,
      faceImages: normalizedFaceImages,
      clothingDetails,
    });

    // 步骤6：构建统一的图片输入数组（关键：所有图片统一到 image 字段，使用标准化后的图片）
    // Preview 模式：使用预算制算法选择输入图（<=5张，支持多件衣物）
    // Refine 模式：使用完整优化策略
    let imageInputs: string[];
    
    if (isPreview) {
      // Preview 模式：使用新的预算制算法，支持多件衣物（<=5张）
      console.log(`[Image Route] Preview mode: using budget-based algorithm for ${normalizedClothingImagesArr.length} clothing items`);
      imageInputs = await buildPreviewImageInputs({
        clothingImages: normalizedClothingImagesArr,
        clothingCategories,
        normalizedClothingDetailCrops: normalizedClothingDetailCrops || [],
        bodyRefImage: normalizedBodyRefImage,
        includeBodyRef: includeBodyRefInPreview,
        autoPatches: clothingPatches,
      });
    } else {
      // Refine 模式：使用原有的优化策略
      let targetMaxImages: number;
      let optimizedClothingImages = normalizedClothingImagesArr;
      
      if (userDetailPatches.length > 0) {
      // Refine 模式：有 userDetailPatches 时，进一步优化
      if (fidelity === 'medium') {
        targetMaxImages = 3; // medium 下更激进：尽量 <= 3 张（detail patch + 1 张衣物整图 + bodyRef 可选）
        // 只保留第一张衣物整图
        if (optimizedClothingImages.length > 1) {
          optimizedClothingImages = [optimizedClothingImages[0]];
          console.log(`[Image Route] Medium mode with userDetailPatches: limiting to 1 clothing image to keep total <= 3`);
        }
        // 如果有 bodyRefImage，考虑是否跳过以进一步减少
        // 但为了保持身材比例，暂时保留 bodyRefImage
      } else if (fidelity === 'high') {
        targetMaxImages = 5; // high 下更激进：尽量 <= 5 张
      } else {
        targetMaxImages = maxTotalImages;
      }
    } else {
      // Refine 模式：没有 userDetailPatches 时，使用更激进的策略
        targetMaxImages = fidelity === 'medium' ? 3 : (fidelity === 'high' ? 5 : maxTotalImages);
      }
      
      imageInputs = buildImageInputArray({
        clothingImages: optimizedClothingImages,
        clothingPatches,
        userDetailPatches,
        bodyRefImage: normalizedBodyRefImage,
        faceImages: normalizedFaceImages || [],
        maxTotalImages: targetMaxImages,
      });
    }

    console.log(`[Image Route] Total image inputs: ${imageInputs.length} (${userDetailPatches.length} user detail patches + ${clothingPatches.length} auto patches + ${normalizedClothingImagesArr.length} clothing + ${normalizedBodyRefImage ? 1 : 0} body + ${normalizedFaceImages?.length || 0} face)`);

    // 验证所有图片输入都是有效的 data URL
    for (let i = 0; i < imageInputs.length; i++) {
      const img = imageInputs[i];
      if (!img || typeof img !== 'string') {
        console.error(`[Image Route] Invalid image at index ${i}: not a string`);
        return res.status(400).json({ error: `Invalid image format at index ${i}` });
      }
      if (!img.startsWith('data:image/')) {
        console.error(`[Image Route] Invalid image at index ${i}: not a data URL, starts with: ${img.substring(0, 20)}`);
        return res.status(400).json({ error: `Invalid image format at index ${i}: must be a data URL` });
      }
      if (!img.includes(';base64,')) {
        console.error(`[Image Route] Invalid image at index ${i}: missing base64 separator`);
        return res.status(400).json({ error: `Invalid image format at index ${i}: must include base64 data` });
      }
      // 验证 base64 数据部分不为空
      const base64Part = img.split(',')[1];
      if (!base64Part || base64Part.length < 100) {
        console.error(`[Image Route] Invalid image at index ${i}: base64 data too short or empty`);
        return res.status(400).json({ error: `Invalid image format at index ${i}: base64 data is empty or too short` });
      }
    }

    // 步骤7：构建 Ark API 请求体（使用正确的字段名）
    // Preview 模式使用 effectiveFidelity (low)，Refine 模式使用原始 fidelity
    const requestBody = buildArkImagePayload({
      model,
      prompt: enhancedPrompt,
      imageInputs,
      fidelity: effectiveFidelity,
      n,
    });

    console.log(`[Image Route] Mode: ${mode}, Using model: ${model}, fidelity: ${effectiveFidelity} (requested: ${fidelity}), hasImages: ${hasImages}`);
    console.log(`[Image Route] Request body keys:`, Object.keys(requestBody));
    console.log(`[Image Route] Image inputs preview:`, imageInputs.map(img => ({
      format: img.substring(5, img.indexOf(';')),
      length: img.length,
      preview: img.substring(0, 50) + '...'
    })));

    // 步骤8：调用 Ark API
    console.log(`[Image Route] Calling Ark API with model: ${model}, imageInputs count: ${imageInputs.length}`);
    const authHeaders = getAuthHeader(apiKey);
    const response = await fetch(`${baseUrl}/images/generations`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    console.log(`[Image Route] Ark API response status: ${response.status}, text length: ${responseText.length}`);
    
    let responseData: any;

    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('[Image Route] Failed to parse Ark API response as JSON:', responseText.substring(0, 500));
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Ark API error: ${responseText.substring(0, 200)}`,
          status: response.status,
          raw: responseText
        });
      }
      return res.status(500).json({
        error: 'Invalid JSON response from Ark API',
        raw: responseText
      });
    }

    if (!response.ok) {
      console.error('[Image Route] Ark API error:', responseData);
      return res.status(response.status).json({
        error: responseData.error?.message || responseText || 'Ark API error',
        status: response.status,
        raw: responseData
      });
    }

    // 提取图片 URL 或 base64
    // Ark API 可能返回 data 数组，每个元素包含 url 或 b64_json
    const images = responseData.data || [];
    if (images.length === 0) {
      return res.status(500).json({
        error: 'No image generated',
        raw: responseData
      });
    }

    // 取第一张图片
    const firstImage = images[0];
    let imageUrl: string;

    if (firstImage.b64_json) {
      // 如果是 base64，添加 data URI 前缀
      imageUrl = `data:image/png;base64,${firstImage.b64_json}`;
    } else if (firstImage.url) {
      // 如果是 URL，直接使用
      imageUrl = firstImage.url;
    } else {
      return res.status(500).json({
        error: 'Invalid image response format',
        raw: responseData
      });
    }

    res.json({
      image: imageUrl,
      raw: responseData,
      metadata: {
        mode,
        model,
        fidelity: effectiveFidelity,
        requestedFidelity: fidelity,
        hasClothingDetails: !!clothingDetails,
        userDetailPatchCount: userDetailPatches.length,
        autoPatchCount: clothingPatches.length,
        totalImageInputs: imageInputs.length
      }
    });

  } catch (error: any) {
    console.error('[Image Route Error]', error);
    next(error);
  }
});

export default router;

