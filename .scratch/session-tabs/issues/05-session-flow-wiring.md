# 05: 会话流特例接线

**What to build:** 把与 tab 模型交互的会话生命周期特例接好：从消息 fork 出新会话时自动开新 tab 并激活、原会话 tab 保留；点击侧栏或 Agent 面板里的 subagent 会话时在当前 tab 内导航（不开新 tab）；tab 对应的会话被删除时该 tab 自动关闭；关掉所有 tab 后主区域显示正式欢迎空态页——logo、一句引导（从左侧项目分组的「+」或会话开 tab）、键盘可达可操作。

**Blocked by:** 01

**Status:** ready-for-agent

- [ ] fork → 开新 tab 并激活，原 tab 保留不动
- [ ] subagent 会话点击 → 当前 tab 内导航（与现状交互一致），tab 不增殖
- [ ] 会话删除 → 对应 tab 自动关闭（相邻选择策略复用），tab 栏无死链
- [ ] 欢迎空态页：全部 tab 关闭后显示 logo+引导，侧栏仍可操作，焦点可达、Enter 可完成首次打开
- [ ] e2e：fork 开新 tab、subagent tab 内导航、删除会话 tab 自动关、关全部 tab 见欢迎页
