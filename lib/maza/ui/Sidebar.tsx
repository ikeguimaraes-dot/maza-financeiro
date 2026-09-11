"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from "react";
import { ChevronDown, ChevronRight, Check, LogOut } from "lucide-react";
import { useAuth, useUnit } from "@maza/auth/context";
import { flattenHrefs, type NavGroup, type NavItem } from "./nav/types";

function getZone(pathname: string): string {
  if (pathname === "/orquestrador" || pathname.startsWith("/orquestrador/")) {
    return "inteligencia";
  }
  const match = pathname.match(/^\/(financeiro|pessoas|operacao|compras|comercial|marca|inteligencia)(?:\/|$)/);
  return match?.[1] ?? "shell";
}

function getNavigationHref(href: string | undefined, pathname: string, shellUrl: string): string {
  if (!href) return "#";
  if (getZone(href) === getZone(pathname)) return href;
  return shellUrl ? `${shellUrl}${href}` : href;
}

function NavigationLink({
  href,
  pathname,
  shellUrl,
  children,
  style,
}: {
  href?: string;
  pathname: string;
  shellUrl: string;
  children: ReactNode;
  style?: CSSProperties;
}) {
  const destination = getNavigationHref(href, pathname, shellUrl);
  return <a href={destination} style={style}>{children}</a>;
}

const STORAGE_KEY = "maza_sidebar_groups";

// ── Main Sidebar component ──────────────────────────────────────────────────

