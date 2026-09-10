# Session-level top tabs with remount-on-switch

The frontend previously rendered exactly one ChatWindow driven by a sidebar project dropdown + session list, which made working across parallel projects painful. We decided to add browser/Windows-Terminal-style **session tabs** (one tab = one session, tabs from different projects mix freely) rendered as a full-width row across the top of the window, while keeping the single-ChatWindow-instance model: switching tabs remounts the chat (SSE reconnect, message reload, and draft restore ride the existing refresh-mid-stream machinery) and only a per-session scroll position is kept in memory. Tab list and active tab persist to localStorage (source of truth) with the URL mirroring only `?session=<active>` so the design carries over unchanged to a future packaged app. The sidebar becomes an all-projects grouped tree (per-group "+" opens a draft tab that becomes a real session on first message); the project dropdown goes away, and FileExplorer/WorktreeSwitcher follow the active tab's project.

## Considered Options

- **Tab granularity**: project-level (tab keeps the sidebar-in-project layout — rejected: same-project parallel sessions still need sidebar switching), two-level project+session tabs (rejected: complexity), session-level (chosen).
- **Switch behavior**: keep-alive hidden ChatWindows (rejected for v1: N concurrent SSE connections, memory, and it breaks the single-instance assumptions in `useAgentSession`), remount + scroll-position memory (chosen; upgrade path to LRU keep-alive later without changing the tab data model).
- **Persistence**: URL query for the full tab list (rejected: unbounded URLs), sessionStorage (rejected: dies with the browser tab), localStorage (chosen).
- **Sidebar role**: keep project dropdown (rejected: cross-project opening stays two-step), all-projects grouped tree (chosen).
- **Subagent sessions**: opening a tab per subagent was considered and rejected — clicking a subagent navigates within the current tab (same as today), so a tab is not permanently bound to one session id; only fork opens a new tab.

## Amended: tab bar moves to the center column, below the tool top bar

**Date:** 2026-06-14

The tab bar originally shipped as a full-width row across the top of the
window, above the sidebar. It now renders as the **second row of the center
column** (sidebar right edge → right panel), below the 36px tool top bar.

- The sidebar stays visually full-height; the tab bar belongs to the chat
  area it switches, matching the VS Code / Windows Terminal mental model.
- The sidebar toggle button returned to its pre-tabs home: the left end of
  the tool top bar. `SessionTabBar` no longer receives sidebar props.
- Tabs cap at `maxWidth: 220px` so a long title cannot stretch the row;
  ellipsis + tooltip behavior is unchanged.
- Both the tab bar and the tool top bar keep their bottom border: two rows,
  two visual levels (navigation vs tooling).

Everything else in this ADR (data model, persistence, single ChatWindow
instance, URL mirroring) is unchanged.
