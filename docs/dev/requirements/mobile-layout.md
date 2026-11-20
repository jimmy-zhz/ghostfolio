# 手机端适配：持仓弹窗、活动表、持仓表、关注列表

- 状态：已开发，待 review（分支 `feat/mobile-layout`，基于 `a067f9109`）
- 范围：只动前端（`libs/ui`），不改 API 和数据库

## 1. 背景

用户主要用 iPhone 竖屏（约 390px 宽）看 Ghostfolio。三个页面的表格在小屏上用
`d-none d-lg-table-cell` 把次要列直接藏掉，手机上哪儿都看不到这些信息；持仓详情弹窗还会被撑得比屏幕宽。

## 2. 统一原则

- “小屏”即 Bootstrap 的 `lg` 断点以下（< 992px），和原来隐藏列用的断点一致。
- 小屏把次要字段合并到第二行（次要样式），不靠横向滚动。
- 桌面（lg 及以上）布局保持现状：新加的内容一律 `d-lg-none`，隐藏的列一律 `d-none d-lg-table-cell`。
- 第二行的文字由 `libs/ui/src/lib/shared/mobile-summary.ts` 拼接（纯函数，有单元测试），分隔符是中点 `·`，两侧各一个空格。

## 3. 需求与方案

### 3.1 持仓详情弹窗被撑宽

**问题**：`line-chart` 顶部的时间范围选项（`gf-toggle`，`text-nowrap`）在 390px 下比屏幕宽，
弹窗内容跟着变宽、能左右滑。

**方案**：让这一排选项自己横向滚动（`line-chart.component.scss`），不改成下拉。理由：

1. 选项和当前选中项始终可见，一次点击即可切换；下拉要点两次，还看不到其他选项。
2. 改动只在 `line-chart` 内，不新增组件和界面文字；共用的 `gf-toggle` 不受影响。
3. 选项放得下时（桌面）外观不变。

实现要点：

- `contain: inline-size`：选项的宽度不再计入祖先的最小宽度，弹窗不会被撑宽（祖先里有 flex 项，单靠 `overflow` 不够）。
- `overflow-x: auto`：放不下时这一排自己滚动。
- 居中从 `text-center` 改为 flex + `margin-inline: auto`：放得下时居中，放不下时自动变成左对齐，第一个选项不会被裁到滚动区外。

### 3.2 活动表（`activities-table`，弹窗交易 tab 和 /portfolio/activities 共用）

**小屏两行**：新增只在小屏显示的列 `mobileSummary`，替代原来小屏专用的 `valueInBaseCurrency` 列；
名称、类型、日期、账户列改为小屏隐藏。

- 第一行：类型、日期、（活动页有名称列时）名称（截断）、草稿标记、金额（基础货币）。
- 第二行（次要样式）：`数量 × 单价 币种 · 手续费 金额 · 账户`；手续费为 0 时省略；`showAccountColumn` 为 false 时不带账户。
- 有备注时再加一行备注（截断）。

**单条交易详情**：小屏点一行，在该行内展开只读详情（再点收起，同时只展开一条）：
名称/代码、数量、单价、手续费、金额（交易币种；与基础货币不同时再列基础货币金额）、账户、标签、备注。
下面是操作按钮，权限判断沿用原来的菜单：

| 按钮                     | 条件                                                                       |
| ------------------------ | -------------------------------------------------------------------------- |
| 查看持仓（View Holding） | `canClickActivity`（买入/卖出/分红、非草稿、`hasPermissionToOpenDetails`） |
| 编辑                     | `showActions && hasPermissionToUpdateActivity`                             |
| 复制                     | `showActions && hasPermissionToCreateActivity`                             |
| 删除                     | `showActions && hasPermissionToDeleteActivity`                             |

- “点一行打开持仓弹窗”的入口在小屏移到了详情里的“查看持仓”按钮；桌面点行仍直接打开持仓弹窗。
- 行尾的 `…` 菜单在小屏保留（含导出草稿 ICS 等）；菜单里“查看持仓”改为直接打开持仓，不受小屏展开逻辑影响。
- 小屏判断用 CDK `BreakpointObserver` 监听 `(max-width: 991.98px)`，与 CSS 断点一致（而不是按 `deviceType`，
  否则横屏平板会出现“点了要展开、但详情区被 CSS 藏掉”的情况）。
