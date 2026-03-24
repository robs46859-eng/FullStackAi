import { useState, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { getAgentHistoryQueryKey, getGatewayStatsQueryKey } from "@workspace/api-client-react";

interface GenerationMeta {
  modelUsed: string | null;
  isCached: boolean;
  tokenCount: { prompt: number; completion: number } | null;
  costUsd: number | null;
  ttftMs: number | null;
}

interface GenerationState {
  isGenerating: boolean;
  streamedCode: string;
  savedFilename: string | null;
  error: string | null;
  piiWarning: string | null;
  meta: GenerationMeta;
}

const defaultMeta: GenerationMeta = {
  modelUsed: null,
  isCached: false,
  tokenCount: null,
  costUsd: null,
  ttftMs: null,
};

export function useGenerateApi() {
  const queryClient = useQueryClient();
  const [state, setState] = useState<GenerationState>({
    isGenerating: false,
    streamedCode: "",
    savedFilename: null,
    error: null,
    piiWarning: null,
    meta: defaultMeta,
  });

  const generate = useCallback(async (prompt: string) => {
    setState({
      isGenerating: true,
      streamedCode: "",
      savedFilename: null,
      error: null,
      piiWarning: null,
      meta: defaultMeta,
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
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            const dataStr = line.slice(6).trim();
            if (!dataStr || dataStr === "[DONE]") continue;

            try {
              const parsed = JSON.parse(dataStr);

              if (parsed.piiWarning) {
                setState((s) => ({ ...s, piiWarning: parsed.piiWarning as string }));
              }

              if (parsed.cacheHit) {
                setState((s) => ({ ...s, meta: { ...s.meta, isCached: true } }));
              }

              if (parsed.streamReset) {
                currentCode = "";
                setState((s) => ({ ...s, streamedCode: "" }));
              }

              if (parsed.content) {
                currentCode += parsed.content as string;
                setState((s) => ({ ...s, streamedCode: currentCode }));
              }

              if (parsed.done && parsed.filename) {
                setState((s) => ({
                  ...s,
                  savedFilename: parsed.filename as string,
                  meta: {
                    modelUsed: (parsed.model as string) ?? null,
                    isCached: (parsed.cached as boolean) ?? false,
                    tokenCount: parsed.tokenCount
                      ? {
                          prompt: (parsed.tokenCount as { prompt: number }).prompt,
                          completion: (parsed.tokenCount as { completion: number }).completion,
                        }
                      : null,
                    costUsd: (parsed.costUsd as number) ?? null,
                    ttftMs: (parsed.ttftMs as number) ?? null,
                  },
                }));
                queryClient.invalidateQueries({ queryKey: getAgentHistoryQueryKey() });
                queryClient.invalidateQueries({ queryKey: getGatewayStatsQueryKey() });
              }

              if (parsed.error) {
                throw new Error(parsed.error as string);
              }
            } catch (e) {
              if (e instanceof Error && !e.message.includes("Unexpected token")) {
                throw e;
              }
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
