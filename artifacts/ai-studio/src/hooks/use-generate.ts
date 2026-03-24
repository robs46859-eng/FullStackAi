import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAgentHistoryQueryKey } from "@workspace/api-client-react";

interface GenerationState {
  isGenerating: boolean;
  streamedCode: string;
  savedFilename: string | null;
  error: string | null;
}

export function useGenerateApi() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    streamedCode: "",
    savedFilename: null,
    error: null,
  });

  const generate = useCallback(async (prompt: string) => {
    setState({
      isGenerating: true,
      streamedCode: "",
      savedFilename: null,
      error: null,
    });

    try {
      const res = await fetch("/api/agent/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        throw new Error(errData.error || `Server error: ${res.status}`);
      }

      const reader = res.body?.getReader();
      const decoder = new TextDecoder();
      if (!reader) throw new Error("Response body is not readable");

      let currentCode = "";
      let buffer = "";

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        
        // Keep the last partial line in the buffer
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(dataStr);
              if (parsed.content) {
                currentCode += parsed.content;
                setState((s) => ({ ...s, streamedCode: currentCode }));
              }
              if (parsed.done && parsed.filename) {
                setState((s) => ({ ...s, savedFilename: parsed.filename }));
                // Invalidate history query to show the new generation in the sidebar
                queryClient.invalidateQueries({
                  queryKey: getAgentHistoryQueryKey(),
                });
              }
              if (parsed.error) {
                 throw new Error(parsed.error);
              }
            } catch (e) {
              // Only warn on parse errors if it's not our intentional throw above
              if (e instanceof Error && !e.message.includes("Unexpected token")) {
                throw e;
              }
              console.warn("Failed to parse SSE chunk", dataStr);
            }
          }
        }
      }
    } catch (err) {
      setState((s) => ({
        ...s,
        error: err instanceof Error ? err.message : "An unknown error occurred",
      }));
    } finally {
      setState((s) => ({ ...s, isGenerating: false }));
    }
  }, [queryClient]);

  return { ...state, generate };
}
