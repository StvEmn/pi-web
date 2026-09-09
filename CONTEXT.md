# Pi Web

Pi Web hosts coding-agent sessions for user-selected projects while keeping the web server's runtime concerns separate from project work.

## Language

**Session Tab（会话标签页）**:
A top-level browser-style tab that opens when the user selects a session, holding one session view at a time. Draft sessions (no message sent yet) appear as tabs too. Tabs are views, not sessions: closing a tab never stops the session.
_Avoid_: Project tab, chat tab, panel tab (panel tab = the existing right-side file/terminal TabBar)

**Host Runtime Environment**:
The environment owned by the Pi Web server and its framework runtime.
_Avoid_: Project environment, shell environment

**Project Command Environment**:
The environment presented to a command that Pi Web runs on behalf of a user-selected project.
_Avoid_: Host environment, inherited environment

**Built-in Project Shell**:
A shell entry point owned and operated by Pi Web for commands associated with a project.
_Avoid_: Extension shell, arbitrary child process