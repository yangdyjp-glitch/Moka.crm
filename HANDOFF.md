# Moka CRM 修复交接

更新日期：2026-09-07。

交接目的：供另一个开发程序从当前 Moka 代码继续复核和修复。本文记录已完成工作、可复现的遗留问题与验证方法；请先确认现状，再修改。

## 1. 仓库和操作范围

- 本地仓库：`D:\AI\Moka-CRM`。
- 目标仓库：`https://github.com/yangdyjp-glitch/Moka.crm`。
- 当前分支：`main`，跟踪 `origin/main`。
- `origin` 的拉取和推送地址：`https://github.com/yangdyjp-glitch/Moka.crm.git`。
- `upstream` 的拉取地址：`https://github.com/yangdyjp-glitch/ty.crm.git`。
- `upstream` 的推送地址：`DISABLED`。

Moka.crm 和 ty.crm 是两个独立仓库；本次工作对象是 **Moka.crm 的 main 分支**。用户明确要求：除非用户提出，不得恢复 upstream 推送，也不得通过直接 URL、其他 remote 或重新配置来向 ty.crm 推送。不要操作 TY 的线上服务和数据库。

开始前在仓库根目录检查：

```powershell
Set-Location D:\AI\Moka-CRM
git status --short --branch
git remote -v
git log -5 --oneline
```

保护已有未提交改动。若需要同步，只从已确认的 `origin` 同步，不强制覆盖本地工作区。

## 2. 当前代码基线

最近一次代码修复提交已推送到 Moka：

- `35424ca2c1c9b9c2c2f0d0ad6a246fc08d8769de`：前端类型、加载逻辑、缓存与 lint 清理，新增回归测试。
- `3fddb018ac4205910cd93f3cb9b0f3fbabe33ff0`：绿色品牌主题改为粉紫色与金色。
- `3ab2b90509f3d7cd765517085605fd42aba0a73c`：从 TY 复制过来的原始基线。

编写本文前，本地与 `origin/main` 一致、工作区干净。本文后续可能作为单独文档提交，因此接手时 HEAD 可以晚于上述代码提交。

查看最近修复的完整差异：

```powershell
git show --stat 35424ca
git diff 3fddb01 35424ca -- frontend CODEX.md
```

## 3. 已完成：不要重复当作待修复问题

此前 108 项前端 lint 问题已经解决：

| 原检查项 | 数量 | 当前处理 |
| --- | ---: | --- |
| 显式 `any` | 91 | 补充接口、表单、表格和错误对象类型 |
| Effect 内同步设置状态 | 13 | 重构请求加载与刷新逻辑 |
| Hooks 依赖警告 | 2 | 补齐依赖并稳定加载函数 |
| 不规则空白 | 1 | 保留原显示效果，改为明确字符串 |
| 热更新导出规则 | 1 | 拆分认证 Provider 与 Context |

没有关闭 ESLint 规则，没有用 `eslint-disable` 或定时器规避这些报错；`npm run lint` 已增加 `--max-warnings=0`。

主要实现位置：

- `frontend/src/api/models.ts`、`customerTypes.ts`、`financeTypes.ts`、`reportTypes.ts`：接口消费端类型。修改字段前对照后端 DTO、service 返回值与 Prisma schema。
- `frontend/src/api/options.ts`：有返回类型的选项加载函数。
- `frontend/src/api/errors.ts`：从 `unknown` 异常提取服务器错误消息，兼容字符串和验证消息数组。
- `frontend/src/hooks/useRemoteData.ts`：公共异步加载；加载函数通过模块作用域或 `useCallback` 保持稳定；切换查询时清除旧查询数据显示，忽略过期请求和卸载后的结果；同一查询刷新时保留当前数据。
- `frontend/src/api/cache.ts`：通过 Axios adapter 实现 GET 缓存，TTL 30 分钟；`noCache`、blob 请求绕过；成功写操作清空缓存；旧 GET 在写操作之后返回时不能重新填入旧缓存；缓存保存独立原始响应快照。
- `frontend/src/api/client.ts`：鉴权拦截器、缓存接入与下载函数。
- `frontend/src/auth/AuthContext.ts`：认证类型、Context、`useAuth`。
- `frontend/src/auth/AuthProvider.tsx`：登录和代理登录的会话管理组件；`main.tsx` 已更新 Provider 引用。
- 客户、渠道、订单、收退款、分成、产品、用户、报表、仪表盘、日志等页面已接入上述类型与相应加载逻辑。

本次没有修改后端业务、Prisma schema 或数据库。

文档路径提示：`CODEX.md` 约 210 行仍引用旧的 `frontend/src/auth/AuthContext.tsx`；该文件已拆分为上面的 `AuthContext.ts` 和 `AuthProvider.tsx`，接手时按实际代码定位。

## 4. 已完成的验证及其边界

代码提交前的结果：

- `npm.cmd run lint`：0 错误、0 警告。
- `npm.cmd test`：27 项测试全部通过。
- `npm.cmd run build`：TypeScript 检查和 Vite 生产构建通过。
- `node test/smoke.mjs`：18 个页面／角色场景通过。
- `git diff --check`：通过。

单元及组件级回归覆盖：首次加载、筛选快速切换、过期请求、刷新与重试、卸载、StrictMode、缓存命中与到期、成功／失败写操作、响应转换与数据隔离、错误信息提取。

