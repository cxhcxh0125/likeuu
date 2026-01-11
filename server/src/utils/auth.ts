/**
 * 认证工具函数
 * 处理火山引擎 Ark API 的认证格式
 */

/**
 * 清理 API Key：去除首尾空格、换行符等
 */
export function cleanApiKey(apiKey: string): string {
  return apiKey.trim().replace(/\n/g, '').replace(/\r/g, '').replace(/\s+/g, '');
}

/**
 * 获取认证 Header
 * 根据配置返回正确的 Authorization header
 * 火山引擎 Ark API 支持多种认证方式
 */
export function getAuthHeader(apiKey: string): Record<string, string> {
  if (!apiKey) {
    throw new Error('API Key is required but was not provided');
  }
  
  const cleanedKey = cleanApiKey(apiKey);
  
  if (!cleanedKey) {
    throw new Error('API Key is empty after cleaning');
  }
  
  // 火山引擎 Ark API 可能使用以下格式之一：
  // 1. Bearer Token: Authorization: Bearer <token>
  // 2. API Key: Authorization: <api_key>
  // 3. X-API-Key header: X-API-Key: <api_key>
  
  // 默认尝试 Bearer 格式（这是最常见的格式）
  // 如果这种方式不行，可以通过环境变量 ARK_AUTH_TYPE 切换
  const authType = process.env.ARK_AUTH_TYPE || 'bearer';
  
  switch (authType) {
    case 'bearer':
      return { 'Authorization': `Bearer ${cleanedKey}` };
    case 'api-key':
    case 'direct':
      return { 'Authorization': cleanedKey };
    case 'x-api-key':
      return { 'X-API-Key': cleanedKey };
    default:
      // 默认使用 Bearer 格式
      return { 'Authorization': `Bearer ${cleanedKey}` };
  }
}

