# TY 前端 108 项 lint 问题清单

依据 TY 原始提交 `3ab2b90509f3d7cd765517085605fd42aba0a73c` 的源码复跑确认（2026-09-07）：**106 个错误、2 个警告，共 108 项**。行列号对应此提交；TY 后续若有修改，以重新运行 lint 的结果为准。

## 分类汇总

| 问题 | ESLint 规则 | 数量 |
| --- | --- | ---: |
| 显式使用 `any` | `@typescript-eslint/no-explicit-any` | 91 |
| Effect 内同步更新状态 | `react-hooks/set-state-in-effect` | 13 |
| Hook 依赖缺失 | `react-hooks/exhaustive-deps` | 2 |
| 不规则空白字符 | `no-irregular-whitespace` | 1 |
| 组件与非组件混合导出 | `react-refresh/only-export-components` | 1 |

## 逐项清单

路径相对于仓库的 `frontend/` 目录；位置格式为 `文件:行:列`。

| 编号 | 位置 | 级别 | 问题 |
| ---: | --- | --- | --- |
| 1 | `src/api/client.ts:4:37` | 错误 | 显式使用 `any` |
| 2 | `src/api/options.ts:5:18` | 错误 | 显式使用 `any` |
| 3 | `src/api/options.ts:9:18` | 错误 | 显式使用 `any` |
| 4 | `src/api/options.ts:13:18` | 错误 | 显式使用 `any` |
| 5 | `src/api/options.ts:17:18` | 错误 | 显式使用 `any` |
| 6 | `src/auth/AuthContext.tsx:26:14` | 错误 | 组件与非组件混合导出 |
| 7 | `src/components/ImpersonationBanner.tsx:16:17` | 错误 | 显式使用 `any` |
| 8 | `src/components/NotificationBell.tsx:7:27` | 错误 | 显式使用 `any` |
| 9 | `src/pages/AuditLogs.tsx:7:27` | 错误 | 显式使用 `any` |
| 10 | `src/pages/AuditLogs.tsx:20:5` | 错误 | Effect 内同步更新状态 |
| 11 | `src/pages/AuditLogs.tsx:60:62` | 错误 | 显式使用 `any` |
| 12 | `src/pages/AuditLogs.tsx:61:63` | 错误 | 显式使用 `any` |
| 13 | `src/pages/Channels.tsx:29:27` | 错误 | 显式使用 `any` |
| 14 | `src/pages/Channels.tsx:56:50` | 错误 | 显式使用 `any` |
| 15 | `src/pages/Channels.tsx:62:66` | 错误 | 显式使用 `any` |
| 16 | `src/pages/Channels.tsx:64:21` | 错误 | Effect 内同步更新状态 |
| 17 | `src/pages/Channels.tsx:87:17` | 错误 | 显式使用 `any` |
| 18 | `src/pages/Channels.tsx:108:17` | 错误 | 显式使用 `any` |
| 19 | `src/pages/Channels.tsx:121:17` | 错误 | 显式使用 `any` |
| 20 | `src/pages/Channels.tsx:130:17` | 错误 | 显式使用 `any` |
| 21 | `src/pages/Channels.tsx:259:27` | 错误 | 显式使用 `any` |
| 22 | `src/pages/Commissions.tsx:14:27` | 错误 | 显式使用 `any` |
| 23 | `src/pages/Commissions.tsx:72:13` | 错误 | Effect 内同步更新状态 |
| 24 | `src/pages/Commissions.tsx:73:13` | 错误 | Effect 内同步更新状态 |
| 25 | `src/pages/Commissions.tsx:102:17` | 错误 | 显式使用 `any` |
| 26 | `src/pages/Commissions.tsx:176:31` | 错误 | 显式使用 `any` |
| 27 | `src/pages/Commissions.tsx:183:31` | 错误 | 显式使用 `any` |
| 28 | `src/pages/Commissions.tsx:191:31` | 错误 | 显式使用 `any` |
| 29 | `src/pages/Commissions.tsx:285:29` | 错误 | 显式使用 `any` |
| 30 | `src/pages/Commissions.tsx:292:29` | 错误 | 显式使用 `any` |
| 31 | `src/pages/Commissions.tsx:300:29` | 错误 | 显式使用 `any` |
| 32 | `src/pages/Commissions.tsx:308:29` | 错误 | 显式使用 `any` |
| 33 | `src/pages/CustomerDetail.tsx:37:27` | 错误 | 显式使用 `any` |
| 34 | `src/pages/CustomerDetail.tsx:56:6` | 警告 | Hook 依赖缺失：`load`、`loadAtt` |
| 35 | `src/pages/CustomerDetail.tsx:84:17` | 错误 | 显式使用 `any` |
| 36 | `src/pages/CustomerDetail.tsx:186:39` | 错误 | 显式使用 `any` |
| 37 | `src/pages/CustomerDetail.tsx:244:35` | 错误 | 显式使用 `any` |
| 38 | `src/pages/Customers.tsx:34:27` | 错误 | 显式使用 `any` |
| 39 | `src/pages/Customers.tsx:97:13` | 错误 | Effect 内同步更新状态 |
| 40 | `src/pages/Customers.tsx:117:17` | 错误 | 显式使用 `any` |
| 41 | `src/pages/Customers.tsx:146:17` | 错误 | 显式使用 `any` |
| 42 | `src/pages/Customers.tsx:185:17` | 错误 | 显式使用 `any` |
| 43 | `src/pages/Customers.tsx:198:17` | 错误 | 显式使用 `any` |
| 44 | `src/pages/Customers.tsx:244:25` | 错误 | 显式使用 `any` |
| 45 | `src/pages/Customers.tsx:245:19` | 错误 | 显式使用 `any` |
| 46 | `src/pages/Customers.tsx:256:25` | 错误 | 显式使用 `any` |
| 47 | `src/pages/Customers.tsx:278:25` | 错误 | 显式使用 `any` |
| 48 | `src/pages/Customers.tsx:299:25` | 错误 | 显式使用 `any` |
| 49 | `src/pages/Customers.tsx:300:19` | 错误 | 显式使用 `any` |
| 50 | `src/pages/Customers.tsx:312:19` | 错误 | 显式使用 `any` |
| 51 | `src/pages/Customers.tsx:350:29` | 错误 | 显式使用 `any` |
| 52 | `src/pages/Dashboard.tsx:9:27` | 错误 | 显式使用 `any` |
| 53 | `src/pages/Dashboard.tsx:61:23` | 错误 | 显式使用 `any` |
| 54 | `src/pages/Dashboard.tsx:380:76` | 错误 | 显式使用 `any` |
| 55 | `src/pages/OrderDetail.tsx:16:27` | 错误 | 显式使用 `any` |
| 56 | `src/pages/OrderDetail.tsx:53:19` | 警告 | Hook 依赖缺失：`form` |
| 57 | `src/pages/OrderDetail.tsx:66:17` | 错误 | 显式使用 `any` |
| 58 | `src/pages/Orders.tsx:24:27` | 错误 | 显式使用 `any` |
| 59 | `src/pages/Orders.tsx:119:13` | 错误 | Effect 内同步更新状态 |
| 60 | `src/pages/Orders.tsx:151:17` | 错误 | 显式使用 `any` |
| 61 | `src/pages/Orders.tsx:169:17` | 错误 | 显式使用 `any` |
| 62 | `src/pages/Orders.tsx:213:25` | 错误 | 显式使用 `any` |
| 63 | `src/pages/Orders.tsx:216:57` | 错误 | 显式使用 `any` |
| 64 | `src/pages/Orders.tsx:222:25` | 错误 | 显式使用 `any` |
| 65 | `src/pages/Orders.tsx:223:19` | 错误 | 显式使用 `any` |
| 66 | `src/pages/Orders.tsx:230:25` | 错误 | 显式使用 `any` |
| 67 | `src/pages/Orders.tsx:231:19` | 错误 | 显式使用 `any` |
| 68 | `src/pages/Orders.tsx:238:25` | 错误 | 显式使用 `any` |
| 69 | `src/pages/Orders.tsx:241:80` | 错误 | 显式使用 `any` |
| 70 | `src/pages/Orders.tsx:242:82` | 错误 | 显式使用 `any` |
| 71 | `src/pages/Orders.tsx:252:25` | 错误 | 显式使用 `any` |
| 72 | `src/pages/Orders.tsx:258:19` | 错误 | 显式使用 `any` |
| 73 | `src/pages/Payments.tsx:23:27` | 错误 | 显式使用 `any` |
| 74 | `src/pages/Payments.tsx:81:13` | 错误 | Effect 内同步更新状态 |
| 75 | `src/pages/Payments.tsx:98:17` | 错误 | 显式使用 `any` |
| 76 | `src/pages/Payments.tsx:123:17` | 错误 | 显式使用 `any` |
| 77 | `src/pages/Payments.tsx:134:17` | 错误 | 显式使用 `any` |
| 78 | `src/pages/Payments.tsx:173:31` | 错误 | 显式使用 `any` |
| 79 | `src/pages/Payments.tsx:182:31` | 错误 | 显式使用 `any` |
| 80 | `src/pages/Payments.tsx:191:31` | 错误 | 显式使用 `any` |
| 81 | `src/pages/Payments.tsx:199:31` | 错误 | 显式使用 `any` |
| 82 | `src/pages/Payments.tsx:239:45` | 错误 | 不规则空白字符 |
| 83 | `src/pages/Products.tsx:20:27` | 错误 | 显式使用 `any` |
| 84 | `src/pages/Products.tsx:34:13` | 错误 | Effect 内同步更新状态 |
| 85 | `src/pages/Products.tsx:52:17` | 错误 | 显式使用 `any` |
| 86 | `src/pages/Products.tsx:63:17` | 错误 | 显式使用 `any` |
| 87 | `src/pages/Referrals.tsx:21:27` | 错误 | 显式使用 `any` |
| 88 | `src/pages/Referrals.tsx:38:13` | 错误 | Effect 内同步更新状态 |
| 89 | `src/pages/Referrals.tsx:54:17` | 错误 | 显式使用 `any` |
| 90 | `src/pages/Referrals.tsx:69:17` | 错误 | 显式使用 `any` |
| 91 | `src/pages/Refunds.tsx:31:27` | 错误 | 显式使用 `any` |
| 92 | `src/pages/Refunds.tsx:64:13` | 错误 | Effect 内同步更新状态 |
| 93 | `src/pages/Refunds.tsx:89:17` | 错误 | 显式使用 `any` |
| 94 | `src/pages/Refunds.tsx:107:17` | 错误 | 显式使用 `any` |
| 95 | `src/pages/Refunds.tsx:131:31` | 错误 | 显式使用 `any` |
| 96 | `src/pages/Reports.tsx:12:27` | 错误 | 显式使用 `any` |
| 97 | `src/pages/Reports.tsx:32:5` | 错误 | Effect 内同步更新状态 |
| 98 | `src/pages/Reports.tsx:51:5` | 错误 | Effect 内同步更新状态 |
| 99 | `src/pages/Reports.tsx:150:68` | 错误 | 显式使用 `any` |
| 100 | `src/pages/Reports.tsx:153:84` | 错误 | 显式使用 `any` |
| 101 | `src/pages/Reports.tsx:154:82` | 错误 | 显式使用 `any` |
| 102 | `src/pages/Reports.tsx:155:82` | 错误 | 显式使用 `any` |
| 103 | `src/pages/Users.tsx:9:27` | 错误 | 显式使用 `any` |
| 104 | `src/pages/Users.tsx:25:13` | 错误 | Effect 内同步更新状态 |
| 105 | `src/pages/Users.tsx:42:17` | 错误 | 显式使用 `any` |
| 106 | `src/pages/Users.tsx:53:17` | 错误 | 显式使用 `any` |
| 107 | `src/pages/Users.tsx:74:21` | 错误 | 显式使用 `any` |
| 108 | `src/pages/Users.tsx:91:55` | 错误 | 显式使用 `any` |

复查命令（在 TY 仓库执行）：

```powershell
cd frontend
npm.cmd run lint
```
