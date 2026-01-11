import express from 'express';
import dotenv from 'dotenv';
import { getAuthHeader } from '../utils/auth.js';

dotenv.config();

const router = express.Router();

interface ChatRequest {
  messages: Array<{ role: string; content: string }>;
  system?: string;
  temperature?: number;
}

/**
 * POST /api/chat
 * 转发文本对话请求到 Ark API
 */
router.post('/', async (req, res, next) => {
  try {
    const { messages, system, temperature = 0.7 }: ChatRequest = req.body;

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return res.status(400).json({ error: 'messages is required and must be a non-empty array' });
    }

    const apiKey = process.env.ARK_API_KEY;
    const baseUrl = process.env.ARK_BASE_URL;
    const model = process.env.ARK_CHAT_MODEL;

    if (!apiKey || !baseUrl || !model) {
      const missing = [];
      if (!apiKey) missing.push('ARK_API_KEY');
      if (!baseUrl) missing.push('ARK_BASE_URL');
      if (!model) missing.push('ARK_CHAT_MODEL');
      return res.status(500).json({ 
        error: `Server configuration error: Missing ${missing.join(', ')}. Please check your .env file.` 
      });
    }

    // 构建请求体
    const requestBody: any = {
      model,
      messages: messages.map(msg => ({
        role: msg.role,
        content: msg.content
      })),
      temperature: temperature
    };

    // 如果有 system 指令，添加到 messages 开头
    if (system) {
      requestBody.messages.unshift({
        role: 'system',
        content: system
      });
    }

    // 调用 Ark API
    let authHeaders: Record<string, string>;
    try {
      authHeaders = getAuthHeader(apiKey);
    } catch (authError: any) {
      console.error('[Chat Route] Auth header error:', authError.message);
      return res.status(500).json({
        error: `Authentication setup error: ${authError.message}`
      });
    }
    
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
      // 如果响应不是 JSON，返回原始文本
      if (!response.ok) {
        return res.status(response.status).json({
          error: `Ark API error: ${responseText}`,
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
      // 401 错误通常是认证问题
      if (response.status === 401) {
        console.error('[Chat Route] 401 Unauthorized - API Key authentication failed');
        console.error('[Chat Route] Auth type:', process.env.ARK_AUTH_TYPE || 'bearer');
        console.error('[Chat Route] API Key length:', apiKey.length);
        console.error('[Chat Route] API Key prefix:', apiKey.substring(0, 10) + '...');
        return res.status(401).json({
          error: 'Authentication failed: Invalid or missing API key. Please check your ARK_API_KEY in .env file. If the issue persists, try setting ARK_AUTH_TYPE to "direct" or "x-api-key".',
          status: 401,
          hint: 'Try: ARK_AUTH_TYPE=direct or ARK_AUTH_TYPE=x-api-key in your .env file',
          raw: responseData
        });
      }
      
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

    res.json({
      text,
      raw: responseData
    });

  } catch (error: any) {
    console.error('[Chat Route Error]', error);
    next(error);
  }
});

export default router;

