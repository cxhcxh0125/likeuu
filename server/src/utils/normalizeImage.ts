/**
 * 图片格式标准化工具
 * 将 HEIC/HEIF 等格式转换为 JPEG，确保所有下游处理都能正常工作
 */

import sharp from 'sharp';

/**
 * 解析 data URL，提取 mime type 和 buffer
 */
export function parseDataUrl(dataUrl: string): { mime: string; buffer: Buffer } {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid data URL: must be a non-empty string');
  }

  // 格式：data:[<mediatype>][;base64],<data>
  const match = dataUrl.match(/^data:([^;]+)(;base64)?,(.+)$/);
  if (!match) {
    throw new Error('Invalid data URL format');
  }

  const mime = match[1].toLowerCase();
  const base64Data = match[3];
  const buffer = Buffer.from(base64Data, 'base64');

  return { mime, buffer };
}

/**
 * 将 buffer 转换为 data URL
 */
export function toDataUrl(mime: string, buffer: Buffer): string {
  return `data:${mime};base64,${buffer.toString('base64')}`;
}

/**
 * 检查 sharp 是否支持 HEIF/HEIC
 * 注意：sharp.format() 在当前版本中不可调用，改为直接尝试转换
 */
async function checkSharpHeifSupport(): Promise<boolean> {
  // 不再通过 sharp.format() 检查，改为直接尝试转换
  // 如果转换失败，会抛出错误，由调用方处理
  return false; // 默认返回 false，直接使用 heic-convert
}

/**
 * 使用 sharp 转换 HEIF/HEIC 到 JPEG
 */
async function convertHeifWithSharp(buffer: Buffer): Promise<Buffer> {
  try {
    const jpegBuffer = await sharp(buffer)
      .jpeg({ quality: 90, mozjpeg: true })
      .toBuffer();
    return jpegBuffer;
  } catch (error: any) {
    // 如果 sharp 不支持，尝试使用 heic-convert 作为兜底
    throw new Error(`Sharp HEIF conversion failed: ${error.message}`);
  }
}

/**
 * 使用 heic-convert 作为兜底方案转换 HEIF/HEIC
 */
async function convertHeifWithFallback(buffer: Buffer): Promise<Buffer> {
  try {
    // 动态导入 heic-convert（如果可用）
    const heicConvertModule = await import('heic-convert').catch(() => null);
    if (!heicConvertModule) {
      throw new Error('heic-convert package not available. Please install: npm install heic-convert');
    }

    // heic-convert 的 API：convert({ buffer, format: 'JPEG', quality: 0.9 })
    // quality 是 0-1 之间的值，0.9 对应 90% 质量
    const convert = (heicConvertModule as any).default || heicConvertModule;
    const jpegBuffer = await convert({
      buffer,
      format: 'JPEG',
      quality: 0.9  // 0-1 之间，0.9 = 90% 质量
    });

    // heic-convert 返回的是 Buffer 或 Uint8Array
    if (Buffer.isBuffer(jpegBuffer)) {
      return jpegBuffer;
    } else if (jpegBuffer instanceof Uint8Array) {
      return Buffer.from(jpegBuffer);
    } else {
      return Buffer.from(jpegBuffer);
    }
  } catch (error: any) {
    throw new Error(`HEIC conversion failed: ${error.message}`);
  }
}

/**
 * 将 data URL 标准化为 JPEG data URL
 * 支持输入：image/heic, image/heif, image/jpeg, image/jpg, image/png, image/webp
 * 输出：image/jpeg (可配置 quality 和 maxDim)
 * 
 * @param dataUrl - 输入的 data URL
 * @param opts - 可选参数
 *   - maxDim: 最大尺寸（最长边），如果提供则 resize
 *   - quality: JPEG 质量 (1-100)，默认 85
 * @returns Promise<string> - 标准化的 JPEG data URL
 * @throws Error - 如果格式不支持或转换失败
 */
