# 路由配置验证文档

## 路由配置总结

### 后端路由配置

1. **路由定义**：`server/src/routes/chat.ts`
   - `router.post('/', ...)` - 路由路径为 `/`

2. **路由挂载**：`server/src/index.ts` 和 `server/dist/index.js`
   - `app.use('/api/chat', chatRouter)` - 挂载在 `/api/chat`

3. **完整路径**：`POST /api/chat/` 或 `POST /api/chat`（Express 会自动处理尾随斜杠）

### 前端调用

- **文件**：`services/geminiService.ts`
- **调用**：`fetch('/api/chat', { method: 'POST', ... })`
- **路径和方法**：✅ 正确

## 验证结果

✅ **路由配置正确**：前端调用 `POST /api/chat` 应该能匹配后端路由 `POST /api/chat/`

### 实际测试结果

根据线上测试：
- ✅ `POST /api/chat/`（带尾随斜杠）- **工作正常** ✅
- ✅ `POST /api/chat`（不带斜杠）- **工作正常** ✅
- ✅ `GET /api/chat` - 返回 404（预期，因为没有 GET 路由）

**结论**：路由配置完全正确！Express 默认会匹配带或不带尾随斜杠的路径，前端调用 `POST /api/chat` 应该能正常工作。

## 部署检查清单

如果线上环境返回 404，请检查：

1. ✅ **编译代码**：确保 `server/dist/` 目录包含最新的编译代码
   ```bash
   cd server
   npm run build
   ```

2. ✅ **部署文件**：确保部署时包含 `dist/` 目录和所有依赖

3. ✅ **环境变量**：确保 `.env` 文件或环境变量正确配置

4. ✅ **服务器重启**：如果使用 PM2，重启服务
   ```bash
   pm2 restart likeuu-server
   # 或
   pm2 reload likeuu-server
   ```

5. ✅ **日志检查**：查看服务器日志，确认路由是否注册
   ```bash
   pm2 logs likeuu-server
   ```

## curl 验证命令

### 本地测试（如果后端在 localhost:8787）

```bash
# 1. 健康检查（应该返回 200）
curl -X GET "http://localhost:8787/api/health"

# 2. POST /api/chat（应该返回 200 或业务错误，不是 404）
curl -X POST "http://localhost:8787/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "system": "You are a helpful assistant.",
    "temperature": 0.7
  }'

# 3. POST /api/chat/（带尾随斜杠，应该也能工作）
curl -X POST "http://localhost:8787/api/chat/" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }'

# 4. GET /api/chat（应该返回 404，因为没有 GET 路由）
curl -X GET "http://localhost:8787/api/chat"
```

### 线上环境测试

将 `http://localhost:8787` 替换为你的线上域名，例如：

```bash
# 健康检查
curl -X GET "https://your-domain.com/api/health"

# POST /api/chat
curl -X POST "https://your-domain.com/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "system": "You are a helpful assistant.",
    "temperature": 0.7
  }'
```

## 预期响应

### 成功响应（200 OK）
```json
{
  "text": "回复内容",
  "raw": { ... }
}
```

### 404 响应（路由未找到）
```json
{
  "error": "Not found"
}
```

如果返回 404，说明路由没有正确注册，需要检查部署和重启服务。

### 400 响应（请求参数错误）
```json
{
  "error": "messages is required and must be a non-empty array"
}
```

### 500 响应（服务器配置错误）
```json
{
  "error": "Server configuration error: Missing ARK_API_KEY, ARK_BASE_URL, ARK_CHAT_MODEL. Please check your .env file."
}
```
