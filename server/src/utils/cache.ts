/**
 * 简单的内存缓存工具（LRU + TTL）
 * 用于缓存 analyzeClothingDetails 和 auto patches 的结果
 */

interface CacheEntry<T> {
  value: T;
  timestamp: number;
  ttl: number; // TTL in milliseconds
}

class SimpleCache<T> {
  private cache: Map<string, CacheEntry<T>>;
  private maxSize: number;
  private defaultTTL: number;

  constructor(maxSize: number = 100, defaultTTL: number = 24 * 60 * 60 * 1000) {
    this.cache = new Map();
    this.maxSize = maxSize;
    this.defaultTTL = defaultTTL; // 默认 24 小时
  }

  /**
   * 获取缓存值
   */
  get(key: string): T | null {
    const entry = this.cache.get(key);
    if (!entry) return null;

    // 检查是否过期
    const now = Date.now();
    if (now - entry.timestamp > entry.ttl) {
      this.cache.delete(key);
      return null;
    }

    // 更新访问顺序（LRU）：删除后重新插入
    this.cache.delete(key);
    this.cache.set(key, entry);
    return entry.value;
  }

  /**
   * 设置缓存值
   */
  set(key: string, value: T, ttl?: number): void {
    // 如果超过最大大小，删除最旧的条目（LRU）
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const firstKey = this.cache.keys().next().value;
      if (firstKey) {
        this.cache.delete(firstKey);
      }
    }

    this.cache.set(key, {
      value,
      timestamp: Date.now(),
      ttl: ttl || this.defaultTTL
    });
  }

  /**
   * 删除缓存
   */
  delete(key: string): void {
    this.cache.delete(key);
  }

  /**
   * 清空缓存
   */
  clear(): void {
    this.cache.clear();
  }

  /**
   * 清理过期条目
   */
  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
      }
    }
  }
}

// 创建全局缓存实例
export const clothingDetailsCache = new SimpleCache<any>(100, 24 * 60 * 60 * 1000); // 24小时
export const patchesCache = new SimpleCache<string[]>(100, 24 * 60 * 60 * 1000); // 24小时

/**
 * 生成缓存 key（使用 SHA256 hash）
 */
import { createHash } from 'crypto';

export function generateCacheKey(dataUrl: string): string {
  // 提取 base64 部分用于 hash
  const base64Data = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
  return createHash('sha256').update(base64Data).digest('hex');
}

/**
 * 定期清理过期缓存（每 1 小时执行一次）
 */
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    clothingDetailsCache.cleanup();
    patchesCache.cleanup();
  }, 60 * 60 * 1000); // 1 小时
}

