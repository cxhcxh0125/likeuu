/**
 * 调用后端 API 进行文本对话
 * 后端会转发到 Ark API
 */
export const chatWithGemini = async (messages: { role: string; content: string }[], systemInstruction: string) => {
  try {
    const response = await fetch('/api/chat', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        messages,
        system: systemInstruction,
        temperature: 0.7
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error("[Chat API Error]", errorData);
      if (response.status === 429 || errorData.error?.includes('429')) {
        throw new Error("429: Quota exhausted. Please wait or use a paid key.");
      }
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.text || '';
  } catch (error: any) {
    console.error("[Chat API Error]", error);
    throw error;
  }
};

/**
 * 调用后端 API 生成时尚图片
 * 后端会转发到 Ark API (即梦/Seedream)
 * 支持多参考图输入和保真度控制
 */
import { ClothingDetailCrop } from '../types';

export interface GenerateImageOptions {
  prompt: string;
  mode?: "preview" | "refine"; // NEW：生成模式，默认 preview
  clothingImages?: string[];  // 衣物参考图（data URL 数组）
  clothingCategories?: string[];  // NEW: 衣物类别数组（与 clothingImages 按顺序对应），用于优先级排序
  clothingDetailCrops?: ClothingDetailCrop[];  // 用户圈选的细节区域
  bodyRefImage?: string;      // 可选：用户全身参考图
  includeBodyRefInPreview?: boolean;  // NEW: Preview 模式是否包含 bodyRef（默认 false）
  faceImages?: string[];      // 可选：人脸参考图
  fidelity?: 'low' | 'medium' | 'high'; // 保真度参数（refine 时使用）
  n?: number;
}

export const generateFashionImage = async (
  prompt: string | GenerateImageOptions,
  referenceImages?: string[]
): Promise<string> => {
  // 兼容旧接口：如果第一个参数是字符串，则使用旧格式
  let options: GenerateImageOptions;
  if (typeof prompt === 'string') {
    options = {
      prompt: referenceImages && referenceImages.length > 0
        ? `Generate a high-quality fashion photograph. The scene: ${prompt}. Natural lighting, high fashion style.`
        : `Generate a high-quality fashion photograph. The scene: ${prompt}. Natural lighting, high fashion style.`,
      clothingImages: referenceImages,
      fidelity: 'medium',
      n: 1
    };
  } else {
    options = {
      ...prompt,
      mode: prompt.mode || 'preview', // 默认 preview 模式
      fidelity: prompt.fidelity || 'medium',
      n: prompt.n || 1
    };
  }

  try {
    const response = await fetch('/api/image', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(options)
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error("[Image Gen Error]", errorData);
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();
    return data.image || '';
  } catch (error: any) {
    console.error("[Image Gen Error]", error);
    throw error;
  }
};

/**
 * 调用后端 API 分析服装图片
 * 后端会转发到 Ark API（需要模型支持多模态）
 */
export const analyzeClothing = async (base64Image: string) => {
  try {
    const response = await fetch('/api/analyze', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        imageBase64: base64Image
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({ error: 'Unknown error' }));
      console.error("[Vision Error]", errorData);
      // 返回默认值而不是抛出错误，防止批量上传崩溃
      return { name: "Unknown Clothing", category: "General", tags: [] };
    }

    const data = await response.json();
    
    // 确保返回格式一致
    return {
      name: data.name || "Unknown Clothing",
      category: data.category || "General",
      tags: Array.isArray(data.tags) ? data.tags : []
    };
  } catch (error) {
    console.error("[Vision Error]", error);
    // Return a default object instead of throwing to prevent batch upload crashes
    return { name: "Unknown Clothing", category: "General", tags: [] };
  }
};
