/**
 * 用户圈选细节区域的裁剪和放大工具
 * 将用户圈选的矩形区域裁剪并放大为固定尺寸的 detail patch
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
 * 裁剪并放大用户圈选的细节区域
 * @param dataUrl - 原图的 data URL
 * @param rect - 圈选的矩形区域（原图像素坐标）
 * @param targetSize - 目标尺寸（默认 768x768）
 * @param paddingPercent - 四周 padding 百分比（默认 10%，避免裁得太死）
 * @returns Promise<string> - 放大后的 detail patch 的 data URL
 */
export async function cropAndMagnifyPatch(
  dataUrl: string,
  rect: { x: number; y: number; w: number; h: number },
  targetSize: number = 640,  // 从 768 降为 640 以提升速度
  paddingPercent: number = 10
): Promise<string> {
  try {
    const base64Data = extractBase64(dataUrl);
    const imageBuffer = Buffer.from(base64Data, 'base64');
    
    // 加载图片并获取元数据
    const image = sharp(imageBuffer);
    const metadata = await image.metadata();
    const imgWidth = metadata.width || 1024;
    const imgHeight = metadata.height || 1024;
    
    // 边界 clamp：确保 rect 不越界
    let x = Math.max(0, Math.floor(rect.x));
    let y = Math.max(0, Math.floor(rect.y));
    let w = Math.max(32, Math.min(Math.floor(rect.w), imgWidth - x)); // 最小 32px
    let h = Math.max(32, Math.min(Math.floor(rect.h), imgHeight - y)); // 最小 32px
    
    // 添加 padding（在四周各加 10%，但不超过图片边界）
    const paddingX = Math.floor(w * paddingPercent / 100);
    const paddingY = Math.floor(h * paddingPercent / 100);
    
    x = Math.max(0, x - paddingX);
    y = Math.max(0, y - paddingY);
    w = Math.min(imgWidth - x, w + paddingX * 2);
    h = Math.min(imgHeight - y, h + paddingY * 2);
    
    // 裁剪区域
    const croppedBuffer = await image
      .extract({
        left: x,
        top: y,
        width: w,
        height: h,
      })
      .toBuffer();
    
    // 放大到目标尺寸（保持宽高比，使用 contain + padding）
    // 使用 JPEG 格式和较低质量以提升速度
    const magnifiedBuffer = await sharp(croppedBuffer)
      .resize(targetSize, targetSize, {
        fit: 'contain',
        background: { r: 255, g: 255, b: 255, alpha: 1 } // 白色背景填充
      })
      .jpeg({ quality: 85, mozjpeg: true })  // 从 PNG 改为 JPEG，quality 85
      .toBuffer();
    
    // 转换为 data URL（JPEG 格式）
    return `data:image/jpeg;base64,${magnifiedBuffer.toString('base64')}`;
  } catch (error: any) {
    console.error('[CropPatch Error]', error);
    // 降级处理：如果裁剪失败，返回空字符串（调用方会跳过）
    throw new Error(`Failed to crop patch: ${error.message}`);
  }
}

/**
 * 批量处理多个 detail crops
 * @param crops - 用户圈选的细节区域数组
 * @param targetSize - 目标尺寸（默认 640x640，进一步优化速度）
 * @returns Promise<string[]> - detail patches 的 data URL 数组
 */
export async function processDetailCrops(
  crops: Array<{ imageDataUrl: string; rect: { x: number; y: number; w: number; h: number } }>,
  targetSize: number = 640  // 从 768 降为 640 以提升速度
): Promise<string[]> {
  const patches: string[] = [];
  
  // 并行处理所有 crops
  const results = await Promise.allSettled(
    crops.map(crop => cropAndMagnifyPatch(crop.imageDataUrl, crop.rect, targetSize))
  );
  
  // 收集成功的结果
  for (const result of results) {
    if (result.status === 'fulfilled') {
      patches.push(result.value);
    } else {
      console.warn('[CropPatch] Failed to process one crop, skipping:', result.reason);
    }
  }
  
  return patches;
}

