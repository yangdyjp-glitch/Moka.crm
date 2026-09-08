# Railway 项目合并 Handoff

> 本文件只用于将两个 Railway **项目**整理为一个项目。它不是数据库迁移方案，也不要求修改前端、后端或业务数据。

## 1. 合并目标

把当前两个 Railway 项目：

- `ty-CRM`：承载前端服务
- `ty-CRM-P`：承载后端服务

整理为一个 Railway 项目，最终结构为：

```text
ty-CRM
├─ frontend   Root Directory: /frontend
└─ backend    Root Directory: /backend
```

两个服务仍然独立构建、独立运行。此次“合并”只改变 Railway 中的项目归属和管理方式，不把前后端合并成同一个进程。

## 2. 当前线上结构

核对日期：2026-09-07。

| 项目 | 项目 ID | 环境 ID | 服务 ID | 用途 | 公网域名 |
|---|---|---|---|---|---|
| `ty-CRM` | `64fa1086-34cc-4830-8826-7ff7839717ac` | `f8d8e72d-74ee-4fe7-ba36-1a22395ed42b` | `494f445a-b0aa-48e0-a0dc-eaa49a15338d` | 前端 | `https://tycrm.up.railway.app` |
| `ty-CRM-P` | `33a726a5-dd17-46ec-81d7-1bf4a74a7e34` | `45297c1a-b125-40e3-8a50-b39a7f0c9eba` | `5f3f3f03-e889-4868-9a7a-52c71c96d8e2` | 后端 | `https://tycrm-production.up.railway.app` |

共同配置：

- GitHub 仓库：`yangdyjp-glitch/ty.crm`
- 部署分支：`main`
- 区域：Southeast Asia（Singapore）
- 推送到 `main` 后自动部署

## 3. 既定合并策略

保留 `ty-CRM-P` 项目及其中现有后端服务不动，在该项目中增加一个与当前线上配置一致的前端服务。新前端验证完成后，再退役原 `ty-CRM` 项目。最后可将保留下来的项目从 `ty-CRM-P` 重命名为 `ty-CRM`。

选择保留后端所在项目，是为了让现有后端域名、环境变量、部署历史和运行状态保持不变。不要反向在前端项目里重建后端。

Railway 官方没有文档化的“跨项目原地移动服务”操作，因此应采用“在目标项目创建等价服务、验证、切换、再清理旧项目”的方式完成项目合并。

## 4. 范围边界

本次允许：

- 在 `ty-CRM-P` 的 `production` 环境增加一个前端服务。
- 复制当前前端服务的 Railway 配置。
- 为新前端生成临时公网域名并进行验证。
- 验证成功后切换前端访问入口。
- 观察期结束后停用并删除旧 `ty-CRM` 项目。
- 最后重命名保留的 Railway 项目。

本次禁止：

- 修改或迁移数据库。
- 修改 Prisma Schema 或执行业务数据脚本。
- 重建、删除或替换现有后端服务。
- 更换后端公网 API 域名。
- 修改 `DATABASE_URL`、`DIRECT_URL`、`JWT_SECRET` 等后端密钥。
- 把后端密钥共享给前端服务。
- 为了合并项目而修改 CRM 业务代码。

## 5. 执行前检查

- [ ] 确认两个现有服务均为 `Online`，最新部署成功。
- [ ] 记录当前成功部署的 Git commit。
- [ ] 截图保存两个服务的 Source、Variables、Networking、Build、Deploy、Region 设置。
- [ ] 确认前端 Root Directory 是 `/frontend`。
- [ ] 确认后端 Root Directory 是 `/backend`。
- [ ] 确认后端健康检查 `https://tycrm-production.up.railway.app/api/health` 正常。
- [ ] 确认当前前端可以登录并正常读取数据。
- [ ] 合并操作窗口内暂停不相关的 `main` 推送，避免同时触发部署。
- [ ] 不在任何文档、日志或提交中记录明文密钥。

## 6. 在目标项目增加前端服务

目标项目：当前的 `ty-CRM-P`。

1. 在其 `production` 环境中新建服务，建议命名为 `frontend`。
2. 连接 GitHub 仓库 `yangdyjp-glitch/ty.crm`。
3. 选择分支 `main`，开启 GitHub 自动部署。
4. 设置 Root Directory 为 `/frontend`。
5. 确认构建命令为：

   ```text
   npm run build
   ```

6. 确认启动命令为：

   ```text
   npx serve -s dist -l $PORT
   ```

7. 设置前端构建变量：

   ```text
   VITE_API_BASE=https://tycrm-production.up.railway.app/api
   ```

