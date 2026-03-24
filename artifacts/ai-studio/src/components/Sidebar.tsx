import { formatDistanceToNow } from "date-fns";
import { FileCode2, History, Loader2, Sparkles } from "lucide-react";
import { useAgentHistory } from "@workspace/api-client-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface SidebarProps {
  onSelectPrompt: (prompt: string) => void;
}

export function Sidebar({ onSelectPrompt }: SidebarProps) {
  const { data: history, isLoading, isError } = useAgentHistory();

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

      {/* History List */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        <div>
          <div className="flex items-center gap-2 px-2 mb-4 text-xs font-semibold text-muted-foreground uppercase tracking-wider">
            <History className="w-3.5 h-3.5" />
            Generation History
          </div>

          {isLoading ? (
            <div className="flex items-center justify-center py-8 text-muted-foreground">
              <Loader2 className="w-5 h-5 animate-spin" />
            </div>
          ) : isError ? (
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
                  <p className="text-sm font-medium text-foreground/90 line-clamp-2 leading-relaxed group-hover:text-primary transition-colors">
                    "{item.prompt}"
                  </p>
                  <div className="flex items-center justify-between w-full mt-1">
                    <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                      <FileCode2 className="w-3.5 h-3.5" />
                      <span className="truncate max-w-[120px]" title={item.filename}>
                        {item.filename.replace("Agent/", "")}
                      </span>
                    </div>
                    <span className="text-[10px] text-muted-foreground/70 font-medium whitespace-nowrap">
                      {formatDistanceToNow(new Date(item.createdAt), { addSuffix: true })}
                    </span>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      
      {/* Footer info */}
      <div className="p-4 border-t border-white/5 bg-black/20">
        <p className="text-xs text-muted-foreground/60 text-center flex flex-col gap-1">
          <span>Powered by Replit AI</span>
          <span>Async API Code Generator</span>
        </p>
      </div>
    </aside>
  );
}
