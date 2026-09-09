# Session Tabs — Multi-Project Parallel Chat

Status: ready-for-agent

## Problem Statement

用户在多个项目并行使用 Pi Web 时，当前唯一的导航方式是侧栏顶部「项目下拉 + 单项目会话列表」：想在另一个项目的会话里看一眼，必须先切下拉、再点会话，然后想回来又要反向操作一遍。多项目并行时这个循环极其打断心流，且任何时刻只能看到当前一个会话。

## Solution

引入浏览器/Windows Terminal 风格的**会话标签页（Session Tab）**：窗口最顶部一整行标签栏，一个 tab 对应一个会话，不同项目的会话混合排列。侧栏改为全项目分组树，点击任何会话即开新 tab；每个项目分组带「+」按钮开出草稿 tab，发首条消息后落成正式会话。切换 tab 时聊天区重挂载并恢复滚动位置；tab 列表持久化到 localStorage，刷新或重启后恢复。关闭 tab 只是关视图，会话继续在后台运行，随时可从侧栏重开。

## User Stories

1. As a Pi Web 用户, I want 点击侧栏任意项目的会话时自动开一个新标签页, so that 我能同时「打开」多个会话而不必来回切换项目下拉。
2. As a 多项目并行用户, I want 不同项目的会话标签在同一行标签栏混合排列, so that 我一眼看到所有活跃会话及其项目归属。
3. As a 多项目并行用户, I want 已打开的会话再次被点击时直接激活对应标签页而不是新开, so that 标签栏不会重复堆积同一会话。
4. As a 多项目并行用户, I want 切换标签页时聊天区自动恢复到该会话最后浏览的滚动位置, so that 每次切回都接着上次看到的地方。
5. As a 多项目并行用户, I want 切换标签页后 SSE 自动重连、消息自动重载、输入框草稿自动恢复, so that 切换后的会话状态与我离开时一致。
6. As a 长时间使用用户, I want 刷新浏览器或重启应用后标签栏原样恢复（含激活态）, so that 我的工作上下文不因刷新丢失。
7. As a 分享链接用户, I want URL 中的 `?session=` 始终指向激活 tab 的会话, so that 我能分享/收藏直达某会话的链接。
8. As a 并行运行多个 agent 的用户, I want 运行中的会话被关闭 tab 后继续在后台运行（侧栏绿点可见）, so that 我关掉 tab 不会误杀任务。
9. As a 并行运行多个 agent 的用户, I want 从侧栏重新打开一个正在运行且已被关闭 tab 的会话时流式输出无缝续上, so that 我不丢失任何输出。
10. As a 谨慎用户, I want 右键标签页弹出菜单（关闭/关闭其他/关闭右侧）, so that 我能快速清理标签栏。
10a. As a 谨慎用户, I want 右键菜单在键盘焦点操作（focus + Menu/Shift+F10）下也能打开, so that 无法使用鼠标时不被排除在外。
11. As a 屏幕空间有限用户, I want 标签超出宽度时各 tab 收窄、标题截断为省略号、悬停 tooltip 显示全名, so that 标签栏保持单行且信息可达。
12. As a 多项目用户, I want 已开 tab 横跨 2 个及以上项目时标签标题前显示项目名前缀, so that 混排时能区分项目归属。
13. As a 单项目用户, I want 只开一个项目的 tab 时不显示项目前缀, so that 标题保持简洁。
14. As a 想知道路径的用户, I want 悬停标签页时 tooltip 显示会话完整 cwd, so that 同名项目（如主仓与 worktree）也能区分。
15. As a 新会话创建者, I want 点击项目分组「+」后出现一个「新会话」草稿标签页, so that 我可以先把 tab 开出来再慢慢写提示词。
16. As a 新会话创建者, I want 草稿 tab 在我切到别的 tab 再切回后输入框内容不丢, so that 我不因中途查看别的会话而丢失草稿。
17. As a 新会话创建者, I want 同一项目能同时存在多个草稿 tab, so that 我可以并行准备多个不同任务的提示词。
18. As a 新会话创建者, I want 草稿 tab 发出首条消息后原位落成正式会话 tab（标题、id、URL 同步更新）, so that 草稿到正式的过渡不需要我重新开 tab。
19. As a fork 用户, I want 从某消息 fork 出新会话后自动开新 tab 并激活, so that 我能立即在新分支上继续，原会话 tab 保留。
20. As a subagent 观察者, I want 点击侧栏或 Agent 面板的 subagent 会话时在当前 tab 内切换（与现状一致）, so that 父子会话查看不增殖标签页。
21. As a 首次启动用户, I want 无持久化记录时应用用 URL 中的会话或最近会话初始化单个 tab, so that 首次进入不会面对空标签栏加空聊天区。
22. As a 首次启动用户, I want 关掉所有 tab 后主区域显示欢迎页（logo + 引导从左侧项目分组开 tab）, so that 空状态有明确指引而不是空白。
22a. As a 首次启动用户, I want 欢迎页在键盘导航下可操作（焦点可达、Enter 开 tab）, so that 纯键盘用户也能完成首次会话打开。
23. As a 文件浏览用户, I want 侧栏的文件浏览器与 worktree 切换器跟随激活 tab 的项目切换, so that 文件视图总是对应当前正在看的会话。
24. As a 会话管理者, I want tab 对应的会话被删除时该 tab 自动关闭, so that 标签栏不会残留指向不存在会话的 tab。
25. As a 多 worktree 用户, I want 项目分组树按 workspace key（主仓+worktree 归并）组织, so that 同一仓库的 worktree 不会散落成多个「项目」。
26. As a 习惯一致性用户, I want 标签栏横跨窗口最顶部整行（侧栏上方）, so that 符合 Windows Terminal / 浏览器的标签心智。
27. As a 习惯一致性用户, I want 顶部标签栏不提供「+」按钮（新建入口只在侧栏项目分组）, so that 新建会话总是先明确项目。
28. As a 浏览器用户, I want 侧栏从项目下拉改为全项目分组树后, 运行状态绿点、fork 子树嵌套、会话重命名/删除等现有操作全部保留, so that 升级不损失既有能力。
29. As a 后续封装应用的用户, I want tab 持久化只依赖 localStorage + URL, so that 将来打包成桌面应用时此设计无需返工。
30. As a 打扰敏感用户, I want 关闭运行中会话的 tab 时不弹任何确认, so that 清理标签栏永远一步完成。
31. As a 可访问性用户, I want 标签栏用 tablist/tab ARIA 角色并支持方向键切换, so that 屏幕阅读器和键盘用户能正常使用。
32. As a 可访问性用户, I want 右键菜单、草稿标签「新会话」标记、溢出省略号等都有语义化文本, so that 辅助技术能读出状态。
33. As a 移动/窄屏用户, I want 标签栏在窄屏上不破坏现有响应式布局, so that 手机浏览器场景不被新布局挤坏。
34. As a 并行运行多个 agent 的用户, I want 正在运行会话的 tab 上有可见的运行指示（如微标点）, so that 不切 tab 也能看到哪些在跑。