- 导入预览（`showCheckbox`）里点行仍是勾选，不展开。

**为什么不用第二个 `matRowDef`（`multiTemplateDataRows`）做第二行**：表格斑马纹用 `nth-child(even)`，
多一行（即使桌面隐藏）也会打乱桌面的斑马纹，违背“桌面不变”。所以两行都放在同一个单元格里。

**代价**：小屏的表头只剩 “Activity”，不能再按类型、日期点表头排序（两个排序表头不能共用一个 id）。
活动页默认按日期倒序，弹窗里本来就禁用了排序。

### 3.3 持仓表（`holdings-table`，/home/holdings）

- 第一行：名称、Simple Return（收益率）。
- 第二行（次要样式，替代原来的代码）：`代码 · 市值 · 占比 · 数量`；
  没有 `hasPermissionToShowValues` 不显示市值，没有 `hasPermissionToShowQuantities` 不显示数量，值为空（受限视图）也不显示。
- 小屏隐藏 Allocation、Change、Performance 三列；Performance 在 `simple` 模式（首页概览）仍显示。
- 小屏名称列占满剩余宽度、长名称截断（`max-width: 0; width: 100%`），不再把表格撑宽。

**线上与代码是否一致**：一致。线上 `oci-4c24g:/opt/ghostfolio` 在 `a067f9109`，镜像 `ghostfolio/ghostfolio:local`
构建于 2026-10-27 10:09（-05:00，晚于该提交 10:02），容器内前端包的 `displayedColumns` 与代码相同，Allocation 列没有 `d-none`。
截图里只看到 Name 和 Simple Return 的原因：名称列是 `text-nowrap` 且不限宽，长名称把表格撑得比屏幕宽；
Simple Return 是 `stickyEnd`，固定在右边，中间的 Allocation、Change、Performance 被挤到需要横向滚动才能看到的区域。

### 3.4 关注列表（`benchmark`，/home/watchlist）

- 小屏在名称下方（代码右边）显示 `50D ↗`、`200D ↘` 这样的小标记（`gf-trend-indicator`），不占列；
  title 用已有的 “50-Day Trend”/“200-Day Trend”。
- 和桌面的趋势列一样，只在开启实验功能（`isExperimentalFeatures`）时显示；趋势为 `UNKNOWN` 时不显示。
- 历史最高价日期在小屏本来就隐藏，保持不变。
- 小屏名称列占满剩余宽度、长名称截断。

## 4. i18n

新增的界面文字用 `i18n` 属性标注：`Activity`（复用已有文案）、`50D`、`200D`。其余（Fee、Quantity、Unit Price、
Value、Account、Tags、Note、View Holding、Edit、Clone、Delete 等）都复用已有文案。
`Fee` 在 TS 里用 `$localize`。

尚未运行 `npm run extract-locales`（容器里不做构建）；`50D`、`200D` 在各语言 xlf 里没有译文时回退为英文原文。
下次更新多语言时一并抽取。

## 5. 测试

- `libs/ui/src/lib/shared/mobile-summary.spec.ts`：第二行文字的拼接、权限过滤、空值省略。
- `libs/ui/src/lib/activities-table/activities-table.component.spec.ts`：小屏显示第二行、点行展开/收起而不打开持仓、
  详情里的“查看持仓”、大屏点行打开持仓。Ionic 只发布 ES 模块，Jest 不转译，所以 spec 里 mock 了 `@ionic/angular/standalone` 和 `ionicons`。
- 人工验收（部署后在 iPhone 上）：
  1. 持仓弹窗不能左右滑，时间范围这一排可以单独左右滑，第一个选项可见。
  2. 活动页和弹窗交易 tab：每条两行；点一行展开详情，按钮按权限出现；“查看持仓”能打开持仓弹窗。
  3. /home/holdings：每个持仓两行，第二行有市值和占比；表格不能左右滑。
  4. /home/watchlist：开启实验功能时名称下方有 50D/200D 标记；表格不能左右滑。
  5. 桌面宽度下以上页面与改动前一致（含斑马纹、排序）。
