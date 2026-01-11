# 故障排查指南

## 401 Unauthorized - API Key Format Incorrect

### 问题描述
错误信息：`The API key format is incorrect`

### 可能原因

1. **API Key 格式问题**
   - API Key 包含多余的空格或换行符
   - API Key 格式不符合火山引擎要求

2. **认证方式不正确**
   - 使用了错误的 Authorization header 格式
   - 火山引擎可能不需要 "Bearer" 前缀

3. **API Key 无效**
   - API Key 已过期
   - API Key 没有访问权限
   - API Key 复制不完整

### 解决步骤

#### 步骤 1：检查 .env 文件

确认 `server/.env` 文件存在且包含正确的配置：

```bash
cd server
cat .env
```

应该看到：
```
ARK_API_KEY=your_api_key_here
ARK_BASE_URL=https://ark.cn-beijing.volces.com/api/v3
ARK_CHAT_MODEL=your_chat_model_id
ARK_IMAGE_MODEL=your_image_model_id
```

#### 步骤 2：清理 API Key

确保 API Key 没有多余的空格或换行符：

```bash
# 在 .env 文件中，确保 ARK_API_KEY 在同一行，没有换行
# 例如：
ARK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

**不要写成：**
```
ARK_API_KEY=sk-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
（后面有换行或空格）
```

#### 步骤 3：尝试不同的认证方式

代码已支持多种认证格式，可以通过环境变量切换：

**方式 1：直接使用 API Key（默认，推荐）**
```env
ARK_AUTH_TYPE=direct
ARK_API_KEY=your_api_key
```

**方式 2：使用 Bearer 前缀**
```env
ARK_AUTH_TYPE=bearer
ARK_API_KEY=your_api_key
```

**方式 3：使用 X-API-Key header**
```env
ARK_AUTH_TYPE=x-api-key
ARK_API_KEY=your_api_key
```

#### 步骤 4：验证 API Key 格式

根据火山引擎文档，API Key 通常：
- 以 `sk-` 开头（或其他特定前缀）
- 长度通常在 32-64 字符之间
- 不包含空格

检查你的 API Key：
```bash
# 查看 API Key 长度（不包含引号）
echo -n "your_api_key" | wc -c

# 查看 API Key 是否包含空格
echo "your_api_key" | grep -q " " && echo "包含空格" || echo "不包含空格"
```

#### 步骤 5：检查火山引擎控制台

1. 登录火山引擎控制台
2. 进入 Ark API 管理页面
3. 确认：
   - API Key 状态为"启用"
   - API Key 有足够的配额
   - API Key 有访问对应模型的权限

#### 步骤 6：测试 API Key

使用 curl 直接测试：

```bash
# 方式 1：直接使用 API Key（不带 Bearer）
curl -X POST https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: your_api_key_here" \
  -d '{
    "model": "your_model_id",
    "messages": [{"role": "user", "content": "Hello"}]
  }'

# 方式 2：使用 Bearer 前缀
curl -X POST https://ark.cn-beijing.volces.com/api/v3/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer your_api_key_here" \
  -d '{
    "model": "your_model_id",
    "messages": [{"role": "user", "content": "Hello"}]
  }'
```

根据哪种方式成功，在 `.env` 文件中设置对应的 `ARK_AUTH_TYPE`。

#### 步骤 7：重启后端服务器

修改 `.env` 后，需要重启后端服务器：

```bash
# 停止当前服务器（Ctrl+C）
# 然后重新启动
cd server
npm run dev
```

### 常见错误示例

#### 错误 1：API Key 包含换行符
```
ARK_API_KEY=sk-xxxxxxxxxxxxx
（这里有一个换行符）
```

**解决：** 确保 API Key 在同一行，没有换行

#### 错误 2：API Key 前后有空格
```
ARK_API_KEY= sk-xxxxxxxxxxxxx 
```

**解决：** 去除前后空格

#### 错误 3：使用了错误的认证方式
如果火山引擎要求使用 Bearer 前缀，但代码使用了直接 API Key

**解决：** 设置 `ARK_AUTH_TYPE=bearer`

### 调试技巧

1. **查看后端日志**
   后端服务器会输出详细的错误信息，查看终端输出

2. **检查网络请求**
   在浏览器开发者工具的 Network 面板中查看：
   - 请求 URL
   - 请求 Headers（特别是 Authorization）
   - 响应状态码和错误信息

3. **添加调试日志**
   如果需要，可以在 `server/src/routes/chat.ts` 中添加：
   ```typescript
   console.log('API Key length:', apiKey.length);
   console.log('API Key first 10 chars:', apiKey.substring(0, 10));
   console.log('Auth headers:', getAuthHeader(apiKey));
   ```

### 仍然无法解决？

1. 查看火山引擎 Ark API 官方文档
2. 确认 API Key 和模型 ID 是否正确
3. 检查网络连接和防火墙设置
4. 联系火山引擎技术支持