## Implementation Decisions

- **术语**：本特性概念定名 **会话标签页（Session Tab）**（见根 CONTEXT.md），与右侧面板既有「TabBar/Tab」（文件/终端）严格区分；代码中新建组件/状态命名为 SessionTabBar / session tab 系，不动右侧面板 Tab 命名。
- **Tab 粒度**：会话级。一个 tab = 一个会话视图；跨项目混排。不按项目分组 tab，不做项目+会话两层 tab。
- **数据模型**：tab 条目 `{ id（tab 自身稳定 id）, sessionId?, draft（草稿标识与 cwd）}`。sessionId 可空（草稿）。tab 不永久绑定单一会话：subagent 点击是 tab 内导航（与现状一致），只有 fork 开新 tab。
- **切换机制**：沿用现有单 ChatWindow 实例 + `key` remount 模型。切换 tab = 换渲染的 sessionId 并 remount；按会话 id 在内存 Map 记滚动位置，挂载后恢复。SSE 重连、消息重载、草稿恢复复用现有「刷新中途恢复流式输出」链路。不做保活/LRU 保活（升级路径已在 ADR-0004 记录，tab 数据模型不变即可后补）。
- **持久化**：tab 列表 + activeId 以 localStorage 为 source of truth；URL 只镜像激活 tab 的 `?session=`（沿用现有 query 名）。首次启动无记录时用 URL 会话或最近会话初始化单 tab。
- **布局**：SessionTabBar 置于 AppShell 布局最顶部整行（侧栏上方），侧栏折叠按钮随迁该行。
- **侧栏**：项目下拉移除，改为全项目分组树（按 workspace key 分组、最近活动排序、组内保留现有会话树与全部操作）；每分组头带「+」（在该项目下开草稿 tab）；FileExplorer/WorktreeSwitcher 保留在侧栏下部、跟随激活 tab 的项目。
- **草稿 tab**：点「+」即开草稿 tab；未发消息切走不丢输入（复用现有 draft-store）；同项目多草稿并存；首条消息发出后原位落成正式会话 tab 并更新 URL。
- **tab 标题**：会话名（无命名取首条消息摘要）；已开 tab 跨 ≥2 项目时加项目名前缀；tooltip 显示完整 cwd。
- **溢出**：超出宽度各 tab 收缩 + 标题省略号 + tooltip 全名；不横向滚动、不换行。
- **右键菜单**：关闭、关闭其他、关闭右侧。v1 不做中键关闭、快捷键、拖拽排序。
- **空态**：全部 tab 关闭后主区显示欢迎页；侧栏仍可用。
- **清理**：tab 对应会话被删 → tab 自动关闭；关闭 tab 不影响会话运行。
- **ADR**：docs/adr/0004-session-tabs.md 已记录粒度/切换/持久化/侧栏形态/subagent 的权衡与被否备选。
- **后端**：零改动。`globalThis.__piSessions` 注册表已支持多会话并行，本特性纯前端。

