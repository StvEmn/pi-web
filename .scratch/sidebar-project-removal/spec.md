# Spec: 侧栏项目分组「移除」（界面级）+「打开目录」改名

**Status:** ready-for-agent
**Created:** 2026-06-14

## Problem Statement

用户侧栏里积累了很多项目分组，大多不再活跃，占满了列表。用户需要一个「移除」操作把不想要的项目从侧栏分组列表里清掉——但绝不能动 pi 真实的 session 文件（移除只是 pi-web 侧栏的视图行为）。另外侧栏底部的「自定义路径…」入口语义不清，应改名「打开目录…」并保持原有选择逻辑。

## Solution

每个项目分组头增加 ✕ 移除按钮：点击后该组从侧栏消失，session 文件、API、运行中会话、已开 tab 全不受影响。移除记录在 localStorage 的「已移除项目 key 集合」；当任何导航再次选中该项目的会话（侧栏点击、URL `?session=`、搜索面板、tab 激活）、或在该目录新开会话/打开目录时，组自然回流。侧栏底部「自定义路径…」改名「打开目录…」（三语），行为不变。

## User Stories

1. As a 使用者, I want 每个分组头有 ✕ 移除按钮, so that 不再活跃的项目能从侧栏清掉
2. As a 使用者, I want 移除只作用于侧栏视图, so that pi 的 session 文件一个都不丢
3. As a 使用者, I want 移除后已开的 tab 照常工作（含运行中会话的运行点）, so that 正在跑的任务不受干扰
4. As a 使用者, I want 移除有 running 会话的项目照样能移, so that 不会被无谓禁用
5. As a 使用者, I want 在该目录新开会话或点「打开目录」后项目重新出现在侧栏, so that 回流不需要专门的恢复功能
6. As a 使用者, I want 点 URL `?session=`/搜索面板/侧栏条目导航到已移除项目的会话时组自动回来, so that 任何选中该会话的路径都等于重新添加
7. As a 使用者, I want 底部按钮叫「打开目录…」而非「自定义路径…」, so that 语义直白
8. As a 使用者, I want 「打开目录」保持原有目录选择器与校验逻辑, so that 零行为回归
9. As a 使用者, I want 移除状态跨刷新持久, so that 重启浏览器后侧栏保持干净
10. As a 使用者, I want 移除 worktree 所在主项目时 worktree 会话随组一起消失, so that 不会出现组没了会话还在别处冒出来
11. As a 使用者, I want 移除按钮 hover 有视觉反馈且 tooltip 写明「仅从侧栏移除」, so that 不误以为删数据
12. As a 使用者, I want 所有组都被移除后侧栏显示既有空态文案, so that 不迷路（底部入口仍在）
13. As a 使用者, I want 移除记录以组 key（projectKey/projectRoot）存储, so that worktree/主项目归并正确

## Implementation Decisions

- **数据模型**：`lib/project-groups.ts` 新增纯函数 `excludeRemovedProjects(projects, removedKeys)` 过滤 `getRecentProjects` 输出；新增 localStorage 读写 helper（key `pi-web:removed-projects-v1`，值为 workspace key 数组）。沿用 `sidebar-expanded-groups-v1` 的 SSR 安全模式：useState 初始化为 null、hydration 后 effect 恢复（该仓已为此付过一次 hydration 修复的学费，ADR 教训）。
- **移除动作**：分组头行内 ✕ 按钮（22px，与「+」按钮同款式样：同尺寸、同 hover 反馈、`aria-label` = `sidebar.removeProject` i18n key，title 提示「仅从侧栏移除」）。点击从集合加 key 并持久化。**运行中不禁用**。
- **回流（unhide）规则**：选中某 session 时（单一汇聚点 `handleSelectSession`）若其所属组 key 在移除集合中则移除该 key；「+ 新会话」「打开目录」「默认目录」成功落到某 cwd 时同样处理。无专门恢复 UI——回流即恢复。
- **改名**：i18n key `sidebar.customPath` 文案改三语（en "Open directory…" / zh-CN 「打开目录…」/ zh-TW 「開啟目錄…」），组件引用不动；目录选择弹窗标题、校验、提交流程零改动。
- **不触碰**：`/api/sessions`、session 文件、tab 栏、running 轮询、右侧面板。

## Testing Decisions

- **好测试标准**：外部行为（组消失/回流/持久化/文案），不测内部结构。
- **单测**（`lib/project-groups.test.mjs` 风格，既有先例）：`excludeRemovedProjects` 过滤正确性（空集合原样、命中过滤、key 区分）。
- **e2e**（`e2e/session-sidebar-groups.mjs` 扩展，既有先例）：移除后组消失、刷新后仍消失、URL 直达该组会话后组回流、「打开目录」按钮文案。既有 6 场景全回归。
- **i18n 三语键等值**：既有 registry 测试自动覆盖新文案。

## Out of Scope

- 「已移除项目」管理面板/恢复列表（回流即恢复，无此 UI）
- 批量移除、拖拽排序
- 移除确认弹窗
- 弹窗标题与提交流程改动
- 后端/API

## Further Notes

- 语义澄清（grilling 定案）：「移除」是 pi-web 侧栏视图行为，与 pi session 存储完全解耦；新活动自然回流不是「恢复功能」而是「重新添加」。
- 键选用 workspace key（与分组树同键），worktree 归并主项目——与 ADR-0004 的 worktree 显示归并一致。
