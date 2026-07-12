import { useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Activity,
  ChevronRight,
  Database,
  FileClock,
  LogOut,
  Menu,
  ShieldCheck,
  Sparkles,
  Trash2,
  Users,
  X,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Navigate, NavLink, Route, Routes, useNavigate, useParams } from "react-router-dom";
import type { AdminClient } from "./api";
import { clearInspectorToken } from "./auth";
import { ConfirmDialog } from "./components/ConfirmDialog";
import type { Page, ScopeItem } from "./types";
import { AuditView } from "./views/AuditView";
import { CandidatesView } from "./views/CandidatesView";
import { MemoriesView } from "./views/MemoriesView";
import { TraceView } from "./views/TraceView";

const TABS = [
  { id: "memories", icon: Database, label: "Memories" },
  { id: "candidates", icon: Sparkles, label: "Candidates" },
  { id: "trace", icon: Activity, label: "Recall trace" },
  { id: "audit", icon: FileClock, label: "Audit" },
] as const;

export function App({ api }: { api: AdminClient }) {
  const descriptor = useQuery({ queryKey: ["descriptor"], queryFn: api.descriptor });
  const scopes = useInfiniteQuery({
    getNextPageParam: (page: Page<ScopeItem>) => page.nextCursor ?? null,
    initialPageParam: "",
    queryFn: ({ pageParam }): Promise<Page<ScopeItem>> =>
      api.scopes(pageParam || undefined),
    queryKey: ["scopes"],
  });
  const scopeItems = useMemo(
    () => scopes.data?.pages.flatMap((page) => page.items) ?? [],
    [scopes.data],
  );
  if (descriptor.isLoading || scopes.isLoading) {
    return <div className="boot-state"><Database size={22} /> Opening Inspector...</div>;
  }
  if (descriptor.isError || scopes.isError) {
    return (
      <div className="auth-state">
        <ShieldCheck size={28} />
        <h1>Inspector access failed</h1>
        <p>{descriptor.error?.message ?? scopes.error?.message}</p>
        <button className="button primary" onClick={() => window.location.reload()}>Retry</button>
      </div>
    );
  }
  if (!descriptor.data || !scopes.data) {
    return <div className="boot-state"><Database size={22} /> Opening Inspector...</div>;
  }
  return (
    <Routes>
      <Route
        path="/"
        element={
          scopeItems[0]
            ? <Navigate replace to={scopePath(scopeItems[0].scopeKey, "memories")} />
            : <InspectorShell api={api} readOnly={descriptor.data.readOnly} scopes={[]} />
        }
      />
      <Route
        path="/scopes/:scopeKey/:tab"
        element={
          <InspectorShell
            api={api}
            hasMoreScopes={scopes.hasNextPage}
            isLoadingMoreScopes={scopes.isFetchingNextPage}
            onLoadMoreScopes={() => scopes.fetchNextPage()}
            readOnly={descriptor.data.readOnly}
            scopes={scopeItems}
          />
        }
      />
      <Route path="*" element={<Navigate replace to="/" />} />
    </Routes>
  );
}

