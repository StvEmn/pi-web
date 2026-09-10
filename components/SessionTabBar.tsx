"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { SessionTab, TabTitleContext } from "@/lib/session-tabs";
import { tabDisplayTitle } from "@/lib/session-tabs";
import { useI18n } from "@/hooks/useI18n";
import { useIsMobile } from "@/hooks/useIsMobile";

interface Props {
  tabs: readonly SessionTab[];
  activeId: string | null;
  onActivate: (tabId: string) => void;
  onClose: (tabId: string) => void;
  onCloseOthers: (tabId: string) => void;
  onCloseRight: (tabId: string) => void;
  /** Session ids with an in-flight run — shown as a small dot on the tab. */
  runningSessionIds: ReadonlySet<string>;
  /** Map from sessionId → display name for the tab title. */
  sessionNames: Map<string, string>;
  /** Map from sessionId → full cwd for the tooltip. */
  sessionCwds: Map<string, string>;
  sidebarOpen: boolean;
  onSidebarToggle: () => void;
}

type MenuState = { tabId: string; x: number; y: number };

export function SessionTabBar({
  tabs,
  activeId,
  onActivate,
  onClose,
  onCloseOthers,
  onCloseRight,
  runningSessionIds,
  sessionNames,
  sessionCwds,
  sidebarOpen,
  onSidebarToggle,
}: Props) {
  const { t: translate } = useI18n();
  const isMobile = useIsMobile();

  const titleCtx = useMemo<TabTitleContext>(
    () => ({ tabs, sessionNames, sessionCwds }),
    [tabs, sessionNames, sessionCwds],
  );

  // Roving tabindex: tab elements by id, for focusing after arrow-key moves.
  const tabRefs = useRef(new Map<string, HTMLDivElement>());
  // Context menu state + focus return target (the tab that opened it).
  const [menu, setMenu] = useState<MenuState | null>(null);
  const menuOpenerRef = useRef<HTMLDivElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  // Focus the first menu item when the menu opens.
  useEffect(() => {
    if (menu) menuRef.current?.querySelector<HTMLButtonElement>("button")?.focus();
  }, [menu]);

  const closeMenu = (restoreFocus: boolean) => {
    setMenu(null);
    if (restoreFocus) menuOpenerRef.current?.focus();
    menuOpenerRef.current = null;
  };

  const runMenuAction = (action: "close" | "closeOthers" | "closeRight") => {
    const tabId = menu?.tabId;
    closeMenu(true);
    if (!tabId) return;
    if (action === "close") onClose(tabId);
    else if (action === "closeOthers") onCloseOthers(tabId);
    else onCloseRight(tabId);
  };

  const openMenuFor = (tab: SessionTab, el: HTMLDivElement, x: number, y: number) => {
    menuOpenerRef.current = el;
    setMenu({ tabId: tab.id, x, y });
  };

  const handleTablistKeyDown = (e: React.KeyboardEvent) => {
    if (tabs.length === 0) return;
    const idx = tabs.findIndex((t) => t.id === activeId);
    let next = -1;
    if (e.key === "ArrowLeft") next = idx <= 0 ? tabs.length - 1 : idx - 1;
    else if (e.key === "ArrowRight") next = idx === -1 || idx === tabs.length - 1 ? 0 : idx + 1;
    else if (e.key === "Home") next = 0;
    else if (e.key === "End") next = tabs.length - 1;
    if (next === -1) return;
    e.preventDefault();
    const target = tabs[next];
    onActivate(target.id);
    tabRefs.current.get(target.id)?.focus();
  };

  const menuItems: Array<{ action: "close" | "closeOthers" | "closeRight"; label: string }> = [
    { action: "close", label: translate("sessionTabs.close") },
    { action: "closeOthers", label: translate("sessionTabs.closeOthers") },
    { action: "closeRight", label: translate("sessionTabs.closeRight") },
  ];

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

      {/* Tab list — role=tablist with role=tab children for ARIA semantics.
          Roving tabindex: only the active tab is tabbable; arrow keys move
          both selection and DOM focus. */}
      <div
        role="tablist"
        aria-label={translate("sessionTabs.ariaLabel")}
        onKeyDown={handleTablistKeyDown}
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
          const info = tabDisplayTitle(tab, titleCtx);
          const rawTitle = isDraft ? translate("sessionTabs.newTab") : (info.title ?? "");
          const displayTitle = info.projectPrefix
            ? `${info.projectPrefix} · ${rawTitle}`
            : rawTitle;
          const tooltip = info.cwd ? `${displayTitle}\n${info.cwd}` : displayTitle;
          const isRunning =
            !isDraft && tab.sessionId !== undefined && runningSessionIds.has(tab.sessionId);
          return (
            <div
              key={tab.id}
              ref={(el) => {
                if (el) tabRefs.current.set(tab.id, el);
                else tabRefs.current.delete(tab.id);
              }}
              role="tab"
              aria-selected={isActive}
              aria-label={displayTitle}
              title={tooltip}
              tabIndex={isActive ? 0 : -1}
              onClick={() => onActivate(tab.id)}
              onContextMenu={(e) => {
                e.preventDefault();
                openMenuFor(tab, e.currentTarget, e.clientX, e.clientY);
              }}
              onKeyDown={(e) => {
                // Keyboard-equivalent of right-click (WAI-ARIA pattern).
                if (e.key === "ContextMenu" || (e.key === "F10" && e.shiftKey)) {
                  e.preventDefault();
                  const rect = e.currentTarget.getBoundingClientRect();
                  openMenuFor(tab, e.currentTarget, rect.left, rect.bottom);
                }
              }}
              style={{
                display: "flex",
                alignItems: "center",
                gap: isMobile ? 2 : 4,
                height: "100%",
                padding: isMobile ? "0 4px 0 8px" : "0 8px 0 12px",
                cursor: "pointer",
                flexShrink: 1,
                minWidth: 36,
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
                {displayTitle}
              </span>
              {isRunning && (
                <span
                  aria-label={translate("sessionTabs.running")}
                  title={translate("sessionTabs.running")}
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: "50%",
                    background: "#4ade80",
                    flexShrink: 0,
                  }}
                />
              )}
              <button
                type="button"
                aria-label={translate("sessionTabs.closeTabNamed", { title: displayTitle })}
                title={translate("sessionTabs.closeTabNamed", { title: displayTitle })}
                tabIndex={-1}
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

      {/* Tab context menu — opened via right-click or Menu/Shift+F10 */}
      {menu && (
        <>
          <div
            onClick={() => closeMenu(false)}
            style={{ position: "fixed", inset: 0, zIndex: 599 }}
          />
          <div
            ref={menuRef}
            role="menu"
            aria-label={translate("sessionTabs.contextMenu")}
            onKeyDown={(e) => {
              const items = Array.from(
                menuRef.current?.querySelectorAll<HTMLButtonElement>("button") ?? [],
              );
              const current = items.indexOf(document.activeElement as HTMLButtonElement);
              if (e.key === "Escape") {
                e.preventDefault();
                closeMenu(true);
              } else if (e.key === "ArrowDown") {
                e.preventDefault();
                items[(current + 1) % items.length]?.focus();
              } else if (e.key === "ArrowUp") {
                e.preventDefault();
                items[(current - 1 + items.length) % items.length]?.focus();
              } else if (e.key === "Home") {
                e.preventDefault();
                items[0]?.focus();
              } else if (e.key === "End") {
                e.preventDefault();
                items[items.length - 1]?.focus();
              }
            }}
            style={{
              position: "fixed",
              left: menu.x,
              top: menu.y,
              zIndex: 600,
              background: "var(--bg-panel)",
              border: "1px solid var(--border)",
              borderRadius: 4,
              padding: 4,
              minWidth: 160,
              boxShadow: "0 4px 12px rgba(0,0,0,0.25)",
            }}
          >
            {menuItems.map(({ action, label }) => (
              <button
                key={action}
                type="button"
                role="menuitem"
                tabIndex={-1}
                onClick={() => runMenuAction(action)}
                style={{
                  display: "block",
                  width: "100%",
                  padding: "6px 10px",
                  border: "none",
                  borderRadius: 3,
                  background: "none",
                  color: "var(--text)",
                  cursor: "pointer",
                  textAlign: "left",
                  fontSize: 12,
                  whiteSpace: "nowrap",
                  transition: "background 0.1s",
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "none";
                }}
              >
                {label}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
