import { useState, useEffect } from "react";
import { Shield, Users, Zap, Database, Key, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { formatDistanceToNow } from "date-fns";

const BASE = import.meta.env.BASE_URL.replace(/\/$/, "");

async function fetchAdmin<T>(path: string): Promise<T> {
  const res = await fetch(`${BASE}${path}`, { credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error ?? res.statusText);
  }
  return res.json();
}

function StatCard({ title, value, sub }: { title: string; value: string | number; sub?: string }) {
  return (
    <div className="ds-panel p-4 rounded-xl">
      <div className="pb-1">
        <p className="text-[10px] font-mono font-bold text-on-surface-variant/40 uppercase tracking-widest">
          {title}
        </p>
      </div>
      <div className="pt-1">
        <p className="text-2xl font-display font-bold text-on-surface">{value}</p>
        {sub && <p className="text-[10px] font-mono text-on-surface-variant/60 uppercase mt-0.5">{sub}</p>}
      </div>
    </div>
  );
}

function RowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b border-outline-variant">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton className="h-4 w-full bg-surface-container-highest" />
        </td>
      ))}
    </tr>
  );
}

interface OverviewData {
  totalUsers: number;
  generationsToday: number;
  generationsWeek: number;
  generationsAllTime: number;
  totalCostUsd: number;
  cacheHitRate7d: number;
  activeSubscriptions: number;
}

function OverviewTab() {
  const { data, isLoading, error, refetch } = useQuery<OverviewData>({
    queryKey: ["admin", "overview"],
    queryFn: () => fetchAdmin("/api/admin/overview"),
    refetchInterval: 30_000,
  });

  if (error) {
    return (
      <div className="flex items-center gap-2 text-error text-sm p-4 font-mono uppercase">
        <AlertTriangle className="w-4 h-4" />
        Failed to load overview
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-display font-bold tracking-widest uppercase text-on-surface">System Overview</h2>
        <Button variant="ghost" size="sm" className="h-7 text-[10px] font-mono uppercase tracking-widest gap-1 text-on-surface-variant hover:text-on-surface" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <div key={i} className="ds-panel p-4 rounded-xl">
              <Skeleton className="h-3 w-24 bg-surface-container-highest" />
              <Skeleton className="h-7 w-16 mt-2 bg-surface-container-highest" />
            </div>
          ))
        ) : (
          <>
            <StatCard title="Total Users" value={data!.totalUsers} />
            <StatCard title="Generations Today" value={data!.generationsToday} />
            <StatCard title="Generations This Week" value={data!.generationsWeek} />
            <StatCard title="Generations All-Time" value={data!.generationsAllTime} />
            <StatCard
              title="Total Est. Cost"
              value={`$${data!.totalCostUsd.toFixed(2)}`}
              sub="all time"
            />
            <StatCard
              title="Cache Hit Rate"
              value={`${data!.cacheHitRate7d}%`}
              sub="last 7 days"
            />
            <StatCard title="Active Subscriptions" value={data!.activeSubscriptions} sub="pro plan" />
          </>
        )}
      </div>

      <div className="ds-panel mt-2 p-4 rounded-xl">
        <div className="pb-2">
          <p className="text-[10px] font-mono font-bold text-on-surface-variant/40 uppercase tracking-widest">Promote a user to admin</p>
        </div>
        <div>
          <p className="text-xs text-on-surface-variant/60 mb-3 font-medium">
            Run this SQL command against the database to promote a user:
          </p>
          <pre className="bg-surface-container-low rounded text-[11px] p-3 font-mono text-primary-accent border border-outline-variant select-all overflow-x-auto">
            {"UPDATE users SET is_admin = true WHERE email = 'you@example.com';"}
          </pre>
        </div>
      </div>
    </div>
  );
}

interface UserRow {
  id: string;
  email: string | null;
  firstName: string | null;
  lastName: string | null;
  plan: "free" | "pro";
  isAdmin: boolean;
  apiKeyCount: number;
  monthlyRequests: number;
  monthlyCostUsd: number;
  lastActive: string;
  createdAt: string;
}