## Testing Decisions

- **原则**：只测外部行为（用户可见的导航结果与持久化结果），不测实现细节。沿用本仓两种既有测试形态：lib 纯函数直调断言（node:test + jiti import TS 源码）与 Playwright e2e（真 dev server + `PI_CODING_AGENT_DIR` 指向含 JSONL fixture 的临时目录，不 mock API）。
- **唯一新增接缝**：会话标签页状态模块（lib 层，纯函数：open/close/activate/close-others/close-right/draft 落成、localStorage 读写、跨项目前缀标题计算、溢出收缩策略的纯计算部分）。测试先例：`lib/project-groups.test.mjs`、`lib/workspace-memory.test.mjs`。
- **e2e 场景（复用最高接缝）**：双项目 fixture → 侧栏点击开 tab、重复点击激活不新开、切换后滚动位置/草稿恢复、右键菜单三动作、刷新后 tab 恢复、草稿 tab 落成、fork 开新 tab、subagent tab 内导航、关全部 tab 出欢迎页。先例：`e2e/run.mjs`（滚动恢复、会话切换）、`e2e/themes.mjs`（localStorage 持久化）。
- **组件源码断言**：SessionTabBar 与分组树的 ARIA 结构（tablist/tab/aria-label）用 readFile+regex 风格约束，先例 `components/AppShell.*.test.mjs`。
- **选择器约定**：延续全仓零 data-testid 现状，e2e 用 `getByRole("tablist"/"tab")` + 语义 aria-label；需要精确定位时用业务语义属性（如 `data-session-id` 风格），不引入 testid。

## Out of Scope

- tab 拖拽排序、中键关闭、Ctrl+Tab/Ctrl+W 快捷键（v1 明确不做）
- 标签栏溢出下拉菜单（「»」）、tab 预览/悬浮预览
- 多窗口/弹出独立窗口、分屏（split-view 同屏多会话）
- 保活式（keep-alive）聊天实例或 LRU 实例缓存（升级路径留待实测后决策）
- ChatWindow 内部功能改动（消息渲染、模型选择、工具选择等一概不动）
- 右侧面板 TabBar（文件/终端）的任何变更
- 后端 API 与 AgentSession 生命周期改动
- 桌面应用封装本身（仅保证设计不与之冲突）

## Further Notes

- 关联 ADR：docs/adr/0004-session-tabs.md（粒度、切换机制、持久化、侧栏形态、subagent 行为五项权衡）。
- 关联术语：根 CONTEXT.md「Session Tab（会话标签页）」。
- 实施时的自然分解（4 个可并行/链式子任务）：① tab 状态层（lib 模块）→ ② SessionTabBar 组件 → ③ 侧栏全项目分组树改造 → ④ AppShell/ChatWindow 接线与空态页。①完成前 ②③④ 依赖其类型定义；②③ 相互独立可并行。
- 行为细节：关闭最后一个 tab 时相邻 tab 选择策略 = 取左侧，无左侧取右侧，全无则进欢迎页。
- 移动端窄屏下顶部整行标签栏需与现有响应式断点共存（允许 v1 简单收纳），不追求移动端完美体验。
