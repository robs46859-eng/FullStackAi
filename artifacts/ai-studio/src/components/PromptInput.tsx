import { useState, KeyboardEvent, useEffect } from "react";
import { Send, Sparkles, AlertCircle } from "lucide-react";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface PromptInputProps {
  onSubmit: (prompt: string) => void;
  isGenerating: boolean;
  error: string | null;
  initialValue?: string;
}

export function PromptInput({ onSubmit, isGenerating, error, initialValue = "" }: PromptInputProps) {
  const [prompt, setPrompt] = useState(initialValue);

  // Update internal state when parent sets a new initial value (e.g., clicking history)
  useEffect(() => {
    if (initialValue) {
      setPrompt(initialValue);
    }
  }, [initialValue]);

  const handleSubmit = () => {
    if (!prompt.trim() || isGenerating) return;
    onSubmit(prompt.trim());
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="p-4 border-t border-white/5 bg-background/80 backdrop-blur-2xl relative z-20">
      <div className="max-w-4xl mx-auto w-full">
        {error && (
          <div className="mb-3 p-3 rounded-xl bg-destructive/10 border border-destructive/20 text-destructive text-sm flex items-start gap-2 animate-in slide-in-from-bottom-2">
            <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
            <p className="font-medium">{error}</p>
          </div>
        )}
        
        <div className="relative group">
          <div className="absolute -inset-0.5 bg-gradient-to-r from-primary/30 to-purple-500/30 rounded-2xl blur opacity-30 group-focus-within:opacity-100 transition duration-500" />
          
          <div className="relative flex items-end gap-3 bg-[#131316] border border-white/10 rounded-2xl p-2 shadow-inner focus-within:border-primary/50 transition-colors">
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="E.g. Create an async CRUD API for managing user notes with PostgreSQL and Drizzle..."
              className="w-full min-h-[60px] max-h-48 resize-none bg-transparent border-none text-foreground text-sm p-3 focus:outline-none focus:ring-0 placeholder:text-muted-foreground/60 scrollbar-none"
              disabled={isGenerating}
            />
            
            <button
              onClick={handleSubmit}
              disabled={!prompt.trim() || isGenerating}
              className={cn(
                "p-3 rounded-xl flex-shrink-0 transition-all duration-300 flex items-center justify-center relative overflow-hidden",
                !prompt.trim() || isGenerating 
                  ? "bg-white/5 text-muted-foreground cursor-not-allowed" 
                  : "bg-primary text-primary-foreground hover:shadow-[0_0_20px_rgba(99,102,241,0.4)] hover:-translate-y-0.5 active:translate-y-0"
              )}
            >
              {isGenerating ? (
                <div className="w-5 h-5 border-2 border-primary-foreground/30 border-t-primary-foreground rounded-full animate-spin" />
              ) : (
                <>
                  <Send className="w-5 h-5 relative z-10" />
                  {prompt.trim() && (
                    <span className="absolute inset-0 bg-gradient-to-tr from-white/0 via-white/20 to-white/0 opacity-0 hover:opacity-100 transition-opacity" />
                  )}
                </>
              )}
            </button>
          </div>
        </div>
        <div className="mt-2 text-center flex justify-center items-center gap-1.5 text-[11px] text-muted-foreground/50 font-medium">
          <Sparkles className="w-3 h-3" />
          Press <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 font-sans mx-0.5">Enter</kbd> to generate, <kbd className="px-1.5 py-0.5 rounded-md bg-white/5 border border-white/10 font-sans mx-0.5">Shift + Enter</kbd> for new line
        </div>
      </div>
    </div>
  );
}