function InspectorShell({
  api,
  hasMoreScopes = false,
  isLoadingMoreScopes = false,
  onLoadMoreScopes,
  readOnly,
  scopes,
}: {
  api: AdminClient;
  hasMoreScopes?: boolean;
  isLoadingMoreScopes?: boolean;
  onLoadMoreScopes?: () => Promise<unknown>;
  readOnly: boolean;
  scopes: ScopeItem[];
}) {
  const { scopeKey, tab = "memories" } = useParams();
  const scope = scopes.find((item) => item.scopeKey === scopeKey);
  const [mobileNav, setMobileNav] = useState(false);
  const [deleteScope, setDeleteScope] = useState(false);
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const users = useMemo(() => groupScopes(scopes), [scopes]);

  useEffect(() => setMobileNav(false), [scopeKey, tab]);

  return (
    <div className="app-shell">
      <header className="topbar">
        <button
          aria-label="Open scope navigation"
          className="icon-button mobile-only"
          onClick={() => setMobileNav(true)}
        >
          <Menu size={19} />
        </button>
        <div className="brand-mark"><Database size={18} /></div>
        <div className="brand-copy">
          <strong>GoodMemory</strong>
          <span>Inspector</span>
        </div>
        <div className={`mode-indicator ${readOnly ? "readonly" : "writable"}`}>
          <span /> {readOnly ? "Read only" : "Local admin"}
        </div>
        <button
          className="icon-button sign-out"
          onClick={() => {
            clearInspectorToken();
            window.location.reload();
          }}
          title="Clear session token"
        >
          <LogOut size={17} />
        </button>
      </header>

      <aside className={`sidebar ${mobileNav ? "open" : ""}`}>
        <div className="sidebar-mobile-head mobile-only">
          <strong>Users & scopes</strong>
          <button aria-label="Close scope navigation" className="icon-button" onClick={() => setMobileNav(false)}>
            <X size={18} />
          </button>
        </div>
        <div className="sidebar-title"><Users size={15} /> Users & scopes</div>
        <nav className="scope-nav">
          {users.map(([userId, userScopes]) => (
            <section className="user-group" key={userId}>
              <div className="user-label"><span>{initials(userId)}</span><strong>{userId}</strong></div>
              {userScopes.map((item) => (
                <NavLink
                  className={({ isActive }) => `scope-link ${isActive ? "active" : ""}`}
                  key={item.scopeKey}
                  to={scopePath(item.scopeKey, tab)}
                >
                  <span className="scope-line">
                    {scopeLabel(item)}
                    <ChevronRight size={14} />
                  </span>
                  <small>{item.totalRecords} records · {item.coverage}</small>
                </NavLink>
              ))}
            </section>
          ))}
        </nav>
        {hasMoreScopes && onLoadMoreScopes && (
          <div className="pagination-row sidebar-pagination">
            <button
              className="button secondary"
              disabled={isLoadingMoreScopes}
              onClick={() => void onLoadMoreScopes()}
            >
              {isLoadingMoreScopes ? "Loading..." : "Load more scopes"}
            </button>
          </div>
        )}
      </aside>
      {mobileNav && <button aria-label="Close navigation" className="sidebar-scrim" onClick={() => setMobileNav(false)} />}

      <main className="content">
        {!scope ? (
          <div className="empty-state large">
            <Users size={24} />
            <h1>No durable scopes found</h1>
            <p>Scopes appear after GoodMemory records a memory or catalogs an existing store.</p>
          </div>
        ) : (
          <>
            <header className="scope-header">
              <div>
                <div className="scope-eyebrow">
                  {scope.coverage === "partial" && <span className="tag warning">partial coverage</span>}
                  <span>{scope.totalRecords} records</span>
                  {scope.lastUpdatedAt && <span>updated {new Date(scope.lastUpdatedAt).toLocaleString()}</span>}
                </div>
                <h1>{scope.scope.userId}</h1>
                <p>{scopeLabel(scope)} · <code>{scope.scopeKey}</code></p>
              </div>
              {!readOnly && (
                <button className="button danger-outline" onClick={() => setDeleteScope(true)}>
                  <Trash2 size={15} /> Delete scope
                </button>
              )}
            </header>
            <nav className="tabbar" aria-label="Scope views">
              {TABS.map(({ id, icon: Icon, label }) => (
                <NavLink className={tab === id ? "active" : ""} key={id} to={scopePath(scope.scopeKey, id)}>
                  <Icon size={16} /> <span>{label}</span>
                </NavLink>
              ))}
            </nav>
            {tab === "memories" && <MemoriesView api={api} readOnly={readOnly} scopeKey={scope.scopeKey} />}
            {tab === "candidates" && <CandidatesView api={api} readOnly={readOnly} scopeKey={scope.scopeKey} />}
            {tab === "trace" && <TraceView api={api} scopeKey={scope.scopeKey} />}
            {tab === "audit" && <AuditView api={api} scopeKey={scope.scopeKey} />}
          </>
        )}
      </main>

      {scope && deleteScope && (
        <ConfirmDialog
          confirmLabel="Delete scope"
          danger
          description={`${scope.scope.userId} · ${scope.totalRecords} durable records`}
          onCancel={() => setDeleteScope(false)}
          onConfirm={async () => {
            await api.deleteScope(scope);
            await queryClient.invalidateQueries({ queryKey: ["scopes"] });
            setDeleteScope(false);
            navigate("/");
          }}
          title="Delete this entire scope?"
          verificationLabel="I understand this cascades across durable, runtime, and indexed memory for the exact scope."
        />
      )}
    </div>
  );
}

function groupScopes(scopes: ScopeItem[]): Array<[string, ScopeItem[]]> {
  const groups = new Map<string, ScopeItem[]>();
  for (const scope of scopes) {
    groups.set(scope.scope.userId, [...(groups.get(scope.scope.userId) ?? []), scope]);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right));
}

function scopePath(scopeKey: string, tab: string): string {
  return `/scopes/${encodeURIComponent(scopeKey)}/${tab}`;
}

function scopeLabel(scope: ScopeItem): string {
  return scope.scope.workspaceId ?? scope.scope.tenantId ?? scope.scope.agentId ?? "Default scope";
}

function initials(value: string): string {
  return value.split(/[^A-Za-z0-9]+/u).filter(Boolean).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "U";
}
