# 本仓库改过的上游文件（同步上游时要注意）

同步上游时，这些文件会有冲突或需要手工接回本仓库的改动。本仓库自己的模块（`investment-plan/`、`mcp/`、
`activity-tags/`、投资计划页面等）不在此列。按改动时间追加。

## 2026-12 迭代（[iteration-2026-12.md](../requirements/iteration-2026-12.md)）

| 文件                                                                                          | 改了什么                                                                                                                                                       | 同步时                                |
| --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------- |
| `libs/common/src/lib/routes/routes.ts`                                                        | `portfolio.subRoutes.activities`、`investmentPlan` 的地址改到 `/home/...`，`home.subRoutes.summary`、`markets` 改到 `/portfolio/...`；键名不变，标了 `// Fork` | 官方为底，重新改这四处的 `routerLink` |
| `apps/client/src/app/pages/home/home-page.routes.ts`、`home-page.component.ts`                | 首页挂上活动和投资计划，Summary、Markets 改为跳转                                                                                                              | 官方为底，接回标了 `Fork` 的块        |
| `apps/client/src/app/pages/portfolio/portfolio-page.routes.ts`、`portfolio-page.component.ts` | 默认页改为 Analysis；挂上 Summary、Markets；旧地址跳转（`redirectKeepingQueryParams`）                                                                         | 同上                                  |
| `apps/client/src/app/pages/portfolio/activities/activities-page.*`                            | Edit Tags 模式                                                                                                                                                 | 我方为底（这页本仓库已改过筛选栏）    |
| `libs/ui/src/lib/activities-table/activities-table.component.ts`                              | 勾选框后开时也发出选中的交易                                                                                                                                   | 官方为底，接回一处                    |
| `apps/api/src/app/app.module.ts`                                                              | 注册 `ActivityTagsModule`                                                                                                                                      | 加一行                                |
| `prisma/schema.prisma`                                                                        | `Tag.fundGroups` 关系（其余是本仓库的模型）                                                                                                                    | 加一行                                |

另外，手机端适配（[mobile-layout.md](../requirements/mobile-layout.md)）改过 `line-chart`、`activities-table`、
`holdings-table`、`benchmark` 四个 ui 组件。
