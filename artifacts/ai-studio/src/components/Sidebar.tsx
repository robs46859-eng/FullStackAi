import { formatDistanceToNow } from "date-fns";
import {
  Activity,
  CheckCheck,
  Clock,
  DollarSign,
  FileCode2,
  History,
  Loader2,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { useAgentHistory, useGatewayStats } from "@workspace/api-client-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  onSelectPrompt: (prompt: string) => void;
}

function StatPill({
  icon: Icon,
  label,
  value,
  color = "text-muted-foreground",
}: {
  icon: React.ElementType;
  label: string;
  value: string;
  color?: string;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <Icon className="w-3 h-3" />
        <span>{label}</span>
      </div>
      <span className={cn("text-xs font-semibold tabular-nums", color)}>{value}</span>
    </div>
  );
}

export function Sidebar({ onSelectPrompt }: SidebarProps) {
  const { data: history, isLoading: historyLoading, isError: historyError } = useAgentHistory();
  const { data: stats } = useGatewayStats({ query: { refetchInterval: 15000 } });

  const cacheHitPct = stats ? Math.round((stats.cacheHitRate ?? 0) * 100) : null;
  const totalCost =
    stats?.totalCostUsd != null ? `$${stats.totalCostUsd.toFixed(4)}` : "—";
  const totalTokens =
    stats?.totalTokens != null
      ? stats.totalTokens >= 1000
        ? `${(stats.totalTokens / 1000).toFixed(1)}k`
        : String(stats.totalTokens)
      : "—";
  const avgTtft =
    stats?.avgTtftMs != null ? `${Math.round(stats.avgTtftMs)}ms` : "—";
  const tpmUsage =
    stats ? `${stats.tpmWindowTotal.toLocaleString()} / ${stats.tpmLimit.toLocaleString()}` : "—";

  return (
    <aside className="w-80 flex-shrink-0 border-r border-white/10 bg-card/40 backdrop-blur-2xl flex flex-col h-screen overflow-hidden">
      {/* Brand Header */}
      <div className="h-16 flex items-center px-6 border-b border-white/5 shadow-sm">
        <div className="flex items-center gap-3 text-primary">
          <div className="p-2 bg-primary/10 rounded-xl border border-primary/20">
            <Sparkles className="w-5 h-5 text-primary" />
          </div>
          <h1 className="font-bold text-lg tracking-tight text-foreground">AI Studio</h1>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Gateway Status Panel */}
        <div>
          <div className="flex items-center gap-2 px-2 mb-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <Activity className="w-3.5 h-3.5 text-primary/70" />
            Layer 8 Gateway
          </div>

          <div className="rounded-xl border border-white/10 bg-black/20 p-3 space-y-2.5">
            <StatPill
              icon={CheckCheck}
              label="Cache Hit Rate"
              value={cacheHitPct != null ? `${cacheHitPct}%` : "—"}
              color={
                cacheHitPct != null && cacheHitPct > 50
                  ? "text-green-400"
                  : "text-foreground/80"
              }
            />
            <StatPill
              icon={TrendingUp}
              label="Total Tokens"
              value={totalTokens}
            />
            <StatPill
              icon={DollarSign}
              label="Estimated Cost"
              value={totalCost}
              color="text-yellow-400/90"
            />
            <StatPill
              icon={Clock}
              label="Avg TTFT"
              value={avgTtft}
            />
            <StatPill
              icon={Zap}
              label="TPM (60s window)"
              value={tpmUsage}
              color={
                stats && stats.tpmWindowTotal >= stats.tpmLimit * 0.8
                  ? "text-red-400"
                  : "text-foreground/80"
              }
            />
          </div>
        </div>

        {/* History List */}
        <div>
          <div className="flex items-center gap-2 px-2 mb-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <History className="w-3.5 h-3.5" />
            Generation History
          </div>

          {historyLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : historyError ? (
            <div className="text-sm text-destructive px-2">Failed to load history</div>
          ) : history?.length === 0 ? (
            <div className="text-sm text-muted-foreground text-center py-8 px-4 border border-dashed border-white/10 rounded-xl">
              No APIs generated yet. Try your first prompt!
            </div>
          ) : (
            <div className="space-y-2">
              {history?.map((item) => (
                <button
                  key={item.id}
                  onClick={() => onSelectPrompt(item.prompt)}
                  className="w-full text-left group flex flex-col gap-2 p-3 rounded-xl border border-transparent hover:border-white/10 hover:bg-white/5 transition-all duration-200 active:scale-[0.98]"
                >
                  <div className="flex items-start justify-between gap-2">
                    <p className="text-sm font-medium text-foreground/90 line-clamp-2 leading-relaxed group-hover:text-primary transition-colors flex-1">
                      "{item.prompt}"
                    </p>
                    {item.cacheHit && (
                      <span className="flex-shrink-0 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-green-500/15 text-green-400 border border-green-500/20 uppercase tracking-wider">
                        Cached
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between w-full mt-0.5">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[100px]" title={item.filename}>
                        {item.filename.replace("Agent/", "")}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {item.costUsd != null && (
                        <span className="text-[10px] text-yellow-400/80 font-medium tabular-nums">
                          ${item.costUsd.toFixed(4)}
                        </span>
                      )}
                      {item.ttftMs != null && (
                        <span className="text-[10px] text-muted-foreground/60 font-medium tabular-nums">
                          {item.ttftMs}ms
                        </span>
                      )}
                      <span className="text-[10px] text-muted-foreground/50 font-medium whitespace-nowrap">
                        {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                      </span>
                    </div>
                  </div>
                  {item.modelUsed && item.modelUsed !== "cached" && (
                    <div className="text-[10px] text-muted-foreground/40 font-mono">
                      {item.modelUsed}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <p className="text-xs text-muted-foreground/60 text-center flex flex-col gap-1">
          <span>Powered by Replit AI · Layer 8 Intelligence</span>
          <span>Async API Code Generator</span>
        </p>
      </div>
    </aside>
  );
}
