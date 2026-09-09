# 02: 草稿 tab 生命周期

**What to build:** 用户从现有「新建会话」入口（暂为侧栏现有新建入口）发起新建时，标签栏直接出现一个「新会话」草稿 tab：不急着发消息也能切到别的 tab 再切回，输入框内容不丢；同一项目可以同时开多个草稿 tab 并存；在草稿 tab 发出首条消息后，它原位落成正式会话 tab——标题、会话 id、URL 全部同步更新，用户无需任何额外操作。未落成的草稿 tab 可直接关闭，不留任何残留。

**Blocked by:** 01（tab 状态模型、SessionTabBar、AppShell 接线）

**Status:** ready-for-agent

- [ ] 状态模块支持草稿条目：无 sessionId 的 tab、落成（draft → 正式会话原位替换 id/标题）、同项目多草稿并存
- [ ] 草稿 tab 的输入草稿在切换 tab 后不丢（复用 draft-store，按草稿 tab id 持久化）
- [ ] 首条消息发出后原位落成：tab 不重建（保持位置）、sessionId/标题/URL 镜像更新
- [ ] 草稿 tab 显示「新会话」语义化标题；关闭纯草稿 tab 无副作用
- [ ] 状态模块草稿转移单测；e2e：开草稿→切走切回草稿在→落成→URL 正确
