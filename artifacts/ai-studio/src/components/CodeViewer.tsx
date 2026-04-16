import { useEffect, useRef, useState } from "react";
import { CheckCircle2, Code2, Copy, FileArchive, TerminalSquare, Eye, Monitor } from "lucide-react";
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
  const [mode, setMode] = useState<"code" | "preview">("code");
  const isHtml = code.trim().toLowerCase().startsWith("<!doctype html") || code.includes("<html");

  // Auto-scroll to bottom when code streams in
  useEffect(() => {
    if (scrollRef.current && isGenerating && mode === "code") {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [code, isGenerating, mode]);

  // Default to preview mode if HTML is detected and generation is done
  useEffect(() => {
    if (isHtml && !isGenerating && code) {
      setMode("preview");
    } else if (!isHtml) {
      setMode("code");
    }
  }, [isHtml, isGenerating]);

  const handleCopy = () => {
    if (code) navigator.clipboard.writeText(code);
  };

  if (!code && !isGenerating && !savedFilename) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-8 text-center animate-in fade-in zoom-in duration-500">
        <div className="relative w-64 h-64 mb-8 opacity-80 mix-blend-screen">
          <div className="absolute inset-0 bg-primary-accent/10 blur-[80px] rounded-full" />
          <img 
            src={`${import.meta.env.BASE_URL}images/empty-state.png`} 
            alt="AI Studio"
            className="w-full h-full object-contain relative z-10 drop-shadow-2xl grayscale brightness-125" 
          />
        </div>
        <h2 className="text-3xl font-display font-bold text-on-surface mb-2 tracking-widest uppercase">Engineer Your Vision</h2>
        <p className="text-on-surface-variant max-w-md text-sm font-medium leading-relaxed">
          Describe a production-ready API or a high-end website. The AI will build the protocol and render a live preview instantly.
        </p>
      </div>
    );
  }

  return (
    <div className="flex-1 flex flex-col min-h-0 bg-surface-container-low m-4 rounded-2xl border border-outline-variant shadow-2xl overflow-hidden relative group">
      
      {/* Glow effect when generating */}
      {isGenerating && (mode === "code") && (
        <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden rounded-2xl">
          <div className="absolute -top-32 -left-32 w-64 h-64 bg-primary-accent/10 blur-[100px] rounded-full animate-pulse" />
          <div className="absolute -bottom-32 -right-32 w-64 h-64 bg-primary-accent/10 blur-[100px] rounded-full animate-pulse delay-700" />
        </div>
      )}

      {/* Editor Header Bar */}
      <div className="h-14 bg-on-surface/[0.02] border-b border-outline-variant flex items-center justify-between px-4 z-10 relative backdrop-blur-sm">
        <div className="flex items-center gap-6">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-primary-accent/60" />
            <div className="w-2.5 h-2.5 rounded-full bg-green/60" />
          </div>
          
          <div className="flex items-center gap-1 bg-surface-container-highest p-1 rounded-xl border border-outline-variant">
            <button
              onClick={() => setMode("code")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all",
                mode === "code" ? "bg-primary-accent text-surface shadow-lg shadow-primary-accent/10" : "text-on-surface-variant/60 hover:text-on-surface"
              )}
            >
              <Code2 size={14} /> Code
            </button>
            <button
              onClick={() => setMode("preview")}
              className={cn(
                "flex items-center gap-2 px-3 py-1.5 rounded-lg text-[10px] font-mono font-bold uppercase tracking-widest transition-all",
                mode === "preview" ? "bg-primary-accent text-surface shadow-lg shadow-primary-accent/10" : "text-on-surface-variant/60 hover:text-on-surface"
              )}
            >
              <Monitor size={14} /> Preview
            </button>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 text-[10px] font-mono font-bold uppercase tracking-widest text-on-surface-variant/40 bg-surface-container-lowest px-2.5 py-1.5 rounded-lg border border-outline-variant">
            <TerminalSquare className="w-3.5 h-3.5 text-primary-accent/60" />
            <span>{isHtml ? "index.html" : "protocol.ts"}</span>
          </div>
          
          {isGenerating && (
            <div className="flex items-center gap-2 text-[10px] text-primary-accent font-bold uppercase tracking-widest bg-primary-accent/10 px-3 py-1.5 rounded-full border border-primary-accent/20">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary-accent opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-primary-accent"></span>
              </span>
              Generating
            </div>
          )}
          {code && !isGenerating && (
            <button 
              onClick={handleCopy}
              className="p-2 text-on-surface-variant/60 hover:text-on-surface hover:bg-on-surface/5 rounded-xl transition-colors"
              title="Copy code"
            >
              <Copy className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Success Banner */}
      {savedFilename && !isGenerating && (
        <div className="bg-green/10 border-b border-green/20 px-4 py-2 flex items-center justify-between z-10 relative">
          <div className="flex items-center gap-2 text-green text-[10px] font-mono font-bold uppercase tracking-widest">
            <CheckCircle2 className="w-3.5 h-3.5" />
            Protocol Initialized
          </div>
          <div className="flex items-center gap-1.5 text-[9px] text-green/60 font-mono font-bold bg-surface-container-lowest px-2 py-0.5 rounded border border-green/20">
            <FileArchive className="w-3 h-3" />
            {savedFilename}
          </div>
        </div>
      )}

      {/* Viewport Area */}
      <div className="flex-1 min-h-0 relative">
        {mode === "code" ? (
          <div 
            ref={scrollRef}
            className="h-full overflow-auto p-6 scroll-smooth bg-surface-container-low"
          >
            <pre className="font-mono text-[13px] leading-relaxed text-on-surface-variant">
              <code className="block w-full">
                {code}
                {isGenerating && (
                  <span className="inline-block w-2 h-4 bg-primary-accent align-middle ml-1 animate-cursor-blink" />
                )}
              </code>
            </pre>
          </div>
        ) : (
          <div className="h-full w-full bg-white relative">
            {!code && (
              <div className="absolute inset-0 flex items-center justify-center bg-surface-container-low text-on-surface-variant/40 font-mono text-[10px] uppercase tracking-widest">
                Waiting for protocol...
              </div>
            )}
            <iframe 
              srcDoc={code}
              className="w-full h-full border-none"
              title="Live Preview"
              sandbox="allow-scripts allow-modals"
            />
          </div>
        )}
      </div>
    </div>
  );
}
