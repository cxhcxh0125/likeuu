
export interface ClothingItem {
  id: string;
  name: string;
  imageUrl: string;
  category: string;
  tags: string[];
}

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

export interface Recommendation {
  id: string;
  title: string;
  subtitle: string;
  imageUrl: string;
}

export interface SavedLook {
  id: string;
  imageUrl: string;
  timestamp: number;
  occasion: string;
  itemsUsed: string[];
}

/**
 * 用户手动圈选的细节区域（相对于原图像素坐标）
 */
export interface CropRect {
  x: number;  // 左上角 x 坐标（像素）
  y: number;  // 左上角 y 坐标（像素）
  w: number;  // 宽度（像素）
  h: number;  // 高度（像素）
}

/**
 * 衣物细节圈选数据
 */
export interface ClothingDetailCrop {
  imageDataUrl: string;  // 原图的 data URL
  rect: CropRect;        // 圈选的矩形区域
}