export async function normalizeDataUrlToJpeg(
  dataUrl: string,
  opts?: { maxDim?: number; quality?: number }
): Promise<string> {
  if (!dataUrl || typeof dataUrl !== 'string') {
    throw new Error('Invalid data URL: must be a non-empty string');
  }

  const { mime, buffer } = parseDataUrl(dataUrl);
  const quality = opts?.quality ?? 85;
  const maxDim = opts?.maxDim;

  // 支持的输入格式
  const supportedMimes = [
    'image/heic',
    'image/heif',
    'image/jpeg',
    'image/jpg',
    'image/png',
    'image/webp'
  ];

  if (!supportedMimes.includes(mime)) {
    throw new Error(`Unsupported image format: ${mime}. Supported formats: ${supportedMimes.join(', ')}`);
  }

  // 统一的处理函数：resize（如果需要）+ 转换为 JPEG
  const processToJpeg = async (inputBuffer: Buffer): Promise<Buffer> => {
    let processed = sharp(inputBuffer);
    
    // 如果需要 resize
    if (maxDim) {
      processed = processed.resize(maxDim, maxDim, {
        fit: 'inside',
        withoutEnlargement: true
      });
    }
    
    // 转换为 JPEG
    return processed
      .jpeg({ quality, mozjpeg: true })
      .toBuffer();
  };

  // 如果已经是 JPEG
  if (mime === 'image/jpeg' || mime === 'image/jpg') {
    try {
      // 如果需要 resize 或重新压缩，则处理
      if (maxDim || quality !== 90) {
        const jpegBuffer = await processToJpeg(buffer);
        return toDataUrl('image/jpeg', jpegBuffer);
      }
      // 否则验证 buffer 是否有效
      await sharp(buffer).jpeg().toBuffer();
      return dataUrl; // 原样返回
    } catch {
      // 如果 buffer 损坏，重新编码
      const jpegBuffer = await processToJpeg(buffer);
      return toDataUrl('image/jpeg', jpegBuffer);
    }
  }

  // PNG/WebP 转 JPEG
  if (mime === 'image/png' || mime === 'image/webp') {
    try {
      const jpegBuffer = await processToJpeg(buffer);
      const result = toDataUrl('image/jpeg', jpegBuffer);
      // 验证输出格式
      if (!result.startsWith('data:image/jpeg;base64,')) {
        throw new Error('Invalid output format from PNG/WebP conversion');
      }
      return result;
    } catch (error: any) {
      throw new Error(`Failed to convert ${mime} to JPEG: ${error.message}`);
    }
  }

  // HEIC/HEIF 转 JPEG
  if (mime === 'image/heic' || mime === 'image/heif') {
    console.log(`[NormalizeImage] Converting ${mime} to JPEG...`);
    
    try {
      // 直接使用 heic-convert 转换
      let jpegBuffer = await convertHeifWithFallback(buffer);
      console.log(`[NormalizeImage] Successfully converted ${mime} to JPEG using heic-convert`);

      // HEIC 转换后，如果需要 resize，再次处理
      if (maxDim) {
        jpegBuffer = await sharp(jpegBuffer)
          .resize(maxDim, maxDim, {
            fit: 'inside',
            withoutEnlargement: true
          })
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      } else if (quality !== 90) {
        // 如果只需要调整质量，重新编码
        jpegBuffer = await sharp(jpegBuffer)
          .jpeg({ quality, mozjpeg: true })
          .toBuffer();
      }

      const result = toDataUrl('image/jpeg', jpegBuffer);
      // 验证输出格式
      if (!result.startsWith('data:image/jpeg;base64,')) {
        throw new Error('Invalid output format from HEIC conversion');
      }
      return result;
    } catch (error: any) {
      console.error(`[NormalizeImage] HEIC conversion failed:`, error);
      throw new Error(`HEIC 转换失败，请改用 JPG/PNG: ${error.message}`);
    }
  }

  // 理论上不会到达这里
  throw new Error(`Unexpected mime type: ${mime}`);
}

/**
 * 批量标准化多个 data URLs
 * @param dataUrls - data URL 数组
 * @param opts - 可选参数（同 normalizeDataUrlToJpeg）
 * @returns Promise<string[]> - 标准化后的 JPEG data URL 数组
 */
export async function normalizeDataUrlsToJpeg(
  dataUrls: string[],
  opts?: { maxDim?: number; quality?: number }
): Promise<string[]> {
  return Promise.all(dataUrls.map(url => normalizeDataUrlToJpeg(url, opts)));
}