function UsersTab() {
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  const { data, isLoading, error } = useQuery<{ users: UserRow[]; total: number }>({
    queryKey: ["admin", "users", debouncedSearch],
    queryFn: () =>
      fetchAdmin(`/api/admin/users?search=${encodeURIComponent(debouncedSearch)}&limit=50`),
    refetchInterval: 30_000,
  });

  function handleSearch(v: string) {
    setSearch(v);
    clearTimeout((handleSearch as unknown as { _t?: ReturnType<typeof setTimeout> })._t);
    (handleSearch as unknown as { _t?: ReturnType<typeof setTimeout> })._t = setTimeout(
      () => setDebouncedSearch(v),
      350,
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Input
          placeholder="Search by email or name…"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          className="h-8 text-xs max-w-xs bg-surface-container-low border-outline-variant focus:border-primary-accent"
        />
        {data && (
          <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">{data.total} users</span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-error text-sm font-mono uppercase">
          <AlertTriangle className="w-4 h-4" />
          Failed to load users
        </div>
      )}

      <div className="ds-panel border border-outline-variant rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-container-high border-b border-outline-variant">
            <tr>
              {["Email / Name", "Plan", "API Keys", "Requests (mo)", "Cost (mo)", "Last Active"].map(
                (h) => (
                  <th key={h} className="text-left px-3 py-2 font-mono font-bold text-on-surface-variant/40 uppercase tracking-widest">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-on-surface-variant/40 font-mono uppercase">
                    No users found
                  </td>
                </tr>
              ) : (
                data?.users.map((u) => (
                  <tr key={u.id} className="hover:bg-on-surface/5 transition-colors">
                    <td className="px-3 py-3">
                      <div className="font-bold text-on-surface">{u.email ?? "—"}</div>
                      <div className="text-[10px] text-on-surface-variant/60 font-medium">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={u.plan === "pro" ? "default" : "secondary"}
                          className={cn(
                            "text-[9px] px-1.5 py-0 uppercase font-mono tracking-wider",
                            u.plan === "pro" ? "bg-primary-accent text-surface" : "bg-surface-container-highest text-on-surface-variant"
                          )}
                        >
                          {u.plan}
                        </Badge>
                        {u.isAdmin && (
                          <Badge variant="outline" className="text-[9px] px-1.5 py-0 border-primary-accent text-primary-accent uppercase font-mono tracking-wider">
                            admin
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">{u.apiKeyCount}</td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">{u.monthlyRequests.toLocaleString()}</td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">${u.monthlyCostUsd.toFixed(4)}</td>
                    <td className="px-3 py-3 text-[10px] text-on-surface-variant/60 font-mono uppercase">
                      {u.lastActive
                        ? formatDistanceToNow(new Date(u.lastActive), { addSuffix: true })
                        : "—"}
                    </td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface GenerationRow {
  id: number;
  promptTruncated: string;
  filename: string;
  modelUsed: string | null;
  tokenCountPrompt: number | null;
  tokenCountCompletion: number | null;
  costUsd: number | null;
  cacheHit: boolean;
  createdAt: string;
}

function GenerationsTab() {
  const [page, setPage] = useState(1);
  const limit = 50;

  const { data, isLoading, error } = useQuery<{ generations: GenerationRow[]; total: number }>({
    queryKey: ["admin", "generations", page],
    queryFn: () => fetchAdmin(`/api/admin/generations?page=${page}&limit=${limit}`),
    refetchInterval: 30_000,
  });

  const totalPages = data ? Math.ceil(data.total / limit) : 1;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">
          {data ? `${data.total.toLocaleString()} total generations` : "Loading…"}
        </span>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] font-mono uppercase tracking-widest border-outline-variant text-on-surface-variant hover:text-on-surface"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="text-[10px] font-mono text-on-surface-variant/60">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-[10px] font-mono uppercase tracking-widest border-outline-variant text-on-surface-variant hover:text-on-surface"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-error text-sm font-mono uppercase">
          <AlertTriangle className="w-4 h-4" />
          Failed to load generations
        </div>
      )}

      <div className="ds-panel border border-outline-variant rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-container-high border-b border-outline-variant">
            <tr>
              {["Prompt", "Model", "Tokens", "Cost", "Cache", "Time"].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-mono font-bold text-on-surface-variant/40 uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : data?.generations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-on-surface-variant/40 font-mono uppercase">
                    No generations yet
                  </td>
                </tr>
              ) : (
                data?.generations.map((g) => (
                  <tr key={g.id} className="hover:bg-on-surface/5 transition-colors">
                    <td className="px-3 py-3 max-w-[280px]">
                      <span className="line-clamp-2 text-on-surface-variant font-medium leading-relaxed">{g.promptTruncated}</span>
                    </td>
                    <td className="px-3 py-3 font-mono text-[10px] text-on-surface-variant/80">{g.modelUsed ?? "—"}</td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">
                      {g.tokenCountPrompt != null && g.tokenCountCompletion != null
                        ? `${(g.tokenCountPrompt + g.tokenCountCompletion).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">
                      {g.costUsd != null ? `$${g.costUsd.toFixed(4)}` : "—"}
                    </td>
                    <td className="px-3 py-3">
                      {g.cacheHit ? (
                        <Badge variant="secondary" className="text-[9px] px-1.5 py-0 bg-green/10 text-green font-mono uppercase tracking-widest border border-green/20">
                          HIT
                        </Badge>
                      ) : (
                        <span className="text-[9px] text-on-surface-variant/40 font-mono uppercase tracking-widest">miss</span>
                      )}
                    </td>
                    <td className="px-3 py-3 text-[10px] text-on-surface-variant/60 font-mono uppercase whitespace-nowrap">
                      {formatDistanceToNow(new Date(g.createdAt), { addSuffix: true })}
                    </td>
                  </tr>
                ))
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

interface CacheData {
  rowCount: number;
  hitRate7d: number;
  avgSimilarityOnHits: number | null;
  largestPrompts: { prompt: string; hitCount: number; similarityTokens: number }[];
}

function CacheTab() {
  const { data, isLoading, error } = useQuery<CacheData>({
    queryKey: ["admin", "cache"],
    queryFn: () => fetchAdmin("/api/admin/cache"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-4">
      {error && (
        <div className="flex items-center gap-2 text-error text-sm font-mono uppercase">
          <AlertTriangle className="w-4 h-4" />
          Failed to load cache stats
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="ds-panel p-4 rounded-xl">
              <Skeleton className="h-3 w-20 bg-surface-container-highest" />
              <Skeleton className="h-7 w-14 mt-2 bg-surface-container-highest" />
            </div>
          ))
        ) : (
          <>
            <StatCard title="Cached Entries" value={data!.rowCount.toLocaleString()} />
            <StatCard title="Hit Rate (7d)" value={`${data!.hitRate7d}%`} />
            <StatCard
              title="Avg Similarity"
              value={data!.avgSimilarityOnHits != null ? data!.avgSimilarityOnHits.toFixed(4) : "—"}
              sub="on hits"
            />
          </>
        )}
      </div>

      <div>
        <h3 className="text-[10px] font-mono font-bold mb-3 text-on-surface-variant/40 uppercase tracking-[0.2em]">
          Largest Cached Prompts
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full bg-surface-container-highest" />
            ))}
          </div>
        ) : data?.largestPrompts.length === 0 ? (
          <p className="text-xs text-on-surface-variant/40 font-mono uppercase">No cached entries yet</p>
        ) : (
          <div className="ds-panel border border-outline-variant rounded-xl overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-surface-container-high border-b border-outline-variant">
                <tr>
                  {["Prompt", "Hits", "Tokens"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-mono font-bold text-on-surface-variant/40 uppercase tracking-widest">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-outline-variant">
                {data?.largestPrompts.map((p, i) => (
                  <tr key={i} className="hover:bg-on-surface/5 transition-colors">
                    <td className="px-3 py-3 max-w-[400px] text-on-surface-variant font-medium leading-relaxed">{p.prompt}</td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">{p.hitCount}</td>
                    <td className="px-3 py-3 font-mono text-on-surface-variant">{p.similarityTokens}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

interface ApiKeyRow {
  id: number;
  userId: string;
  name: string;
  keyPrefix: string;
  monthlyLimit: number;
  lastUsedAt: string | null;
  createdAt: string;
  owner: { email: string | null; firstName: string | null; lastName: string | null };
  thisMonth: { requests: number; tokens: number; costUsd: number };
}

function ApiKeysTab() {
  const { data, isLoading, error } = useQuery<{ keys: ApiKeyRow[] }>({
    queryKey: ["admin", "keys"],
    queryFn: () => fetchAdmin("/api/admin/keys"),
    refetchInterval: 30_000,
  });

  return (
    <div className="space-y-3">
      {error && (
        <div className="flex items-center gap-2 text-error text-sm font-mono uppercase">
          <AlertTriangle className="w-4 h-4" />
          Failed to load API keys
        </div>
      )}
      <p className="text-[10px] font-mono text-on-surface-variant/60 uppercase tracking-widest">
        {isLoading ? "Loading…" : `${data?.keys.length ?? 0} active keys`}
      </p>

      <div className="ds-panel border border-outline-variant rounded-xl overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-surface-container-high border-b border-outline-variant">
            <tr>
              {["Owner", "Key", "Name", "Usage (mo)", "Limit", "Last Used"].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-mono font-bold text-on-surface-variant/40 uppercase tracking-widest">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-outline-variant">
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : data?.keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-on-surface-variant/40 font-mono uppercase">
                    No active API keys
                  </td>
                </tr>
              ) : (
                data?.keys.map((k) => {
                  const usagePct =
                    k.monthlyLimit > 0
                      ? Math.min(100, Math.round((k.thisMonth.requests / k.monthlyLimit) * 100))
                      : 0;
                  return (
                    <tr key={k.id} className="hover:bg-on-surface/5 transition-colors">
                      <td className="px-3 py-3">
                        <div className="font-bold text-on-surface">{k.owner.email ?? "—"}</div>
                        <div className="text-[10px] text-on-surface-variant/60 font-medium font-mono uppercase">
                          {[k.owner.firstName, k.owner.lastName].filter(Boolean).join(" ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-[10px] text-on-surface-variant/80">{k.keyPrefix}…</td>
                      <td className="px-3 py-3 font-medium text-on-surface">{k.name}</td>
                      <td className="px-3 py-3">
                        <div className="flex items-center gap-2">
                          <div className="w-16 h-1 bg-surface-container-highest rounded-full overflow-hidden">
                            <div
                              className="h-full bg-primary-accent"
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                          <span className="font-mono text-on-surface-variant">
                            {k.thisMonth.requests.toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-3 font-mono text-on-surface-variant">{k.monthlyLimit.toLocaleString()}</td>
                      <td className="px-3 py-3 text-[10px] text-on-surface-variant/60 font-mono uppercase">
                        {k.lastUsedAt
                          ? formatDistanceToNow(new Date(k.lastUsedAt), { addSuffix: true })
                          : "Never"}
                      </td>
                    </tr>
                  );
                })
              )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export default function AdminPage() {
  const { isAuthenticated, isLoading, user } = useAuth();

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      window.location.href = `/api/login?returnTo=/admin`;
    }
  }, [isLoading, isAuthenticated]);

  if (isLoading || !isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <Skeleton className="h-10 w-40 bg-surface-container-highest" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-6 bg-surface text-center">
        <div className="w-20 h-20 rounded-2xl bg-red/10 flex items-center justify-center text-red border border-red/20">
          <Shield className="w-10 h-10" />
        </div>
        <div>
          <h1 className="text-3xl font-display font-bold text-on-surface tracking-widest uppercase">Access Denied</h1>
          <p className="text-sm font-mono font-bold text-on-surface-variant uppercase tracking-widest mt-2">Not Authorized</p>
        </div>
        <p className="text-sm font-medium text-on-surface-variant/60 max-w-md leading-relaxed">
          The requested administrative protocol is restricted to authenticated governance agents.
        </p>
        <a href="/" className="btn-primary mt-4">Return to Studio</a>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-6 bg-surface">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-primary-accent/10 flex items-center justify-center text-primary-accent border border-primary-accent/20">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-2xl font-display font-bold tracking-widest uppercase text-on-surface">Admin Dashboard</h1>
            <p className="text-[10px] font-mono font-bold text-on-surface-variant/40 uppercase tracking-[0.2em]">Governance Control Panel</p>
          </div>
          <Badge variant="outline" className="ml-2 text-[10px] px-1.5 py-0 border-primary-accent text-primary-accent uppercase font-mono tracking-wider">
            root
          </Badge>
        </div>

        <Tabs defaultValue="overview" className="w-full">
          <TabsList className="h-10 mb-6 bg-surface-container-high border border-outline-variant p-1 gap-1">
            {[
              { val: "overview", icon: RefreshCw, label: "Overview" },
              { val: "users", icon: Users, label: "Users" },
              { val: "generations", icon: Zap, label: "Generations" },
              { val: "cache", icon: Database, label: "Cache" },
              { val: "keys", icon: Key, label: "API Keys" },
            ].map((t) => (
              <TabsTrigger 
                key={t.val}
                value={t.val} 
                className="text-[10px] h-full font-mono uppercase tracking-widest gap-2 data-[state=active]:bg-primary-accent data-[state=active]:text-surface"
              >
                <t.icon className="w-3.5 h-3.5" />
                {t.label}
              </TabsTrigger>
            ))}
          </TabsList>

          <div className="mt-6">
            <TabsContent value="overview">
              <OverviewTab />
            </TabsContent>
            <TabsContent value="users">
              <UsersTab />
            </TabsContent>
            <TabsContent value="generations">
              <GenerationsTab />
            </TabsContent>
            <TabsContent value="cache">
              <CacheTab />
            </TabsContent>
            <TabsContent value="keys">
              <ApiKeysTab />
            </TabsContent>
          </div>
        </Tabs>
      </div>
    </div>
  );
}
