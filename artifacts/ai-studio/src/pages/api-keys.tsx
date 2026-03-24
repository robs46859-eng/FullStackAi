import { useState } from "react";
import { Key, Plus, Trash2, Copy, Check, Eye, EyeOff, Shield, AlertCircle } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { formatDistanceToNow } from "date-fns";

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
      className="h-6 w-6"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }}
    >
      {copied ? <Check className="w-3 h-3 text-green-500" /> : <Copy className="w-3 h-3" />}
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
      <div className="flex-1 flex items-center justify-center">
        <div className="text-center space-y-4">
          <Shield className="w-12 h-12 mx-auto text-muted-foreground" />
          <h2 className="text-lg font-semibold">Sign in to manage API keys</h2>
          <Button onClick={login}>Log in</Button>
        </div>
      </div>
    );
  }

  const activeKeys = keys.filter((k) => !k.revokedAt);

  return (
    <div className="flex-1 overflow-auto p-6 max-w-3xl mx-auto w-full">
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Key className="w-6 h-6 text-violet-500" />
            API Keys
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Generate keys to access the AI Studio public API. Keys are shown only once — store them securely.
          </p>
        </div>

        {/* Created key banner */}
        {createdKey && (
          <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 space-y-2">
            <div className="flex items-center gap-2 text-green-600 font-medium text-sm">
              <Check className="w-4 h-4" />
              Key created — copy it now, it won't be shown again
            </div>
            <div className="flex items-center gap-2">
              <code className="flex-1 text-xs bg-background border rounded px-3 py-2 font-mono truncate">
                {showKey ? createdKey : "•".repeat(40)}
              </code>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 flex-shrink-0"
                onClick={() => setShowKey((v) => !v)}
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </Button>
              <CopyButton text={createdKey} />
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="text-xs"
              onClick={() => { setCreatedKey(null); setShowKey(false); }}
            >
              Dismiss
            </Button>
          </div>
        )}

        {/* Create new key form */}
        <div className="border rounded-lg p-4 space-y-4 bg-card">
          <h3 className="font-medium text-sm">Create New API Key</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs">Key Name</Label>
              <Input
                placeholder="e.g. My App, CI Pipeline…"
                value={newKeyName}
                onChange={(e) => setNewKeyName(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
            <div className="space-y-1.5 col-span-2 sm:col-span-1">
              <Label className="text-xs">Monthly Request Limit</Label>
              <Input
                type="number"
                min={1}
                value={newKeyLimit}
                onChange={(e) => setNewKeyLimit(e.target.value)}
                className="h-8 text-sm"
              />
            </div>
          </div>
          <Button
            size="sm"
            className="gap-1.5"
            disabled={!newKeyName.trim() || createMutation.isPending}
            onClick={() =>
              createMutation.mutate({
                name: newKeyName.trim(),
                monthlyLimit: parseInt(newKeyLimit, 10) || 100,
              })
            }
          >
            <Plus className="w-3.5 h-3.5" />
            {createMutation.isPending ? "Creating…" : "Create Key"}
          </Button>
          {createMutation.isError && (
            <p className="text-xs text-destructive flex items-center gap-1">
              <AlertCircle className="w-3 h-3" />
              {(createMutation.error as Error).message}
            </p>
          )}
        </div>

        {/* Keys list */}
        <div className="space-y-2">
          <h3 className="font-medium text-sm text-muted-foreground uppercase tracking-wide">
            Active Keys ({activeKeys.length})
          </h3>
          {isLoading && (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="h-16 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          )}
          {!isLoading && activeKeys.length === 0 && (
            <p className="text-sm text-muted-foreground py-4 text-center">
              No active API keys yet. Create one above.
            </p>
          )}
          {activeKeys.map((key) => (
            <div
              key={key.id}
              className="border rounded-lg p-3 flex items-center justify-between gap-3 bg-card"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium truncate">{key.name}</span>
                  <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                    {key.keyPrefix}…
                  </code>
                </div>
                <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
                  <span>Limit: {key.monthlyLimit}/mo</span>
                  {key.lastUsedAt && (
                    <span>Last used {formatDistanceToNow(new Date(key.lastUsedAt), { addSuffix: true })}</span>
                  )}
                  <span>Created {formatDistanceToNow(new Date(key.createdAt), { addSuffix: true })}</span>
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-destructive flex-shrink-0"
                onClick={() => revokeMutation.mutate(key.id)}
                disabled={revokeMutation.isPending}
              >
                <Trash2 className="w-3.5 h-3.5" />
              </Button>
            </div>
          ))}
        </div>

        {/* Usage example */}
        <div className="border rounded-lg p-4 bg-muted/30 space-y-2">
          <h3 className="font-medium text-sm">Usage Example</h3>
          <pre className="text-xs overflow-auto bg-background border rounded p-3 font-mono leading-relaxed">{`curl -X POST https://your-domain/api/v1/generate \\
  -H "Authorization: Bearer sk_xxxxxxxx_..." \\
  -H "Content-Type: application/json" \\
  -d '{"prompt": "create a user registration endpoint"}'`}</pre>
          <p className="text-xs text-muted-foreground">
            Discover capabilities at{" "}
            <code className="bg-background border rounded px-1 py-0.5">
              /.well-known/agent.json
            </code>
          </p>
        </div>
      </div>
    </div>
  );
}
