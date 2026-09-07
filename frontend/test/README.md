# 前端回归检查

在 `frontend` 目录使用项目要求的 Node 22（22.12 或更高版本）：

```text
npm ci
npm run lint
npm test
npm run build
node test/smoke.mjs
```

`lint` 对错误和警告都执行零容忍检查，未关闭原有规则。

`npm test` 使用模拟请求和 JSDOM 验证：

- 数据首次加载、筛选快速切换、旧请求返回、请求失败与重试。
- 保存后刷新、离开页面及 React StrictMode 下的请求清理。
- GET 缓存、过期、跳过缓存、成功写入失效、失败写入和并发请求。
- Axios 响应转换与缓存数据隔离、错误消息解析。

`smoke.mjs` 在本机模拟接口上执行构建产物的页面检查。所有数据均为测试数据，不访问真实业务后端或数据库；该检查不替代线上实际账户与业务流程验收。
