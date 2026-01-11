/**
 * 衣物细节分析服务
 * 使用 doubao-seed-1-8-251228 进行视觉理解，输出结构化 JSON
 */

import dotenv from 'dotenv';
import { getAuthHeader } from '../utils/auth.js';

dotenv.config();

export interface ClothingDetails {
  garments: Array<{
    category?: string;
    dominant_colors?: string[];
    pattern?: string;
    material?: string;
    logos?: Array<{
      text?: string;
      position?: string;
      color?: string;
    }>;
    hardware?: string[];
    unique_details?: string[];
  }>;
}

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
 * 分析衣物图片的细节，返回结构化 JSON
 * @param clothingImages - 衣物图片的 data URL 数组
 * @returns Promise<ClothingDetails> - 结构化细节数据
 */
export async function analyzeClothingDetails(
  clothingImages: string[]
): Promise<ClothingDetails> {
  const apiKey = process.env.ARK_API_KEY;
  const baseUrl = process.env.ARK_BASE_URL;
  // 使用 doubao-seed-1-8-251228 进行视觉理解
  const model = process.env.ARK_CHAT_MODEL || 'doubao-seed-1-8-251228';

  if (!apiKey || !baseUrl) {
    throw new Error('ARK_API_KEY or ARK_BASE_URL is missing');
  }

  // 构建多模态消息（支持多图输入）
  const imageContents = clothingImages.slice(0, 4).map((imgUrl) => ({
    type: 'image_url' as const,
    image_url: {
      url: imgUrl.includes('data:') ? imgUrl : `data:image/png;base64,${extractBase64(imgUrl)}`
    }
  }));

  const promptText = `Analyze these clothing images and extract ONLY the most critical details for accurate reproduction. Return ONLY valid JSON (no markdown, no code blocks, no extra text) in this exact format:

{
  "garments": [
    {
      "category": "shirt/t-shirt/jacket/pants/shoes/etc",
      "dominant_colors": ["color1", "color2"],
      "pattern": "solid/stripes/plaid/floral/etc",
      "material": "cotton/denim/wool/etc",
      "logos": [
        {
          "text": "exact logo text if visible",
          "position": "left chest/right sleeve/back/etc",
          "color": "text color"
        }
      ],
      "hardware": ["button type", "zipper type", "etc"],
      "unique_details": ["detail1", "detail2"]
    }
  ]
}

Focus on: logo text (if any), logo position, pattern type and spacing, dominant colors (max 2), material, hardware/buttons.
Ignore minor decorative elements. Output ONLY the JSON object. No explanations, no markdown, no code blocks.`;

  const requestBody = {
    model,
    messages: [
      {
        role: 'user',
        content: [
          ...imageContents,
          {
            type: 'text' as const,
            text: promptText
          }
        ]
      }
    ],
    temperature: 0.1 // 低温度以获得更一致的结果
  };

  try {
    const authHeaders = getAuthHeader(apiKey);
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...authHeaders
      },
      body: JSON.stringify(requestBody)
    });

    const responseText = await response.text();
    let responseData: any;

    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      if (!response.ok) {
        throw new Error(`Ark API error: ${responseText}`);
      }
      throw new Error('Invalid JSON response from Ark API');
    }

    if (!response.ok) {
      throw new Error(responseData.error?.message || responseText || 'Ark API error');
    }

    // 提取文本内容
    const text = responseData.choices?.[0]?.message?.content || '';

    // 尝试解析 JSON
    let result: ClothingDetails;
    try {
      // 尝试直接解析
      result = JSON.parse(text);
    } catch (parseError) {
      // 如果失败，尝试提取 JSON 块（去除 markdown 代码块）
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
        } catch (e) {
          // 如果还是失败，返回默认结构
          console.warn('[AnalyzeService] Failed to parse JSON, using fallback');
          result = { garments: [] };
        }
      } else {
        result = { garments: [] };
      }
    }

    // 验证结果结构
    if (!result.garments || !Array.isArray(result.garments)) {
      result = { garments: [] };
    }

    return result;
  } catch (error: any) {
    console.error('[AnalyzeService Error]', error);
    // 返回默认结构而不是抛出错误，允许降级处理
    return { garments: [] };
  }
}


