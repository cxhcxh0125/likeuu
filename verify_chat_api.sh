#!/bin/bash

# 验证 /api/chat 路由的 curl 命令
# 使用方法: ./verify_chat_api.sh [BASE_URL]
# 示例: ./verify_chat_api.sh http://localhost:8787
# 示例: ./verify_chat_api.sh https://your-domain.com

BASE_URL="${1:-http://localhost:8787}"

echo "========================================="
echo "路由验证脚本"
echo "目标服务器: $BASE_URL"
echo "========================================="
echo ""

echo "=== 1. 验证 /api/health (应该返回 200) ==="
curl -s -X GET "${BASE_URL}/api/health" -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "=== 2. 验证 POST /api/chat (不带斜杠，前端使用的路径，应该返回 200 或业务错误，不是 404) ==="
curl -s -X POST "${BASE_URL}/api/chat" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"}
    ],
    "system": "You are a helpful assistant.",
    "temperature": 0.7
  }' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "=== 3. 验证 POST /api/chat/ (带尾随斜杠，应该也能工作) ==="
curl -s -X POST "${BASE_URL}/api/chat/" \
  -H "Content-Type: application/json" \
  -d '{
    "messages": [
      {"role": "user", "content": "Hello"}
    ]
  }' \
  -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "=== 4. 验证 GET /api/chat (应该返回 404，因为没有 GET 路由) ==="
curl -s -X GET "${BASE_URL}/api/chat" -w "\nHTTP Status: %{http_code}\n"
echo ""

echo "========================================="
echo "验证完成"
echo "========================================="
