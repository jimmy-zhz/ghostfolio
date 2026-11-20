# ADR 0004 — MCP 开放投资计划的写入（不含整份计划）

- 状态：已采纳（2026-11-20）
- 扩展：[ADR 0002](0002-mcp-single-write-exception.md)（原来唯一的写入是 `create_activity`）
- 相关：[MCP 服务端](../architecture/mcp-server.md)、[guide/mcp.md](../../guide/mcp.md)

## 背景

用户希望 Claude 能直接维护价格提醒、定投等，而不是每次都回到界面里改。后端接口都已经有了，只是 MCP 没有接上。

## 决策

开放下面 10 个写工具，每个对应一个已有接口：

| 工具                      | 接口                                                |
| ------------------------- | --------------------------------------------------- |
| `create_price_alert`      | `POST /investment-plan/price-alert`                 |
| `update_price_alert`      | `PUT /investment-plan/price-alert/:id`              |
| `rearm_price_alert`       | `PUT /investment-plan/price-alert/:id/rearm`        |
| `delete_price_alert`      | `DELETE /investment-plan/price-alert/:id`           |
| `update_signal_status`    | `PUT /investment-plan/signals/:id/status`           |
| `create_dca_schedule`     | `POST /investment-plan/dca`                         |
| `update_dca_schedule`     | `PUT /investment-plan/dca/:id`                      |
| `delete_dca_schedule`     | `DELETE /investment-plan/dca/:id`                   |
| `upsert_allocation_group` | `PUT /investment-plan/allocation-group`             |
| `delete_allocation_group` | `DELETE /investment-plan/allocation-group/:groupId` |

- **不开放 `PUT /investment-plan`**（整份计划：资金池、现金储备/缓冲、增长目标、通知设置），用户明确不要。
  白名单测试里专门断言它被拒绝。
- 白名单仍落在发请求的地方（`MCP_ALLOWED_WRITES`），条目支持 `:param`，只匹配一个路径段。
- 描述沿用 `create_activity` 的规矩：先把要写的内容给用户看并得到明确确认；删除和改配置目标写明后果；
  改、删类先用 `get_investment_plan` 取 id。
- 注解：写工具 `readOnlyHint: false`，删除类和 `upsert_allocation_group`（替换一组时会删掉没列出的标的）
  `destructiveHint: true`。
- 参数在调用 API 之前校验：日期必须是 `YYYY-MM-DD`，`dataSource` 必须是 Ghostfolio 的数据源之一。
  REST 这边，DCA 更新里的日期解析失败返回 400；配置组的 `symbols` 为空返回 400（之前空数组加 name 会删光整组的标的）。
- 授权页文案改为：可以维护投资计划的提醒、定投、信号和配置目标（含删除），不能改删交易、不能改资金池。

## 同时修掉的问题

开放之前发现，这些按 id 写的接口本身有两个漏洞（REST 一直如此，与 MCP 无关，但 MCP 会让模型来调用它们）：

1. **不校验归属**：按 id 改、删、重新启用时不看记录属于谁，任何登录用户拿到别人的 id 就能改。
   现在服务层先按 `{ id, planId }` 查，查不到返回 404；没有计划时也返回 404，不再顺手建一份空计划。
2. **请求体原样交给 Prisma**：`PUT dca/:id`、`PUT price-alert/:id` 把整个请求体当 update 数据，
   可以改 `planId` 把记录挪到别人的计划，甚至通过关系嵌套写入改计划本身或用户。
   现在只接受可编辑字段（`investment-plan.helper.ts`），日期字符串转成 `Date`。

MCP 这一侧另有一层：工具参数按 zod schema 校验，未声明的参数会被丢掉；id 必须是 UUID（`groupId` 除外，
它可能是界面里生成的任意字符串）。

## 取舍

- 删除没有撤销。描述要求在确认时说清楚，并提示可以用 `isActive: false` 暂停代替删除。
- 确认只靠提示词，不可靠；这和 `create_activity` 一样，是有意接受的边界。
- `upsert_allocation_group` 不校验各组目标权重之和为 100（界面也不校验），只在描述里要求把改后的各组权重给用户看。
