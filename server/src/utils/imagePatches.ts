/**
 * 图片局部放大工具
 * 为衣物参考图生成局部裁剪 patches，用于提升细节还原
 */

import sharp from 'sharp';

/**
 * 从 data URL 提取 base64 数据
 */
function extractBase64(dataUrl: string): string {
  if (dataUrl.includes(',')) {
    return dataUrl.split(',')[1];
  }
  return dataUrl;
}

/**
 * 生成图片的局部裁剪 patches
 * @param imageDataUrl - 图片的 data URL（如 data:image/png;base64,...）
 * @param patchCount - 需要生成的 patch 数量（1 或 2）
 * @returns Promise<string[]> - patches 的 data URL 数组
 */
export async function generateImagePatches(
  imageDataUrl: string,
  patchCount: number = 2
): Promise<string[]> {
  try {
    const base64Data = extractBase64(imageDataUrl);
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // 先 resize 到合理输入尺寸（最长边 1024，进一步优化速度）
    const resizedImage = await sharp(imageBuffer)
      .resize(1024, 1024, { 
        fit: 'inside',
        withoutEnlargement: true
      })
      .toBuffer();
    
    const image = sharp(resizedImage);

    // 获取图片元数据
    const metadata = await image.metadata();
    const width = metadata.width || 1024;
    const height = metadata.height || 1024;

    const patches: Buffer[] = [];

    // 1. 胸口区域 patch（logo/口袋/刺绣最常出现的位置）- 优先
    // 取高度 15%-55%、宽度 20%-80% 的裁剪
    if (patchCount >= 1) {
      const chestPatch = await image
        .extract({
          left: Math.floor(width * 0.2),
          top: Math.floor(height * 0.15),
          width: Math.floor(width * 0.6),
          height: Math.floor(height * 0.4),
        })
        .resize(640, 640, { fit: 'cover' })  // 从 768x768 进一步降为 640x640 以提升速度
        .jpeg({ quality: 85, mozjpeg: true })  // quality 从 90 降为 85 以减小体积
        .toBuffer();
      patches.push(chestPatch);
    }

    // 2. 中心裁剪 patch（捕获主要图案/logo）- 第二优先
    if (patchCount >= 2) {
      const centerPatch = await image
        .extract({
          left: Math.floor(width * 0.25),
          top: Math.floor(height * 0.25),
          width: Math.floor(width * 0.5),
          height: Math.floor(height * 0.5),
        })
        .resize(640, 640, { fit: 'cover' })  // 从 768x768 进一步降为 640x640
        .jpeg({ quality: 85, mozjpeg: true })  // quality 从 90 降为 85
        .toBuffer();
      patches.push(centerPatch);
    }

    // 转换为 data URL 数组（JPEG 格式）
    return patches.map((buffer) => `data:image/jpeg;base64,${buffer.toString('base64')}`);
  } catch (error: any) {
    console.error('[ImagePatches Error]', error);
    // 如果处理失败，返回空数组（降级处理）
    return [];
  }
}

/**
 * 批量生成多张图片的 patches（带并发控制）
 * @param imageDataUrls - 图片 data URL 数组
 * @param patchesPerImage - 每张图片生成几个 patch（1 或 2）
 * @param maxTotalPatches - 最大 patch 总数（防止超出模型限制）
 * @param maxConcurrency - 最大并发数（默认 2，避免 CPU 峰值）
 * @returns Promise<string[]> - 所有 patches 的 data URL 数组
 */
export async function generateMultipleImagePatches(
  imageDataUrls: string[],
  patchesPerImage: number = 2,
  maxTotalPatches: number = 8,
  maxConcurrency: number = 2
): Promise<string[]> {
  const allPatches: string[] = [];

  // 并发控制：将图片分批处理
  for (let i = 0; i < imageDataUrls.length; i += maxConcurrency) {
    if (allPatches.length >= maxTotalPatches) break;
    
    const batch = imageDataUrls.slice(i, i + maxConcurrency);
    const batchResults = await Promise.all(
      batch.map(async (imageUrl) => {
        if (allPatches.length >= maxTotalPatches) return [];
        const patches = await generateImagePatches(imageUrl, patchesPerImage);
        return patches;
      })
    );
    
    // 合并结果
    for (const patches of batchResults) {
      if (allPatches.length >= maxTotalPatches) break;
      const remaining = maxTotalPatches - allPatches.length;
      allPatches.push(...patches.slice(0, remaining));
    }
  }

  return allPatches;
}


