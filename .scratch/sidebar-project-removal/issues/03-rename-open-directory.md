# 03: 「自定义路径…」→「打开目录…」

**What to build:** 侧栏底部「Custom path…」按钮文案改为「Open directory…」（zh-CN「打开目录…」/ zh-TW「開啟目錄…」）；目录选择弹窗、校验、提交逻辑零改动。

**Blocked by:** None (can start immediately)

**Status:** ready-for-agent

- [ ] `sidebar.customPath` 三语文案更新：en "Open directory…" / zh-CN 「打开目录…」/ zh-TW 「開啟目錄…」
- [ ] `DirectoryPicker` 及侧栏引用不改动（只改 key 文案）
- [ ] e2e 不受影响（现有 e2e 无该按钮文案锚点）
