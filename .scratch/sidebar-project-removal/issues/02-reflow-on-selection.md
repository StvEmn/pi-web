# 02: 回流——选中已移除项目会话时自动恢复

**What to build:** 当任何导航路径选中了已移除项目的会话时，该项目组自动回到侧栏（无需手动恢复 UI）。回流触发点三处：`handleSelectSession`（统一汇聚点，覆盖侧栏点击/URL `?session=`/搜索面板）、新会话落地（`+` 按钮/默认目录）、打开目录落地。回流是幂等操作：key 不在集合里直接 no-op。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] 提取 `restoreRemovedProject(key: string)` 函数：从 localStorage 移除 key（幂等），同步移除集合 state（若未初始化则不操作）
- [ ] `handleSelectSession`（AppShell）：选中 session 时计算其 `workspaceKeyOf`，调用 `restoreRemovedProject`；需要一个从 AppShell → SessionSidebar 的回调 prop 或通过共用状态（prefactor: 移除集合读写下沉到共用模块两边都能导入）
- [ ] 新会话落地路径（SessionSidebar `handleGroupNewSession`）：组不在列表中时 `+` 按钮不可见，回流触发由「打开目录」/「默认目录」覆盖；但若该项目组被移除、用户在该项目下敲回车或 URL 打开 draft——仍由 handleSelectSession 覆盖
- [ ] 打开目录落地（`commitCustomPath`）：cwd 若匹配被移除组 key 则回流
- [ ] e2e `e2e/session-sidebar-groups.mjs`：新增场景——移除 B → URL 直达 SESSION_B → 侧栏 B 组复现；既有 6 场景 + 01 新场景全回归