8. 区域保持 Southeast Asia（Singapore），副本数保持 1。
9. 生成一个临时 Railway 公网域名。
10. 完成首次部署，确认部署状态为 `Deployment successful`。

注意：`VITE_API_BASE` 是 Vite 构建时写入的变量，新增或修改后必须重新构建前端。浏览器不能访问 `*.railway.internal`，因此这里必须继续使用后端公网 HTTPS 地址。

Railway 当前已经弃用旧式 Config as Code。创建新服务时不要只假设 `/frontend/railway.json` 会自动生效，必须在 Railway 页面核对 Root、Build、Start 和变量的实际值。

## 7. 新前端验证

在临时域名上完成以下检查：

- [ ] 首页正常打开，静态资源没有 404。
- [ ] 页面刷新及详情页直接访问不出现路由 404。
- [ ] 管理员可以正常登录。
- [ ] 仪表盘、客户、订单、收款、退款、返佣和报表能够读取数据。
- [ ] 浏览器请求实际指向 `https://tycrm-production.up.railway.app/api`。
- [ ] 没有 CORS、混合内容或持续 401 错误。
- [ ] 后端服务在整个验证过程中保持原服务、原域名和 `Online` 状态。
- [ ] 新前端部署日志没有持续报错。

除非专门获得授权，不要为了验证创建、修改或删除真实业务数据。

## 8. 前端入口切换

当前前端使用 Railway 自动域名 `tycrm.up.railway.app`。不要假设该自动域名可以跨服务无损转移。

推荐处理顺序：

1. 先用新前端临时域名完成全部验证。
2. 如果存在自定义域名，将自定义域名从旧前端解绑后绑定到新前端。
3. 如果只使用 Railway 自动域名：
   - 在确认回滚入口可用后，再处理旧域名；
   - 尝试在旧服务释放域名后，将新服务域名改为 `tycrm`；
   - 如果该名称不能立即重新使用，则保留新域名并更新书签和入口说明。
4. 域名变化会让浏览器中的本地登录状态失效，用户可能需要重新登录。

后端域名 `tycrm-production.up.railway.app` 在此过程中保持不变。

## 9. 观察期与旧项目退役

- [ ] 新前端切换后观察 24–48 小时。
- [ ] 观察登录、页面加载、接口错误和部署日志。
- [ ] 先关闭旧前端的 GitHub 自动部署，避免重复构建。
- [ ] 在删除前再次确认旧 `ty-CRM` 中只有待退役的前端服务。
- [ ] 确认旧项目没有独有的自定义域名、变量或 Volume。
- [ ] 获得用户最终确认后，删除旧 `ty-CRM` 项目。
- [ ] 将保留的 `ty-CRM-P` 项目重命名为 `ty-CRM`。
- [ ] 更新 `CLAUDE.md`、`CODEX.md` 中的部署说明为“一个 Railway 项目、两个服务”。

删除旧项目属于不可逆操作，必须在观察期结束并再次获得用户确认后执行。

## 10. 回滚方案

在旧项目尚未删除时，回滚只涉及前端入口：

1. 恢复使用旧前端 `https://tycrm.up.railway.app`。
2. 如果切换了自定义域名，将其重新绑定到旧前端服务。
3. 暂停新前端的自动部署，保留现场和部署日志。
4. 后端及数据库始终不动，不需要做数据回滚。

出现以下任一情况立即回滚：

- 无法登录或出现持续 401。
- 多个核心页面无法读取数据。
- 前端路由或静态资源持续 404。
- 出现 CORS 或 HTTPS 混合内容错误。
- 新前端持续部署失败或频繁重启。

## 11. 最终验收标准

- [ ] Railway 中只保留一个 CRM 项目。
- [ ] 该项目的 `production` 环境包含 `frontend` 和现有后端两个独立服务。
- [ ] 前后端均为 `Online`，最新部署成功。
- [ ] 后端服务、API 域名和密钥未发生变化。
- [ ] 前端入口、登录和核心页面正常。
- [ ] 推送 `main` 后仍可正常自动部署。
- [ ] 旧项目已在观察期后安全退役。
- [ ] 项目文档已更新，且没有提交任何密钥。

## 12. 官方参考

- Railway Projects：https://docs.railway.com/projects
- Railway Monorepo：https://docs.railway.com/deployments/monorepo
- Railway Variables：https://docs.railway.com/variables
- Railway Private Networking：https://docs.railway.com/networking/private-networking
- Railway Services：https://docs.railway.com/services
- Railway Config as Code：https://docs.railway.com/config-as-code
