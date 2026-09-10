# Spec: 会话标签栏布局回归中列 + 标签限宽

**Status:** done
**Created:** 2026-06-14
**Amends:** ADR-0004（布局子决策）、ticket `.scratch/session-tabs/issues/04-tab-bar-interactions.md`（溢出收缩条目）

## Problem Statement

会话标签栏当前横跨整个窗口顶部（侧栏上方）。用户期望它是「中」（sidebar 与右侧面板之间的聊天列）的顶部第一行——像 VS Code / Windows Terminal 那样，标签只属于编辑区/终端区，不属于整个窗口。同时，单个标签没有最大宽度限制：一个超长会话标题会把整条 tab 撑开，挤压同行其他内容。

## Solution

标签栏移入中列，成为中列第一行（32px，位于现有 36px 工具顶栏之上）；侧栏开关按钮回到其 session-tabs 特性之前的家——中列工具顶栏左端。标签本体增加 220px 最大宽度：超长标题截断省略号，悬停 tooltip 显示完整标题与 cwd（现有行为）。标签栏与工具顶栏各自保留底边框（两条线，两个视觉层级）。

## User Stories

1. As a 使用者, I want 标签栏位于聊天列顶部而非窗口顶部, so that 侧栏保持通顶完整，布局与主流编辑器一致
2. As a 使用者, I want 侧栏开关按钮常驻工具顶栏左端, so that 无论侧栏开合我都能在固定位置找到它
3. As a 使用者, I want 单个标签最大 220px, so that 一个超长会话标题不会撑爆整条标签栏
4. As a 使用者, I want 超长标签标题截断显示省略号, so that 标签栏始终保持整齐
5. As a 使用者, I want 悬停截断的标签能看到完整标题与 cwd, so that 不点开也能辨认会话
6. As a 使用者, I want 标签数量多时各标签仍按现有规则收缩（flexShrink + minWidth 36）, so that 限宽不破坏既有溢出行为
7. As a 使用者, I want 正在运行会话的标签保持绿色运行点, so that 移动布局后运行状态一眼可见
8. As a 使用者, I want 右键菜单、键盘导航（方向键/Home/End/Menu+Shift+F10）移动后照常工作, so that 无障碍与操作手感无回归
9. As a 使用者, I want 跨项目前缀（`项目名 · 标题`）在限宽内参与截断, so that 项目信息与标题一起被 ellipsis 处理
10. As a 使用者, I want 关闭标签 ✕ 按钮与运行点始终完整显示不被截断, so that 操作目标不会消失
11. As a 使用者, I want 侧栏收起时标签栏左缘贴窗口左缘, so that 收起后聊天区最大化
12. As a 移动端使用者, I want 现有响应式行为不变, so that 移动端布局不被桌面改动破坏
13. As a 开发者, I want ADR-0004 记录本次布局修订及理由, so that 未来读者知道「中列布局」是有意为之
14. As a 开发者, I want SessionTabBar 组件不再接收侧栏开关相关 props, so that 组件职责单一（只管标签）
15. As a 开发者, I want 布局调整不触碰 lib/session-tabs.ts 状态模型, so that 持久化数据零迁移

## Implementation Decisions

- **布局层级**：`SessionTabBar` 从「AppShell 根 flex 列的第一个子元素（整窗宽度）」移入中列 flex 列，成为其第一个子元素（在移动 backdrop、侧栏容器同级之后的中列内部顶部）。中列结构变为：标签栏（32px）→ 工具顶栏（36px）→ 内容。
- **侧栏开关迁出**：`SessionTabBar` 删除 `sidebarOpen` / `onSidebarToggle` props 及对应按钮；AppShell 在中列工具顶栏左端恢复特性前的侧栏开关按钮（同款图标、同款 hover 行为、同款 title/aria-label 与回调）。
- **标签限宽**：tab 本体 `maxWidth: 220`（含 padding、运行点、✕ 按钮）；标题 span 已有 ellipsis，容器限宽后超长 `项目名 · 标题` 自然截断；tooltip 已含完整标题与 cwd，无需改动。运行点与 ✕ 按钮 `flexShrink: 0` 已有，限宽后不被挤压。
- **双行边框**：标签栏与工具顶栏各自保留 `borderBottom: 1px solid var(--border)`——导航区与工具区是两个视觉层级，两条线是有意的。
- **ADR-0004 修订**：追加 Amended 段，记录「full-width row across the top of the window」改为「中列第一行」，理由：侧栏通顶完整、对齐主流编辑器心智模型、侧栏开关回归其原位。数据模型/持久化/单一 ChatWindow 实例等其余决策不变。
- **状态模型零改动**：`lib/session-tabs.ts`、localStorage 键、URL 同步 owner 均不动。
- **i18n**：零新 key（侧栏开关 title/aria-label 复用现有 `sidebar.hide`/`sidebar.show`）。

## Testing Decisions

- **好测试标准**：只测外部行为（布局断言、可见性、交互），不测实现细节。既有 e2e 通过 `role="tablist"`/`role="tab"` 抓取，不依赖 DOM 层级，移动后天然存活——这是本特性的最高 seam，优先复用。
- **更新模块**：
  - e2e（`e2e/session-tabs.mjs`）：新增/更新布局断言——标签栏位于中列顶部（如：侧栏展开时 tablist 的左缘 > 侧栏右缘；侧栏收起时贴窗口左缘）、超长标题 tab 宽度 ≤ 220px 且显示省略号、✕ 按钮仍可点击、侧栏开关位于工具顶栏。既有 12 场景全数回归。
  - 源码断言单测（`components/AppShell.session-tabs.test.mjs` 风格）：SessionTabBar 不再含 sidebarOpen prop；AppShell 中列含侧栏开关按钮。沿用既有 readFileSync+indexOf 文本断言先例。
- **先例**：`e2e/session-tabs.mjs`（tablist role 抓取、boundingBox 布局断言）、`components/AppShell.session-tabs.test.mjs`（源码文本断言）。

## Out of Scope

- 标签栏滚动/溢出下拉菜单（多 tab 横向滚动策略维持现状 overflow:hidden + 收缩）
- 移动端布局重设计
- 右侧面板（文件/终端 TabBar）任何改动
- 侧栏动画时长/宽度行为
- lib/session-tabs.ts 状态模型与持久化格式
- 后端/API

## Further Notes

- 本特性源于对 ADR-0004 布局子决策的修订，5 项设计问题（中列含义、开关去向、220px、ADR 修订方式、双边框）已经 grilling 流程逐项定案。
- 侧栏开关回到工具顶栏后，移动端行为与特性前版本一致（handleSidebarToggle 回调不变，仅按钮位置移动）。
