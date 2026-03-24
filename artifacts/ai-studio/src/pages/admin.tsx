import { useState, useEffect } from "react";
import { Shield, Users, Zap, Database, Key, RefreshCw, AlertTriangle } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { useQuery } from "@tanstack/react-query";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
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
    <Card>
      <CardHeader className="pb-1 pt-4 px-4">
        <CardTitle className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="px-4 pb-4">
        <p className="text-2xl font-bold">{value}</p>
        {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
      </CardContent>
    </Card>
  );
}

function RowSkeleton({ cols = 5 }: { cols?: number }) {
  return (
    <tr className="border-b">
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-3 py-2">
          <Skeleton className="h-4 w-full" />
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
      <div className="flex items-center gap-2 text-destructive text-sm p-4">
        <AlertTriangle className="w-4 h-4" />
        Failed to load overview
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">System Overview</h2>
        <Button variant="ghost" size="sm" className="h-7 text-xs gap-1" onClick={() => refetch()}>
          <RefreshCw className="w-3 h-3" />
          Refresh
        </Button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {isLoading ? (
          Array.from({ length: 7 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-1 pt-4 px-4">
                <Skeleton className="h-3 w-24" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <Skeleton className="h-7 w-16 mt-1" />
              </CardContent>
            </Card>
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

      <Card className="mt-2">
        <CardHeader className="px-4 pt-4 pb-2">
          <CardTitle className="text-xs font-medium text-muted-foreground">Promote a user to admin</CardTitle>
        </CardHeader>
        <CardContent className="px-4 pb-4">
          <p className="text-xs text-muted-foreground mb-2">
            Run this SQL command against the database to promote a user:
          </p>
          <pre className="bg-muted rounded text-xs p-3 font-mono select-all overflow-x-auto">
            {"UPDATE users SET is_admin = true WHERE email = 'you@example.com';"}
          </pre>
        </CardContent>
      </Card>
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
          className="h-8 text-xs max-w-xs"
        />
        {data && (
          <span className="text-xs text-muted-foreground">{data.total} users</span>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4" />
          Failed to load users
        </div>
      )}

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Email / Name", "Plan", "API Keys", "Requests (mo)", "Cost (mo)", "Last Active"].map(
                (h) => (
                  <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : data?.users.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No users found
                  </td>
                </tr>
              ) : (
                data?.users.map((u) => (
                  <tr key={u.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2">
                      <div className="font-medium">{u.email ?? "—"}</div>
                      <div className="text-muted-foreground">
                        {[u.firstName, u.lastName].filter(Boolean).join(" ") || "—"}
                      </div>
                    </td>
                    <td className="px-3 py-2">
                      <div className="flex items-center gap-1">
                        <Badge
                          variant={u.plan === "pro" ? "default" : "secondary"}
                          className="text-[10px] px-1.5 py-0"
                        >
                          {u.plan}
                        </Badge>
                        {u.isAdmin && (
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500 text-violet-600">
                            admin
                          </Badge>
                        )}
                      </div>
                    </td>
                    <td className="px-3 py-2">{u.apiKeyCount}</td>
                    <td className="px-3 py-2">{u.monthlyRequests.toLocaleString()}</td>
                    <td className="px-3 py-2">${u.monthlyCostUsd.toFixed(4)}</td>
                    <td className="px-3 py-2 text-muted-foreground">
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
        <span className="text-xs text-muted-foreground">
          {data ? `${data.total.toLocaleString()} total generations` : "Loading…"}
        </span>
        <div className="flex items-center gap-2 text-xs">
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={page <= 1}
            onClick={() => setPage((p) => p - 1)}
          >
            Prev
          </Button>
          <span className="text-muted-foreground">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            className="h-6 px-2 text-xs"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            Next
          </Button>
        </div>
      </div>

      {error && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4" />
          Failed to load generations
        </div>
      )}

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Prompt", "Model", "Tokens", "Cost", "Cache", "Time"].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : data?.generations.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
                    No generations yet
                  </td>
                </tr>
              ) : (
                data?.generations.map((g) => (
                  <tr key={g.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 max-w-[280px]">
                      <span className="line-clamp-2 text-muted-foreground">{g.promptTruncated}</span>
                    </td>
                    <td className="px-3 py-2 font-mono text-[10px]">{g.modelUsed ?? "—"}</td>
                    <td className="px-3 py-2">
                      {g.tokenCountPrompt != null && g.tokenCountCompletion != null
                        ? `${(g.tokenCountPrompt + g.tokenCountCompletion).toLocaleString()}`
                        : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {g.costUsd != null ? `$${g.costUsd.toFixed(4)}` : "—"}
                    </td>
                    <td className="px-3 py-2">
                      {g.cacheHit ? (
                        <Badge variant="secondary" className="text-[10px] px-1.5 py-0 text-green-700 bg-green-100">
                          HIT
                        </Badge>
                      ) : (
                        <span className="text-muted-foreground">miss</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-muted-foreground whitespace-nowrap">
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
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4" />
          Failed to load cache stats
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {isLoading ? (
          Array.from({ length: 3 }).map((_, i) => (
            <Card key={i}>
              <CardHeader className="pb-1 pt-4 px-4">
                <Skeleton className="h-3 w-20" />
              </CardHeader>
              <CardContent className="px-4 pb-4">
                <Skeleton className="h-7 w-14 mt-1" />
              </CardContent>
            </Card>
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
        <h3 className="text-xs font-semibold mb-2 text-muted-foreground uppercase tracking-wide">
          Largest Cached Prompts
        </h3>
        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : data?.largestPrompts.length === 0 ? (
          <p className="text-xs text-muted-foreground">No cached entries yet</p>
        ) : (
          <div className="border rounded-md overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b">
                <tr>
                  {["Prompt", "Hits", "Tokens"].map((h) => (
                    <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data?.largestPrompts.map((p, i) => (
                  <tr key={i} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-3 py-2 max-w-[400px] text-muted-foreground">{p.prompt}</td>
                    <td className="px-3 py-2">{p.hitCount}</td>
                    <td className="px-3 py-2">{p.similarityTokens}</td>
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
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertTriangle className="w-4 h-4" />
          Failed to load API keys
        </div>
      )}
      <p className="text-xs text-muted-foreground">
        {isLoading ? "Loading…" : `${data?.keys.length ?? 0} active keys`}
      </p>

      <div className="border rounded-md overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50 border-b">
            <tr>
              {["Owner", "Key", "Name", "Usage (mo)", "Limit", "Last Used"].map((h) => (
                <th key={h} className="text-left px-3 py-2 font-medium text-muted-foreground">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: 8 }).map((_, i) => <RowSkeleton key={i} cols={6} />)
              : data?.keys.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-6 text-center text-muted-foreground">
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
                    <tr key={k.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="px-3 py-2">
                        <div>{k.owner.email ?? "—"}</div>
                        <div className="text-muted-foreground">
                          {[k.owner.firstName, k.owner.lastName].filter(Boolean).join(" ") || "—"}
                        </div>
                      </td>
                      <td className="px-3 py-2 font-mono text-[10px]">{k.keyPrefix}…</td>
                      <td className="px-3 py-2">{k.name}</td>
                      <td className="px-3 py-2">
                        <div className="flex items-center gap-1.5">
                          <div className="w-16 h-1.5 bg-muted rounded-full overflow-hidden">
                            <div
                              className="h-full bg-violet-500 rounded-full"
                              style={{ width: `${usagePct}%` }}
                            />
                          </div>
                          <span>
                            {k.thisMonth.requests.toLocaleString()}
                          </span>
                        </div>
                      </td>
                      <td className="px-3 py-2">{k.monthlyLimit.toLocaleString()}</td>
                      <td className="px-3 py-2 text-muted-foreground">
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
      <div className="flex-1 flex items-center justify-center">
        <Skeleton className="h-10 w-40" />
      </div>
    );
  }

  if (!user?.isAdmin) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center gap-3">
        <Shield className="w-10 h-10 text-muted-foreground" />
        <p className="text-base font-semibold">Not authorised</p>
        <p className="text-sm text-muted-foreground">
          You don&apos;t have admin access to this page.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 overflow-y-auto p-4">
      <div className="max-w-5xl mx-auto">
        <div className="flex items-center gap-2 mb-4">
          <Shield className="w-4 h-4 text-violet-500" />
          <h1 className="text-base font-semibold">Admin Dashboard</h1>
          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-violet-500 text-violet-600">
            admin
          </Badge>
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="h-8 mb-4">
            <TabsTrigger value="overview" className="text-xs h-7 gap-1.5">
              <Zap className="w-3 h-3" />
              Overview
            </TabsTrigger>
            <TabsTrigger value="users" className="text-xs h-7 gap-1.5">
              <Users className="w-3 h-3" />
              Users
            </TabsTrigger>
            <TabsTrigger value="generations" className="text-xs h-7 gap-1.5">
              <Zap className="w-3 h-3" />
              Generations
            </TabsTrigger>
            <TabsTrigger value="cache" className="text-xs h-7 gap-1.5">
              <Database className="w-3 h-3" />
              Cache
            </TabsTrigger>
            <TabsTrigger value="keys" className="text-xs h-7 gap-1.5">
              <Key className="w-3 h-3" />
              API Keys
            </TabsTrigger>
          </TabsList>

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
        </Tabs>
      </div>
    </div>
  );
}
