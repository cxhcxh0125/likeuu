/**
 * Prompt 构建工具
 * 根据输入参数生成包含 BODY/CLOTHING/FACE/DETAIL LOCK 的完整 prompt
 */

import { ClothingDetails } from '../services/analyzeService.js';

export interface PromptBuilderOptions {
  prompt: string;
  bodyRefImage?: string;
  clothingImages?: string[];
  faceImages?: string[];
  clothingDetails?: ClothingDetails;
}

/**
 * 构建完整的图片生成 prompt（中文版本，强化细节还原）
 * 包含优先级分组：BODY > CLOTHING > FACE
 * 使用中文 prompt 以提高对中文模型的准确性
 */
export function buildFullPrompt(options: PromptBuilderOptions): string {
  const { prompt, bodyRefImage, clothingImages, faceImages, clothingDetails } = options;

  // 基础描述：单人物、全身、中性站立姿势、真实照片、自然光
  let fullPrompt = `一张真人全身时尚穿搭照片。单人全身，中性站立姿势，真实照片风格，自然光线。${prompt}`;

  // 强制说明：必须使用参考图
  if (clothingImages && clothingImages.length > 0) {
    fullPrompt += '\n\n【重要】提供的参考图片必须用于保持衣物细节。必须严格按照参考图片还原。';
  }

  // BODY reference（优先级最高）
  if (bodyRefImage) {
    fullPrompt += '\n\n=== 身材参考 ===';
    fullPrompt += '\n严格按照身材参考图保持身材比例和体型。';
    fullPrompt += '\n保持身体比例与身材参考图一致。';
  }

  // CLOTHING references（衣物细节优先级高）- 强化约束
  if (clothingImages && clothingImages.length > 0) {
    fullPrompt += '\n\n=== 衣物参考 ===';
    fullPrompt += '\n严格按照参考图片保持衣物的颜色、图案、logo、材质、纽扣、缝线等所有细节完全一致。';
    fullPrompt += '\n【禁止重新设计衣物】。禁止修改或添加参考图片中不存在的元素。';
    fullPrompt += '\n必须保持 logo 文字完全一致，不得更改或移除。';
    fullPrompt += '\n必须保持图案间距和样式完全一致。';
    fullPrompt += '\n必须保持纽扣和缝线细节完全一致。';
  }

  // FACE references（身份相似度，优先级低于 body & clothing）
  if (faceImages && faceImages.length > 0) {
    fullPrompt += '\n\n=== 面部参考 ===';
    fullPrompt += '\n保持面部相似度，同时确保衣物准确性为最高优先级。';
  }

  // DETAIL LOCK（从细节识别结果生成）- 短而硬的 6-8 条 bullet
  if (clothingDetails && clothingDetails.garments && clothingDetails.garments.length > 0) {
    fullPrompt += '\n\nDETAIL LOCK (strict):';
    
    const lockItems: string[] = [];
    
    clothingDetails.garments.forEach((garment) => {
      // 1. Logo 文本（最高优先级）
      if (garment.logos && garment.logos.length > 0) {
        garment.logos.forEach((logo) => {
          if (logo.text) {
            const position = logo.position ? ` at ${logo.position}` : '';
            lockItems.push(`Logo text: "${logo.text}"${position}`);
          }
        });
      }
      
      // 2. Logo 位置
      if (garment.logos && garment.logos.length > 0) {
        garment.logos.forEach((logo) => {
          const pos = logo.position;
          if (pos && !lockItems.some(item => item.includes(pos))) {
            lockItems.push(`Logo position: ${pos}`);
          }
        });
      }
      
      // 3. 图案类型与间距
      if (garment.pattern) {
        lockItems.push(`Pattern: ${garment.pattern} (exact spacing)`);
      }
      
      // 4. 主要颜色（最多2个）
      if (garment.dominant_colors && garment.dominant_colors.length > 0) {
        const colors = garment.dominant_colors.slice(0, 2).join(', ');
        lockItems.push(`Colors: ${colors}`);
      }
      
      // 5. 材质
      if (garment.material) {
        lockItems.push(`Material: ${garment.material}`);
      }
      
      // 6. 硬件/纽扣
      if (garment.hardware && garment.hardware.length > 0) {
        lockItems.push(`Hardware: ${garment.hardware.join(', ')}`);
      }
    });
    
    // 限制为最多 8 条，优先保留最重要的
    const finalLockItems = lockItems.slice(0, 8);
    finalLockItems.forEach(item => {
      fullPrompt += `\n- ${item}`;
    });
  }

  // 禁止项（硬约束）
  fullPrompt += '\n\nDo NOT change logo text.';
  fullPrompt += '\nDo NOT alter stripe/pattern spacing.';
  fullPrompt += '\nDo NOT redesign garment cuts.';
  fullPrompt += '\nNo color hue shift.';

  return fullPrompt;
}

