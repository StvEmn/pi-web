# 01: Session Tab 骨架端到端

**What to build:** 用户点击侧栏任一会话时，窗口最顶部整行出现标签栏：该会话成为一个新标签页；再次点击同一会话激活对应 tab 不新开；点击第三个会话再开一个；切换 tab 时聊天区重挂载并恢复该会话上次浏览的滚动位置、SSE 自动重连、输入框草稿恢复；点击 tab 上的关闭按钮关闭它并选中相邻 tab（左优先，无左取右）；刷新浏览器后 tab 列表与激活态从 localStorage 原样恢复，URL `?session=` 始终镜像激活 tab。首次启动无持久化记录时用 URL 会话或最近会话初始化单 tab。本票入口复用现有侧栏（项目下拉暂不动）。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] lib 层会话标签页状态模块（纯函数：open/activate/close/相邻选择、localStorage 读写、URL 镜像、首启初始化），node:test + jiti 直调单测覆盖全部转移
- [ ] 顶部整行 SessionTabBar：tablist/tab ARIA 角色、每 tab 关闭按钮、激活态样式，侧栏折叠按钮随迁该行
- [ ] AppShell 接线：侧栏会话点击→开/激活 tab；tab 切换→ChatWindow 换 sessionId 重挂载；按会话 id 的滚动位置内存 Map 及恢复
- [ ] 切换 tab 后 SSE 重连、消息重载、输入草稿恢复（复用刷新中途恢复链路），运行中会话关 tab 后后台继续运行
- [ ] 刷新恢复 tab 列表+激活态；URL 只镜像 active；无记录首启初始化单 tab
- [ ] e2e 冒烟：真 dev server + 双项目 JSONL fixture（本票建立该 fixture 基建）——开 tab、重复点击不新开、切换滚动恢复、关 tab 相邻选择、刷新恢复
- [ ] 选择器用 getByRole("tablist"/"tab")+语义 aria-label，不引入 data-testid；`npm run test` 与 lint 全绿
