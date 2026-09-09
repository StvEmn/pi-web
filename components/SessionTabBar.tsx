"use client";

import type { SessionTab } from "@/lib/session-tabs";
import { useI18n } from "@/hooks/useI18n";

interface Props {
  tabs: readonly SessionTab[];
  activeId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  /** Map from sessionId → display name for the tab title. */
  sessionNames: Map<string, string>;
  /** Map from sessionId → full cwd for the tooltip. */
  sessionCwds: Map<string, string>;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
}

export function SessionTabBar({
  tabs,
  activeId,
  onActivate,
  onClose,
  sessionNames,
  sessionCwds,
  sidebarOpen,
  onSidebarToggle,
}: Props) {
  const { t: translate } = useI18n();
  return (
    <div
      style={{
        display: "flex",
        alignItems: "stretch",
        width: "100%",
        background: "var(--bg-panel)",
        borderBottom: "1px solid var(--border)",
        height: "calc(32px + env(safe-area-inset-top))",
        paddingTop: "env(safe-area-inset-top)",
        flexShrink: 0,
      }}
    >
      <button
        type="button"
        onClick={onSidebarToggle}
        title={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
        aria-label={sidebarOpen ? translate("sidebar.hide") : translate("sidebar.show")}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          width: 36,
          padding: 0,
          background: "none",
          border: "none",
          borderRight: "1px solid var(--border)",
          color: "var(--text-muted)",
          cursor: "pointer",
          flexShrink: 0,
          transition: "color 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.color = "var(--text)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.color = "var(--text-muted)";
        }}
      >
        {sidebarOpen ? (
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <rect x="3" y="3" width="18" height="18" rx="2" />
            <line x1="9" y1="3" x2="9" y2="21" />
          </svg>
        ) : (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          >
            <line x1="3" y1="6" x2="21" y2="6" />
            <line x1="3" y1="12" x2="21" y2="12" />
            <line x1="3" y1="18" x2="21" y2="18" />
          </svg>
        )}
      </button>

      {/* Tab list — role=tablist with role=tab children for ARIA semantics */}
      <div
        role="tablist"
        aria-label={translate("sessionTabs.ariaLabel")}
        style={{
          display: "flex",
          alignItems: "flex-end",
          overflow: "hidden",
          flex: 1,
          minWidth: 0,
        }}
      >
        {tabs.map((tab) => {
          const isActive = tab.id === activeId;
          const isDraft = tab.draftCwd !== undefined;
          const title = isDraft
            ? translate("sessionTabs.newTab")
            : tab.sessionId !== undefined
              ? sessionNames.get(tab.sessionId) ?? tab.sessionId
              : "";
          const cwd = isDraft ? tab.draftCwd : sessionCwds.get(tab.sessionId ?? "") ?? "";
          return (
            <div
              key={tab.id}
              role="tab"
              aria-selected={isActive}
              aria-label={title}
              title={cwd || title}
              onClick={() => onActivate(tab.id)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 4,
                height: "100%",
                padding: "0 8px 0 12px",
                cursor: "pointer",
                flexShrink: 1,
                minWidth: 0,
                borderRight: "1px solid var(--border)",
                background: isActive ? "var(--bg)" : "transparent",
                color: isActive ? "var(--text)" : "var(--text-muted)",
                transition: "background 0.1s, color 0.1s",
                fontSize: 12,
              }}
              onMouseEnter={(e) => {
                if (!isActive) e.currentTarget.style.background = "var(--bg-hover)";
              }}
              onMouseLeave={(e) => {
                if (!isActive) e.currentTarget.style.background = "transparent";
              }}
            >
              <span
                style={{
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                  minWidth: 0,
                }}
              >
                {title}
              </span>
              <button
                type="button"
                aria-label={translate("sessionTabs.closeTabNamed", { title })}
                title={translate("sessionTabs.closeTabNamed", { title })}
                onClick={(e) => {
                  e.stopPropagation();
                  onClose(tab.id);
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  width: 18,
                  height: 18,
                  padding: 0,
                  background: "none",
                  border: "none",
                  borderRadius: 3,
                  color: "var(--text-muted)",
                  cursor: "pointer",
                  flexShrink: 0,
                  fontSize: 11,
                  lineHeight: 1,
                  transition: "background 0.1s, color 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-selected)";
                  e.currentTarget.style.color = "var(--text)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                ✕
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
