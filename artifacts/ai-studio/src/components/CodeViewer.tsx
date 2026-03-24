import { useEffect, useRef } from "react";
import { CheckCircle2, Code2, Copy, FileArchive, TerminalSquare } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface CodeViewerProps {
  code: string;
  isGenerating: boolean;
  savedFilename: string | null;
}

export function CodeViewer({ code, isGenerating, savedFilename }: CodeViewerProps) {
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom when code streams in
  useEffect(() => {
    if (scrollRef.current && isGenerating) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [code, isGenerating]);

  const handleCopy = () => {
    if (code) navigator.clipboard.writeText(code);
  };

  if (!code && !isGenerating && !savedFilename) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="relative w-64 h-64 mb-8 opacity-80 mix-blend-screen">
          <div className="absolute inset-0 bg-primary/20 blur-[80px] rounded-full" />
          <img 
            src={`${import.meta.env.BASE_URL}images/empty-state.png`} 
            alt="AI Studio"
            className="w-full h-full object-contain relative z-10 drop-shadow-2xl" 
          />
        </div>
        <h2 className="text-2xl font-bold text-foreground mb-2 text-glow">Describe your ideal API</h2>
        <p className="text-muted-foreground max-w-md text-lg">
          The AI will engineer a production-ready, asynchronous Express route handler connected to your PostgreSQL database.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-[#0c0c0e] m-4 rounded-2xl border border-white/10 shadow-2xl overflow-hidden relative group">
      
      {/* Glow effect when generating */}
      {isGenerating && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary/20 blur-[100px] rounded-full animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-primary/20 blur-[100px] rounded-full animate-pulse delay-700" />
        </div>
      )}

      {/* Editor Header Bar */}
      <div className="h-12 bg-white/[0.02] border-b border-white/5 flex items-center justify-between px-4 z-10 relative backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-500/80" />
            <div className="w-3 h-3 rounded-full bg-yellow-500/80" />
            <div className="w-3 h-3 rounded-full bg-green-500/80" />
          </div>
          <div className="h-4 w-px bg-white/10 mx-2" />
          <div className="flex items-center gap-2 text-xs font-mono text-muted-foreground bg-black/20 px-2.5 py-1 rounded-md border border-white/5">
            <TerminalSquare className="w-3.5 h-3.5 text-primary" />
            <span>route-handler.ts</span>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          {isGenerating && (
            <div className="flex items-center gap-2 text-xs text-primary font-medium bg-primary/10 px-3 py-1.5 rounded-full border border-primary/20">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
              </span>
              Generating...
            </div>
          )}
          {code && !isGenerating && (
            <button 
              onClick={handleCopy}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-white/10 rounded-md transition-colors"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {savedFilename && !isGenerating && (
        <div className="bg-emerald-500/10 border-b border-emerald-500/20 px-4 py-2.5 flex items-center justify-between z-10 relative">
          <div className="flex items-center gap-2 text-emerald-400 text-sm font-medium">
            <CheckCircle2 className="w-4 h-4" />
            Successfully generated and compressed!
          </div>
          <div className="flex items-center gap-1.5 text-xs text-emerald-500/70 font-mono bg-black/20 px-2 py-1 rounded border border-emerald-500/20">
            <FileArchive className="w-3 h-3" />
            {savedFilename}
          </div>
        </div>
      )}

      {/* Code Area */}
      <div 
        ref={scrollRef}
        className="flex-1 overflow-auto p-6 z-10 relative scroll-smooth"
      >
        <pre className="font-mono text-[13px] leading-relaxed text-zinc-300">
          <code className="block w-full">
            {code}
            {isGenerating && (
              <span className="inline-block w-2 h-4 bg-primary align-middle ml-1 animate-cursor-blink" />
            )}
          </code>
        </pre>
      </div>
    </div>
  );
}