模拟页面检查运行的是实际构建产物，使用临时本地接口与测试会话，覆盖登录页、五种角色的仪表盘、主要业务页面，以及订单字符串金额回填、数字保存请求和保存后重新读取。

这些验证 **不包含** 真实账号登录、真实后端权限、真实数据库金额结算、线上部署验收或视觉布局检查。不得将模拟检查通过等同于线上全流程已验证。

## 5. 接手后要做的事

### A. 复现检查并审查本次重构

先按第 6 节复跑检查，再审查 `35424ca`。重点看表单字段是否与后端一致、金额字符串与数字的转换、筛选和路由切换、保存后刷新、缓存与登录会话切换。若发现具体回归，补充能复现问题的测试后修复。

不要仅为了让 lint 通过而降低规则、重新引入 `any` 或改变业务权限。

### B. 已确认遗留问题：已到账收款删除入口与后端冲突

静态证据（行号以代码基线 `35424ca` 为参考）：

- `frontend/src/pages/Payments.tsx` 约 208–210 行：管理员在 `confirmStatus === 'CONFIRMED'` 时仍看到删除按钮，确认文案声称删除会回退订单已收金额。
- `backend/src/payments/payments.service.ts` 约 165–172 行：`remove()` 明确拒绝已确认收款，返回“已确认的收款不允许删除”。

复现方向：使用隔离测试环境或模拟接口，以管理员查看一条已确认收款并点击删除；前端给出可以删除并回退金额的提示，但接口会拒绝。此问题是清理时发现的原有不一致，本次没有修复，也没有通过生产数据执行删除。

建议按现有后端规则修复前端：移除或禁用已确认收款的删除入口，并让说明文案一致；未确认收款的删除行为继续保留。补测管理员与普通销售、已确认与未确认状态，确认已确认记录不会发起删除请求。

如果业务真正需要“撤销已确认收款”，先让用户明确确认规则，再设计余额、分成、退款关联与审计处理；不能简单移除后端校验来配合现有按钮。

### C. 依赖与构建报告：待复核，不是 lint 尚未修好

- 最近安装依赖时 npm 报告 10 项安全告警（1 中等、9 高）；尚未逐项分析依赖路径、运行时可达性或升级方案。接手时用 `npm.cmd audit` 获取最新报告，区分直接／间接、开发／生产依赖后再确定修复范围，避免未经验证地执行强制升级。
- Vite 仍有单个 JS 构建块超过 500 kB 的提示。它不阻塞构建，也不属于这 108 项 lint 问题。需要性能优化时另行评估按页面拆包，不必将其混入第一轮业务修复。

### D. 真实环境验证与部署

根目录 `CODEX.md` 和 `CLAUDE.md` 保留了复制前的 TY 部署背景。TY 的 Railway API 地址不能直接当成 Moka 的部署目标，也不能据此连接 TY 数据库。

当前尚未确认 Moka 的独立前后端部署、环境变量与数据库配置。若任务需要真实接口测试或上线，先确认目标属于 Moka，使用隔离测试数据；缺失的连接配置由用户提供，不猜测，不在日志、交接文件或提交中暴露密钥。

## 6. 本地验证步骤

项目运行环境：Node 22。本机验证版本为 `22.22.3`；测试与工具链建议 Node 22.12 或以上。

在 Windows PowerShell 中使用 `npm.cmd`，避免执行策略拦截：

```powershell
Set-Location D:\AI\Moka-CRM\frontend
npm.cmd ci
npm.cmd run lint
npm.cmd test
npm.cmd run build
node test/smoke.mjs
```

每条命令成功后再继续下一条。模拟页面检查依赖最新 `dist`，源码改变后先重新构建。

测试说明见 `frontend/test/README.md`。新增 `jsdom` 仅为开发测试依赖；生产运行依赖未作版本升级。

如果后续实际修改了后端，再检查 `backend/package.json` 并运行受影响的后端检查；涉及 Prisma 类型时先生成客户端。不要为本次前端复核直接执行数据库同步或生产数据写入。

## 7. 保持的业务与界面约束

- 人民币 CNY 与日元 JPY 分开统计，不跨币种相加或自动折算。
- Prisma Decimal 返回前端可能是字符串；数字输入框回填保留 `Number(...)` 转换。
- 订单、收款、退款、分成与软删除规则以当前后端实现及用户确认的规则为准。
- 保持五种角色的数据范围与代理登录限制，不通过隐藏按钮替代后端权限校验。
- 保留粉紫色 `#a64d8e`、淡粉紫背景 `#f8eef6` 和金色主题；收款绿色、退款红色等业务语义颜色保留。
- 不提交 `.env`、令牌、真实客户数据、`node_modules` 或构建产物。
- Git 从仓库根目录执行，只提交本任务文件；推送目标明确写成 `git push origin main`，并确认 `upstream` 仍为 `DISABLED`。

## 8. 完成后交付

说明具体修复了什么、对应复现条件、测试结果和仍未验证的部分，给出提交号。前端 lint 维持零错误和零警告，现有 27 项回归及本地模拟页面检查继续通过。

把新发现、已修复、未解决的问题分别记录，避免将已经清理的 108 项重新列为未完成。只对已验证的 Moka 目标提交或部署；TY 的推送限制持续有效。
