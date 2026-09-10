# 01: 移除核心——过滤 + ✕ 按钮 + 持久化

**What to build:** 分组头行内增加 ✕ 移除按钮（22px，与「+」同款），点击后该项目组从侧栏分组列表消失；session 文件/API/运行中会话/已开 tab 全不动。移除记录持久化在 localStorage（key `pi-web:removed-projects-v1`，值为 workspace key 数组），刷新后仍生效。恢复信号：无需恢复 UI，自然回流（票 02）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `lib/project-groups.ts` 新增纯函数 `excludeRemovedProjects(projects, removedKeys): RecentProject[]`，空集合原样、命中过滤、key 区分正确
- [ ] `lib/project-groups.ts` 或同级 helper 新增 localStorage 读/写函数（SSR 安全：`typeof window === "undefined"` 时读返回空 Set，写 no-op）
- [ ] `components/SessionSidebar.tsx`：useState 初始化为 `null`（SSR 端 `new Set()`），hydration 后 effect 从 localStorage 恢复（沿用 `sidebar-expanded-groups-v1` 先例，不再重复 hydration 工厂函数的坑）
- [ ] `components/SessionSidebar.tsx`：`projectGroups` useMemo 结果经过 `excludeRemovedProjects` 过滤
- [ ] 分组头 ✕ 按钮（22px）：与「+」按钮同款式样，`aria-label={t("sidebar.removeProject")}`，tooltip `title={t("sidebar.removeProjectTip")}`，`onClick` stopPropagation 后加入集合、持久化
- [ ] 运行中项目不禁用 ✕
- [ ] 三语 i18n key：`sidebar.removeProject`（en "Remove project" / zh-CN 「移除项目」/ zh-TW 「移除專案」）、`sidebar.removeProjectTip`（en "Hide from sidebar only — sessions stay on disk" / zh-CN 「仅从侧栏移除，会话文件保留在磁盘」/ zh-TW 「僅從側欄移除，工作階段檔案保留在磁碟」）
- [ ] `lib/project-groups.test.mjs`：`excludeRemovedProjects` 单测（空集合/命中/未命中/worktree 归并键）
- [ ] e2e `e2e/session-sidebar-groups.mjs`：新增场景——点 ✕ 移除 group B → B 消失 → 刷新 → B 仍消失；group A 不受影响