export function Sidebar(props: {
  navGroups: NavGroup[];
  shellUrl: string;
  navOffline: boolean;
}) {
  const { navGroups, shellUrl, navOffline } = props;
  const pathname = usePathname();
  const { user } = useAuth();
  const { hasRegisteredUnits } = useAuth();
  const { unit, units, setUnit } = useUnit();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const syncSessionCookie = () => {
      const cookies = document.cookie.split(";").map((item) => item.trim());
      const auth = cookies.find((item) =>
        item.startsWith("sb-") && item.slice(0, item.indexOf("=")).includes("auth-token"),
      );
      if (auth) {
        window.localStorage.setItem("kph_auth_browser_backup", auth);
        return;
      }
      const backup = window.localStorage.getItem("kph_auth_browser_backup");
      if (backup?.startsWith("sb-") && backup.includes("auth-token=")) {
        document.cookie = `${backup}; Path=/; Max-Age=2592000; SameSite=Lax`;
      }
    };
    syncSessionCookie();
    const timer = window.setInterval(syncSessionCookie, 250);
    return () => window.clearInterval(timer);
  }, []);

  // ── (a) Unit switcher click-outside handler
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  useEffect(() => {
    const onToggle = () => setMobileOpen((v) => !v);
    window.addEventListener("kph:toggleSidebar", onToggle);
    return () => window.removeEventListener("kph:toggleSidebar", onToggle);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
  }, [pathname]);

  const userRoles = useMemo(
    () => new Set<string>((user?.roles ?? []).map((entry) => entry.role)),
    [user?.roles],
  );
  const effectiveGroups = useMemo(() => {
    const hasFullAccess = userRoles.has("founder");
    const filterItem = (item: NavItem): NavItem | null => {
      if (!hasFullAccess && item.roles?.length && !item.roles.some((role) => userRoles.has(role))) {
        return null;
      }
      const children = item.children
        ?.map(filterItem)
        .filter((child): child is NavItem => child !== null);
      if (item.children && !children?.length) return null;
      return { ...item, children };
    };
    return navGroups
      .map((group) => ({
        ...group,
        items: group.items.map(filterItem).filter((item): item is NavItem => item !== null),
      }))
      .filter((group) => group.items.length > 0);
  }, [navGroups, userRoles]);

  const displayName = user?.displayName?.trim() || user?.email?.split("@")[0] || "—";
  const initials = displayName
    ? displayName.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase()
    : "?";
  const emailShort = user?.email
    ? user.email.length > 22
      ? user.email.slice(0, 19) + "…"
      : user.email
    : "—";
  const role = user?.roles[0]?.role ?? "—";

  return (
    <>
      <div
        className={`shell-backdrop ${mobileOpen ? "open" : ""}`}
        onClick={() => setMobileOpen(false)}
      />
      <aside
        className={`shell-sidebar ${mobileOpen ? "open" : ""}`}
        style={{
          width: 240, flexShrink: 0,
          background: "var(--sidebar)", borderRight: "1px solid var(--sidebar-border)",
          display: "flex", flexDirection: "column",
        }}
      >
        {/* Logo */}
        <div style={{ padding: "20px 16px 16px", borderBottom: "1px solid var(--sidebar-border)" }}>
          <div style={{ fontSize: 20, fontWeight: 700, color: "var(--text)", letterSpacing: -0.5 }}>
            Maza
          </div>
          <div style={{ fontSize: 10, color: "var(--text-3)", marginTop: 2, letterSpacing: 1.2, textTransform: "uppercase", fontWeight: 600 }}>
            Operations
          </div>
        </div>

        {navOffline && (
          <div
            title="Não foi possível carregar o menu do shell — mostrando apenas as rotas desta zona."
            style={{
              margin: "10px 16px 0", padding: "6px 10px", borderRadius: 8,
              background: "rgba(245,158,11,0.10)", border: "1px solid rgba(245,158,11,0.35)",
              color: "#F59E0B", fontSize: 10, fontWeight: 600, textAlign: "center",
            }}
          >
            Menu em modo offline
          </div>
        )}

        {/* (a) Unit switcher — unchanged */}
        <div style={{ padding: "12px 16px" }}>
          <div ref={ref} style={{ position: "relative" }}>
            <button
              onClick={() => setOpen((v) => !v)}
              disabled={units.length === 0}
              style={{
                width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                background: "var(--surface-2)", border: "1px solid var(--border)", borderRadius: 10,
                padding: "9px 12px", color: "var(--text)", fontSize: 13, fontWeight: 600,
                cursor: units.length ? "pointer" : "default",
                transition: "border-color var(--t)",
              }}
            >
              <span style={{ display: "flex", flexDirection: "column", alignItems: "flex-start", gap: 1, minWidth: 0 }}>
                <span style={{ fontSize: 9, color: "var(--text-3)", fontWeight: 700, letterSpacing: 0.8 }}>
                  UNIDADE
                </span>
                <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: 160 }}>
                  {unit?.name ?? (units.length ? "Selecionar…" : hasRegisteredUnits ? "Sem acesso" : "Nenhuma cadastrada")}
                </span>
              </span>
              <ChevronDown
                size={14}
                style={{ color: "var(--text-3)", transform: open ? "rotate(180deg)" : "none", transition: "transform var(--t)" }}
              />
            </button>
            {open && units.length > 0 && (
              <div
                style={{
                  position: "absolute", top: "calc(100% + 6px)", left: 0, right: 0, zIndex: 50,
                  background: "var(--surface-2)", border: "1px solid var(--border-strong)",
                  borderRadius: 10, padding: 4, boxShadow: "var(--shadow-lg)",
                }}
              >
                {units.map((u) => {
                  const active = u.id === unit?.id;
                  return (
                    <button
                      key={u.id}
                      onClick={() => { setUnit(u.id); setOpen(false); }}
                      style={{
                        width: "100%", display: "flex", alignItems: "center", justifyContent: "space-between",
                        gap: 8, padding: "9px 10px",
                        background: active ? "var(--surface-3)" : "transparent",
                        border: "none", borderRadius: 6, color: "var(--text)",
                        fontSize: 13, fontWeight: 500, cursor: "pointer",
                        textAlign: "left", transition: "background var(--t)",
                      }}
                    >
                      <span>{u.name}</span>
                      {active && <Check size={14} style={{ color: "var(--brand)" }} />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* (b) Navigation — driven by effectiveGroups */}
        <SidebarNav pathname={pathname} groups={effectiveGroups} shellUrl={shellUrl} />

        {/* (c) User footer — unchanged */}
        <div style={{ padding: "12px 14px", borderTop: "1px solid var(--sidebar-border)", display: "flex", alignItems: "center", gap: 10 }}>
          <div style={{ position: "relative" }}>
            <div
              style={{
                width: 32, height: 32, borderRadius: 99, background: "var(--brand-soft)",
                color: "var(--brand)", display: "flex", alignItems: "center", justifyContent: "center",
                fontWeight: 700, fontSize: 12,
              }}
            >
              {initials}
            </div>
            <span
              style={{
                position: "absolute", right: -1, bottom: -1,
                width: 10, height: 10, borderRadius: 99,
                background: "#22C55E", border: "2px solid var(--sidebar)",
              }}
            />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: "var(--text)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
              {displayName}
            </div>
            <div style={{ fontSize: 10, color: "var(--text-3)" }}>{role}</div>
          </div>
          <Link
            href="/auth/sign-out"
            title="Sair"
            style={{
              display: "inline-flex", alignItems: "center", justifyContent: "center",
              width: 28, height: 28, borderRadius: 6,
              color: "var(--text-3)", textDecoration: "none",
              transition: "color var(--t), background var(--t)",
            }}
          >
            <LogOut size={14} />
          </Link>
        </div>
      </aside>
    </>
  );
}

// ── SidebarNav ──────────────────────────────────────────────────────────────

function SidebarNav({ pathname, groups, shellUrl }: { pathname: string; groups: NavGroup[]; shellUrl: string }) {
  // Flatten all leaf hrefs for active-detection
  const allHrefs = useMemo(() => flattenHrefs(groups), [groups]);

  const activeHref = useMemo(() => {
    let best: string | null = null;
    let bestLen = -1;
    for (const it of allHrefs) {
      const matches = pathname === it.href || pathname.startsWith(it.href + "/");
      if (matches && it.href.length > bestLen) {
        best = it.href;
        bestLen = it.href.length;
      }
    }
    return best;
  }, [pathname, allHrefs]);

  const activeGroupId = useMemo(() => {
    if (!activeHref) return null;
    return allHrefs.find((it) => it.href === activeHref)?.groupId ?? null;
  }, [activeHref, allHrefs]);

  // Which sub-menu (item-with-children) contains the active href
  const activeSubKey = useMemo(() => {
    if (!activeHref) return null;
    for (const g of groups) {
      for (const it of g.items) {
        if (it.children?.some((c) => c.href === activeHref)) {
          return `${g.id}:${it.label}`;
        }
      }
    }
    return null;
  }, [activeHref, groups]);

  // Group open/close (persisted in localStorage)
  const [openMap, setOpenMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const g of groups) m[g.id] = g.defaultOpen;
    return m;
  });
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Record<string, boolean>;
        setOpenMap((prev) => ({ ...prev, ...parsed }));
      }
    } catch {}
    setHydrated(true);
  }, []);

  // When remote groups load, add any missing group IDs
  useEffect(() => {
    setOpenMap((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        if (next[g.id] === undefined) next[g.id] = g.defaultOpen;
      }
      return next;
    });
  }, [groups]);

  useEffect(() => {
    if (!activeGroupId) return;
    setOpenMap((prev) => (prev[activeGroupId] ? prev : { ...prev, [activeGroupId]: true }));
  }, [activeGroupId]);

  function toggleGroup(id: string) {
    setOpenMap((prev) => {
      const next = { ...prev, [id]: !prev[id] };
      try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch {}
      return next;
    });
  }

  // Sub-menu open/close (not persisted — driven by defaultOpen + active path)
  const [subOpenMap, setSubOpenMap] = useState<Record<string, boolean>>(() => {
    const m: Record<string, boolean> = {};
    for (const g of groups) {
      for (const it of g.items) {
        if (it.children && it.defaultOpen) m[`${g.id}:${it.label}`] = true;
      }
    }
    return m;
  });

  // When remote groups load, seed defaultOpen sub-menus
  useEffect(() => {
    setSubOpenMap((prev) => {
      const next = { ...prev };
      for (const g of groups) {
        for (const it of g.items) {
          if (it.children && it.defaultOpen) {
            const key = `${g.id}:${it.label}`;
            if (next[key] === undefined) next[key] = true;
          }
        }
      }
      return next;
    });
  }, [groups]);

  // Auto-open the sub-menu that contains the active page
  useEffect(() => {
    if (!activeSubKey) return;
    setSubOpenMap((prev) => (prev[activeSubKey] ? prev : { ...prev, [activeSubKey]: true }));
  }, [activeSubKey]);

  function toggleSub(key: string) {
    setSubOpenMap((prev) => ({ ...prev, [key]: !prev[key] }));
  }

  return (
    <nav className="sidebar-nav-scroll" style={{ flex: 1, padding: "8px 12px", display: "flex", flexDirection: "column", gap: 4, overflowY: "auto" }}>
      {groups.map((g) => {
        if (!g.habilitado) {
          return (
            <div
              key={g.id}
              aria-disabled="true"
              title="Módulo não habilitado"
              style={{
                display: "flex", alignItems: "center", gap: 8,
                padding: "10px 8px", fontSize: 10, fontWeight: 700,
                letterSpacing: 1.2, textTransform: "uppercase",
                color: "var(--text-3)", opacity: 0.45, cursor: "not-allowed",
              }}
            >
              {g.icon && <g.icon size={11} />}
              <span>{g.title}</span>
            </div>
          );
        }
        const isOpen = openMap[g.id] ?? g.defaultOpen;
        return (
          <details key={g.id} className="sidebar-disclosure" open={isOpen}
            onToggle={(event) => {
              const nextOpen = event.currentTarget.open;
              setOpenMap((prev) => prev[g.id] === nextOpen ? prev : { ...prev, [g.id]: nextOpen });
            }}
            style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {g.title ? (
              <summary
                style={{
                  display: "flex", alignItems: "center", gap: 8,
                  width: "100%", background: "transparent", border: "none",
                  padding: "10px 8px 4px", fontSize: 10, fontWeight: 700,
                  letterSpacing: 1.2, textTransform: "uppercase",
                  color: "var(--text-3)", cursor: "pointer", textAlign: "left",
                }}
              >
                {g.icon && <g.icon size={11} style={{ color: "var(--text-3)" }} />}
                <span style={{ flex: 1 }}>{g.title}</span>
                <ChevronRight
                  className="sidebar-disclosure-chevron"
                  size={12}
                  style={{
                    color: "var(--text-3)",
                    transition: hydrated ? "transform var(--t)" : "none",
                  }}
                />
              </summary>
            ) : (
              <summary aria-hidden="true" style={{ display: "none" }} />
            )}

            {g.items.map((it, idx) => {
              const Icon = it.icon;

              // Item with children = collapsible sub-menu
              if (it.children?.length) {
                const subKey = `${g.id}:${it.label}`;
                const subOpen = subOpenMap[subKey] ?? false;
                const anyChildActive = it.children.some(
                  (c) => c.href === activeHref || (c.href && pathname.startsWith(c.href + "/")),
                );
                return (
                  <details key={it.label + idx} className="sidebar-disclosure sidebar-subdisclosure" open={subOpen}
                    onToggle={(event) => {
                      const nextOpen = event.currentTarget.open;
                      setSubOpenMap((prev) => prev[subKey] === nextOpen ? prev : { ...prev, [subKey]: nextOpen });
                    }}>
                    <summary
                      style={{
                        display: "flex", alignItems: "center", gap: 12,
                        width: "100%", border: "none", borderRadius: 8,
                        padding: "9px 12px", cursor: "pointer", textAlign: "left",
                        background: anyChildActive && !subOpen ? "var(--surface-2)" : "transparent",
                        color: anyChildActive ? "var(--text)" : "var(--text-2)",
                        fontSize: 13, fontWeight: anyChildActive ? 600 : 500,
                        transition: "all var(--t)",
                      }}
                    >
                      <Icon
                        size={16}
                        strokeWidth={anyChildActive ? 2.2 : 1.8}
                        style={{ color: anyChildActive ? "var(--brand)" : "currentColor" }}
                      />
                      <span style={{ flex: 1 }}>{it.label}</span>
                      <ChevronRight
                        className="sidebar-disclosure-chevron"
                        size={12}
                        style={{
                          color: "var(--text-3)",
                          transition: hydrated ? "transform var(--t)" : "none",
                          flexShrink: 0,
                        }}
                      />
                    </summary>

                    {it.children.map((child) => {
                      const ChildIcon = child.icon;
                      const childActive = child.href === activeHref ||
                        (child.href ? pathname.startsWith(child.href + "/") : false);
                      return (
                        <NavigationLink
                          key={child.href ?? child.label}
                          href={child.href}
                          pathname={pathname}
                          shellUrl={shellUrl}
                          style={{
                            position: "relative",
                            display: "flex", alignItems: "center", gap: 10,
                            padding: "7px 12px 7px 36px",
                            borderRadius: 8, textDecoration: "none",
                            color: childActive ? "var(--text)" : "var(--text-2)",
                            background: childActive ? "var(--surface-2)" : "transparent",
                            fontSize: 12, fontWeight: childActive ? 600 : 400,
                            transition: "all var(--t)",
                          }}
                        >
                          {childActive && (
                            <span
                              style={{
                                position: "absolute", left: -12, top: 4, bottom: 4,
                                width: 3, background: "var(--brand)", borderRadius: "0 4px 4px 0",
                              }}
                            />
                          )}
                          <ChildIcon
                            size={13}
                            strokeWidth={childActive ? 2.2 : 1.8}
                            style={{ color: childActive ? "var(--brand)" : "currentColor", flexShrink: 0 }}
                          />
                          <span style={{ flex: 1 }}>{child.label}</span>
                        </NavigationLink>
                      );
                    })}
                  </details>
                );
              }

              // Regular leaf item
              const active = it.href === activeHref;
              return (
                <NavigationLink
                  key={it.href ?? it.label + idx}
                  href={it.href}
                  pathname={pathname}
                  shellUrl={shellUrl}
                  style={{
                    position: "relative",
                    display: "flex", alignItems: "center", gap: 12,
                    padding: "9px 12px", borderRadius: 8, textDecoration: "none",
                    color: active ? "var(--text)" : "var(--text-2)",
                    background: active ? "var(--surface-2)" : "transparent",
                    fontSize: 13, fontWeight: active ? 600 : 500,
                    transition: "all var(--t)",
                  }}
                >
                  {active && (
                    <span
                      style={{
                        position: "absolute", left: -12, top: 6, bottom: 6,
                        width: 3, background: "var(--brand)", borderRadius: "0 4px 4px 0",
                      }}
                    />
                  )}
                  <Icon
                    size={16}
                    strokeWidth={active ? 2.2 : 1.8}
                    style={{ color: active ? "var(--brand)" : "currentColor" }}
                  />
                  <span style={{ flex: 1 }}>{it.label}</span>
                </NavigationLink>
              );
            })}
          </details>
        );
      })}
    </nav>
  );
}
