import express from 'express';
import dotenv from 'dotenv';
import { getAuthHeader } from '../utils/auth.js';
import { normalizeDataUrlToJpeg } from '../utils/normalizeImage.js';

dotenv.config();

const router = express.Router();

interface AnalyzeRequest {
  imageBase64: string;
}

/**
 * POST /api/analyze
 * 分析图片（多模态文本模型）
 * 仅当文本模型支持多模态时使用
 */
router.post('/', async (req, res, next) => {
  try {
    const { imageBase64 }: AnalyzeRequest = req.body;

    if (!imageBase64 || typeof imageBase64 !== 'string') {
      return res.status(400).json({ error: 'imageBase64 is required and must be a string' });
    }

    const apiKey = process.env.ARK_API_KEY;
    const baseUrl = process.env.ARK_BASE_URL;
    const model = process.env.ARK_CHAT_MODEL; // 使用文本模型（如果支持多模态）

    if (!apiKey || !baseUrl || !model) {
      return res.status(500).json({ 
        error: 'Server configuration error: ARK_API_KEY, ARK_BASE_URL, or ARK_CHAT_MODEL is missing' 
      });
    }

    // 标准化图片格式（HEIC/HEIF -> JPEG）
    // 如果 normalize 失败，降级使用原图（而不是直接返回错误）
    let normalizedImageBase64: string = imageBase64;
    try {
      // 如果已经是完整的 data URL，直接 normalize
      if (imageBase64.startsWith('data:')) {
        normalizedImageBase64 = await normalizeDataUrlToJpeg(imageBase64);
        console.log(`[Analyze Route] Normalized image to JPEG`);
      } else {
        // 如果是纯 base64，先构造 data URL
        const tempDataUrl = `data:image/png;base64,${imageBase64}`;
        normalizedImageBase64 = await normalizeDataUrlToJpeg(tempDataUrl);
        console.log(`[Analyze Route] Normalized image to JPEG`);
      }
    } catch (normalizeError: any) {
      console.warn('[Analyze Route] Image normalization failed, using original image:', normalizeError.message);
      // 降级处理：如果 normalize 失败，继续使用原图
      // 只对 HEIC 格式给出警告，其他格式可能已经是支持的格式
      if (normalizeError.message && normalizeError.message.includes('HEIC')) {
        console.warn('[Analyze Route] HEIC conversion failed, but continuing with original image');
      }
      // 不返回错误，继续处理
    }

    // 确保 normalizedImageBase64 是完整的 data URL
    if (!normalizedImageBase64.startsWith('data:')) {
      normalizedImageBase64 = `data:image/jpeg;base64,${normalizedImageBase64}`;
    }

    // 构建多模态消息
    const requestBody = {
      model,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image_url',
              image_url: {
                url: normalizedImageBase64  // 使用标准化后的 data URL（或原图）
              }
            },
            {
              type: 'text',
              text: 'Analyze this clothing. Return JSON only: {name, category, tags}.'
            }
          ]
        }
      ],
      temperature: 0.7
    };

    // 调用 Ark API
    console.log(`[Analyze Route] Calling Ark API with model: ${model}`);
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
    console.log(`[Analyze Route] Ark API response status: ${response.status}`);
    
    let responseData: any;

    try {
      responseData = JSON.parse(responseText);
    } catch (e) {
      console.error('[Analyze Route] Failed to parse Ark API response as JSON:', responseText.substring(0, 500));
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
      console.error('[Analyze Route] Ark API error:', responseData);
      return res.status(response.status).json({
        error: responseData.error?.message || responseText || 'Ark API error',
        status: response.status,
        raw: responseData
      });
    }

    // 提取文本内容
    const text = responseData.choices?.[0]?.message?.content || 
                 responseData.choices?.[0]?.text || 
                 '';
    
    console.log(`[Analyze Route] Ark API response text length: ${text.length}, preview: ${text.substring(0, 200)}`);

    // 尝试解析 JSON
    let result: any;
    try {
      result = JSON.parse(text);
      console.log(`[Analyze Route] Successfully parsed JSON:`, result);
    } catch (parseError) {
      console.warn('[Analyze Route] Failed to parse as JSON, trying to extract JSON block:', parseError);
      // 如果解析失败，尝试提取 JSON 块
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        try {
          result = JSON.parse(jsonMatch[0]);
          console.log(`[Analyze Route] Successfully extracted and parsed JSON:`, result);
        } catch (e) {
          console.error('[Analyze Route] Failed to parse extracted JSON:', e);
          // 如果还是失败，返回默认值
          result = { name: 'Unknown Clothing', category: 'General', tags: [] };
        }
      } else {
        console.error('[Analyze Route] No JSON block found in response text');
        result = { name: 'Unknown Clothing', category: 'General', tags: [] };
      }
    }

    // 确保返回格式正确
    const finalResult = {
      name: result.name || 'Unknown Clothing',
      category: result.category || 'General',
      tags: Array.isArray(result.tags) ? result.tags : []
    };
    
    console.log(`[Analyze Route] Final result:`, finalResult);

    res.json(finalResult);

  } catch (error: any) {
    console.error('[Analyze Route Error]', error);
    // 返回默认值而不是抛出错误，防止批量上传崩溃
    res.json({
      name: 'Unknown Clothing',
      category: 'General',
      tags: [],
      error: error.message
    });
  }
});

export default router;

