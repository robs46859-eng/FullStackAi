import { useState } from "react";
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, Shield, AlertCircle } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface ApiKey {
  id: number;
  name: string;
  keyPrefix: string;
  monthlyLimit: number;
  revokedAt: string | null;
  lastUsedAt: string | null;
  createdAt: string;
}

interface CreateKeyResponse {
  id: number;
  name: string;
  keyPrefix: string;
  key: string;
  monthlyLimit: number;
  createdAt: string;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error);
  }
  return res.json();
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      variant="ghost"
      size="icon"
      className="h-6 w-6 text-on-surface-variant hover:text-on-surface hover:bg-on-surface/5"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3 h-3 text-green" /> : <Copy className="w-3 h-3" />}
    </Button>
  );
}

export default function ApiKeysPage() {
  const { isAuthenticated, login } = useAuth();
  const queryClient = useQueryClient();
  const [newKeyName, setNewKeyName] = useState("");
  const [newKeyLimit, setNewKeyLimit] = useState("100");
  const [createdKey, setCreatedKey] = useState<string | null>(null);
  const [showKey, setShowKey] = useState(false);

  const { data: keys = [], isLoading } = useQuery<ApiKey[]>({
    queryKey: ["api-keys"],
    queryFn: () => fetchJson("/api/keys"),
    enabled: isAuthenticated,
  });

  const createMutation = useMutation({
    mutationFn: (body: { name: string; monthlyLimit: number }) =>
      fetchJson<CreateKeyResponse>("/api/keys", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setCreatedKey(data.key);
      setNewKeyName("");
      setNewKeyLimit("100");
      queryClient.invalidateQueries({ queryKey: ["api-keys"] });
    },
  });

  const revokeMutation = useMutation({
    mutationFn: (id: number) =>
      fetchJson(`/api/keys/${id}`, { method: "DELETE" }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["api-keys"] }),
  });

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center space-y-6 max-w-sm px-4">
          <div className="w-20 h-20 rounded-2xl bg-primary-accent/10 flex items-center justify-center text-primary-accent border border-primary-accent/20 mx-auto">
            <Shield className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-on-surface tracking-widest uppercase">Protocol Access</h2>
            <p className="text-sm font-medium text-on-surface-variant/60 mt-2">Sign in to initialize administrative API access.</p>
          </div>
          <Button onClick={login} className="btn-primary w-full">Initialize Session</Button>
        </div>
      </div>
    );
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6">
      <div className="max-w-4xl mx-auto space-y-8">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-on-surface tracking-widest uppercase">API Keys</h1>
            <p className="text-[10px] font-mono font-bold text-on-surface-variant/40 uppercase tracking-[0.2em] mt-1">Access Control & Governance</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary-accent/10 flex items-center justify-center text-primary-accent border border-primary-accent/20">
            <Key className="w-6 h-6" />
          </div>
        </header>

        {/* Created key banner */}
        {createdKey && (
          <div className="bg-primary-accent/5 border border-primary-accent/20 p-6 rounded-2xl space-y-4 animate-in fade-in slide-in-from-top-2">
            <div className="flex items-center gap-2 text-primary-accent text-[11px] font-mono font-bold uppercase tracking-wider">
              <Check className="w-4 h-4" />
              Key initialized — store securely, it will not be displayed again
            </div>
            <div className="flex items-center gap-3">
              <div className="relative flex-1 flex items-center bg-surface-container-lowest border border-primary-accent/30 rounded-xl px-4 py-3">
                <code className="flex-1 text-xs font-mono text-primary-accent truncate pr-10">
                  {showKey ? createdKey : "•".repeat(40)}
                </code>
                <div className="absolute right-2 flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-8 w-8 text-primary-accent/60 hover:text-primary-accent hover:bg-primary-accent/10"
                    onClick={() => setShowKey((v) => !v)}
                  >
                    {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                  </Button>
                  <CopyButton text={createdKey} />
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="text-[10px] font-mono font-bold uppercase tracking-widest text-on-surface-variant hover:text-on-surface"
                onClick={() => { setCreatedKey(null); setShowKey(false); }}
              >
                Dismiss
              </Button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          <div className="md:col-span-1 space-y-6">
            <div className="ds-panel p-6 rounded-2xl">
              <h3 className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest mb-6">Create New Token</h3>
              <div className="space-y-5">
                <div className="space-y-2">
                  <Label className="text-[10px] font-mono text-on-surface-variant/60 uppercase">Identifier</Label>
                  <Input
                    placeholder="e.g. Production Gateway"
                    value={newKeyName}
                    onChange={(e) => setNewKeyName(e.target.value)}
                    className="bg-surface-container-low border-outline-variant focus:border-primary-accent h-10 text-xs"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="text-[10px] font-mono text-on-surface-variant/60 uppercase">Monthly Request Limit</Label>
                  <Input
                    type="number"
                    min={1}
                    value={newKeyLimit}
                    onChange={(e) => setNewKeyLimit(e.target.value)}
                    className="bg-surface-container-low border-outline-variant focus:border-primary-accent h-10 text-xs"
                  />
                </div>
                <Button
                  className="w-full btn-primary"
                  disabled={!newKeyName.trim() || createMutation.isPending}
                  onClick={() =>
                    createMutation.mutate({
                      name: newKeyName.trim(),
                      monthlyLimit: parseInt(newKeyLimit, 10) || 100,
                    })
                  }
                >
                  <Plus className="w-3.5 h-3.5 mr-2" />
                  {createMutation.isPending ? "Generating..." : "Generate Key"}
                </Button>
                {createMutation.isError && (
                  <p className="text-[10px] text-error flex items-center gap-1.5 font-mono font-bold uppercase">
                    <AlertCircle className="w-3.5 h-3.5" />
                    {(createMutation.error as Error).message}
                  </p>
                )}
              </div>
            </div>

            {/* Usage example */}
            <div className="ds-panel-inset p-6 rounded-2xl space-y-4">
              <h3 className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest">Protocol Usage</h3>
              <div className="relative group">
                <pre className="text-[10px] overflow-auto bg-surface-container-lowest border border-outline-variant rounded-xl p-4 font-mono text-on-surface-variant/80 leading-relaxed">
                  {`curl -X POST /api/v1/generate \\
  -H "Authorization: Bearer sk_..." \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "..."}'`}
                </pre>
              </div>
              <p className="text-[9px] text-on-surface-variant/40 font-mono font-bold uppercase tracking-wider">
                Discovery: <code className="text-primary-accent/60">/.well-known/agent.json</code>
              </p>
            </div>
          </div>

          <div className="md:col-span-2">
            <div className="ds-panel rounded-2xl overflow-hidden">
              <div className="px-6 py-4 border-b border-outline-variant bg-on-surface/[0.02]">
                <h3 className="text-[10px] font-mono font-bold text-on-surface-variant uppercase tracking-widest">
                  Authorized Tokens ({activeKeys.length})
                </h3>
              </div>
              
              {isLoading && (
                <div className="p-8 space-y-4">
                  {[1, 2].map((i) => (
                    <div key={i} className="h-16 rounded-xl bg-surface-container-highest animate-pulse" />
                  ))}
                </div>
              )}
              
              {!isLoading && activeKeys.length === 0 && (
                <div className="p-16 text-center text-on-surface-variant/40 font-mono uppercase text-[11px] tracking-widest">
                  No active protocols detected.
                </div>
              )}
              
              <div className="divide-y divide-outline-variant">
                {activeKeys.map((key) => (
                  <div
                    key={key.id}
                    className="p-6 flex items-center justify-between gap-6 hover:bg-on-surface/[0.02] transition-colors group"
                  >
                    <div className="min-w-0 flex-1 space-y-2">
                      <div className="flex items-center gap-3">
                        <span className="text-sm font-bold text-on-surface truncate">{key.name}</span>
                        <code className="text-[10px] font-mono px-2 py-0.5 bg-surface-container-low border border-outline-variant text-primary-accent/80 rounded font-bold">
                          {key.keyPrefix}••••
                        </code>
                      </div>
                      <div className="flex items-center gap-4 text-[10px] font-mono font-bold uppercase text-on-surface-variant/40 tracking-wider">
                        <span className="flex items-center gap-1.5">
                          <Database className="w-3 h-3 text-on-surface-variant/20" />
                          {key.monthlyLimit.toLocaleString()} tokens/mo
                        </span>
                        <span>
                          Init: {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}
                        </span>
                        {key.lastUsedAt && (
                          <span className="text-primary-accent/40">
                            Active {formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}
                          </span>
                        )}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-on-surface-variant/40 hover:text-red hover:bg-red/10 flex-shrink-0 opacity-0 group-hover:opacity-100 transition-all"
                      onClick={() => revokeMutation.mutate(key.id)}
                      disabled={revokeMutation.isPending}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
