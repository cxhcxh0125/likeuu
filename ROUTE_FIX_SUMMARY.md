# 路由问题修复总结

## 问题描述

线上环境 `/api/health` 返回 200，但 `/api/chat` 无论 GET 还是 POST 都返回 404（Express 404 handler）。

## 问题排查

### 1. 路由配置检查

**后端路由配置：**
- `server/src/routes/chat.ts`: `router.post('/', ...)` - 路由路径为 `/`
- `server/src/index.ts`: `app.use('/api/chat', chatRouter)` - 挂载在 `/api/chat`
- **实际完整路径**：`POST /api/chat/` 或 `POST /api/chat`

**前端调用：**
- `services/geminiService.ts`: `fetch('/api/chat', { method: 'POST', ... })`
- 路径和方法：✅ 正确

### 2. 代码编译

- 重新编译了后端代码（修复了 TypeScript 编译问题）
- 验证了编译后的代码正确性

### 3. 路由测试

**测试结果：**
```bash
# 测试 1: POST /api/chat/（带尾随斜杠）
curl -X POST "http://localhost:8787/api/chat/" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
# ✅ 返回 200，正常工作

# 测试 2: POST /api/chat（不带斜杠）
curl -X POST "http://localhost:8787/api/chat" \
  -H "Content-Type: application/json" \
  -d '{"messages":[{"role":"user","content":"Hello"}]}'
# ✅ 返回 200，正常工作

# 测试 3: GET /api/chat
curl -X GET "http://localhost:8787/api/chat"
# ✅ 返回 404（预期，因为没有 GET 路由）
```

## 结论

✅ **路由配置完全正确！**

- Express 路由正常工作
- 带或不带尾随斜杠的路径都能匹配
- 前端调用 `POST /api/chat` 应该能正常工作

## 可能的原因

如果之前返回 404，可能的原因：
1. 服务器使用的是旧版本的编译代码
2. 服务器没有正确重启
3. 路由注册顺序问题（但代码中顺序正确）

## 解决方案

如果线上环境仍然返回 404，请执行：

1. **重新编译并部署：**
   ```bash
   cd server
   npm run build
   # 将 dist/ 目录部署到服务器
   ```

2. **重启服务：**
   ```bash
   pm2 restart likeuu-server
   # 或
   pm2 reload likeuu-server
   ```

3. **验证路由：**
   ```bash
   curl -X POST "http://your-domain/api/chat" \
     -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"Hello"}]}'
   ```

## 验证脚本

使用提供的验证脚本测试：

```bash
./verify_chat_api.sh http://localhost:8787
# 或
./verify_chat_api.sh https://your-domain.com
```

## 相关文件

- `server/src/routes/chat.ts` - 路由定义
- `server/src/index.ts` - 路由挂载
- `services/geminiService.ts` - 前端调用
- `ROUTE_VERIFICATION.md` - 详细验证文档
- `verify_chat_api.sh` - 自动化测试脚本
