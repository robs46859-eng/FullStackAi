import { useEffect } from "react";
import { Check, CreditCard, Shield, Zap, Sparkles, Building2 } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";
import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

interface BillingPlan {
  id: string;
  name: string;
  description: string;
  priceId: string | null;
  unitAmount: number | null;
  currency: string;
  interval: string | null;
  generationsPerMonth: number | null;
}

interface SubscriptionStatus {
  status: string | null;
  planName: string | null;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean | null;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, { ...init, credentials: "include" });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error((err as { error: string }).error);
  }
  return res.json();
}

const PLAN_ICONS: Record<string, React.ElementType> = {
  free: Zap,
  pro: Sparkles,
  enterprise: Building2,
};

const PLAN_COLORS: Record<string, string> = {
  free: "border-outline-variant bg-surface-container-low",
  pro: "border-primary-accent bg-primary-accent/5 ring-1 ring-primary-accent/20",
  enterprise: "border-secondary-accent bg-secondary-accent/5 ring-1 ring-secondary-accent/20",
};

export default function BillingPage() {
  const { isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;

    const clean = window.location.pathname;
    window.history.replaceState({}, "", clean);

    if (checkout === "success") {
      toast({
        title: "Subscription activated",
        description: "Your protocol tier has been upgraded.",
      });
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["billing-subscription"] });
      }, 3000);
    } else if (checkout === "cancel") {
      toast({
        title: "Checkout aborted",
        description: "No modifications were made to your tier.",
        variant: "destructive",
      });
    }
  }, [toast, queryClient]);

  const { data: plans = [], isLoading: plansLoading } = useQuery<BillingPlan[]>({
    queryKey: ["billing-plans"],
    queryFn: () => fetchJson("/api/billing/plans"),
  });

  const { data: subscription } = useQuery<SubscriptionStatus>({
    queryKey: ["billing-subscription"],
    queryFn: () => fetchJson("/api/billing/subscription"),
    enabled: isAuthenticated,
  });

  const checkoutMutation = useMutation({
    mutationFn: (priceId: string) => {
      const returnUrl = window.location.origin + window.location.pathname;
      return fetchJson<{ url: string }>("/api/billing/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ priceId, returnUrl }),
      });
    },
    onSuccess: (data) => {
      window.location.href = data.url;
    },
    onError: (err) => {
      toast({
        title: "Transaction failed",
        description: err.message,
        variant: "destructive",
      });
    },
  });

  if (!isAuthenticated) {
    return (
      <div className="flex-1 flex items-center justify-center bg-surface">
        <div className="text-center space-y-6 max-w-sm px-4">
          <div className="w-20 h-20 rounded-2xl bg-primary-accent/10 flex items-center justify-center text-primary-accent border border-primary-accent/20 mx-auto">
            <Shield className="w-10 h-10" />
          </div>
          <div>
            <h2 className="text-2xl font-display font-bold text-on-surface tracking-widest uppercase">Billing Protocol</h2>
            <p className="text-sm font-medium text-on-surface-variant/60 mt-2">Sign in to manage your resource allocations.</p>
          </div>
          <Button onClick={login} className="btn-primary w-full">Initialize Session</Button>
        </div>
      </div>
    );
  }

  const currentPlan = subscription?.planName?.toLowerCase() ?? "free";

  return (
    <div className="flex-1 overflow-y-auto bg-surface p-6">
      <div className="max-w-5xl mx-auto space-y-12">
        <header className="flex items-center justify-between">
          <div>
            <h1 className="text-3xl font-display font-bold text-on-surface tracking-widest uppercase">Billing</h1>
            <p className="text-[10px] font-mono font-bold text-on-surface-variant/40 uppercase tracking-[0.2em] mt-1">Resource Allocation & Quotas</p>
          </div>
          <div className="w-12 h-12 rounded-xl bg-primary-accent/10 flex items-center justify-center text-primary-accent border border-primary-accent/20">
            <CreditCard className="w-6 h-6" />
          </div>
        </header>

        {subscription && (
          <div className="ds-panel p-6 rounded-2xl flex flex-col md:flex-row md:items-center justify-between gap-6 border-primary-accent/20 bg-primary-accent/[0.02]">
            <div className="space-y-1.5">
              <p className="text-[10px] font-mono font-bold text-on-surface-variant/60 uppercase tracking-widest">Active Tier</p>
              <div className="flex items-center gap-3">
                <h2 className="text-2xl font-display font-bold text-on-surface tracking-wide uppercase">{subscription.planName}</h2>
                <Badge className="bg-primary-accent text-surface font-mono text-[9px] uppercase tracking-widest">Active</Badge>
              </div>
              {subscription.currentPeriodEnd && (
                <p className="text-[10px] font-mono text-on-surface-variant/40 uppercase">
                  Renewal: {new Date(subscription.currentPeriodEnd).toLocaleDateString()} 
                  {subscription.cancelAtPeriodEnd && " (Pending Termination)"}
                </p>
              )}
            </div>
            {subscription.planName !== "Free" && (
              <Button variant="outline" className="border-outline-variant text-on-surface-variant hover:text-on-surface font-mono text-[10px] uppercase tracking-widest h-10 px-6">
                Manage Subscription
              </Button>
            )}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {plansLoading ? (
            [1, 2, 3].map((i) => (
              <div key={i} className="h-[400px] bg-surface-container-high animate-pulse rounded-2xl border border-outline-variant" />
            ))
          ) : (
            plans.map((plan) => {
              const isCurrent = currentPlan === plan.id.toLowerCase();
              const Icon = PLAN_ICONS[plan.id.toLowerCase()] || Zap;
              
              return (
                <div 
                  key={plan.id} 
                  className={cn(
                    "relative ds-panel p-8 rounded-2xl flex flex-col transition-all duration-300",
                    PLAN_COLORS[plan.id.toLowerCase()] || "border-outline-variant",
                    isCurrent && "scale-[1.02] shadow-[0_0_40px_rgba(232,197,71,0.05)]"
                  )}
                >
                  {plan.id === "pro" && (
                    <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-primary-accent text-surface text-[9px] px-3 py-0.5 rounded-full font-bold uppercase tracking-[0.2em]">
                      Recommended
                    </div>
                  )}
                  
                  <div className="mb-8">
                    <div className="w-12 h-12 rounded-xl bg-on-surface/[0.03] flex items-center justify-center text-on-surface mb-6 border border-outline-variant">
                      <Icon className="w-6 h-6" />
                    </div>
                    <h3 className="text-xl font-display font-bold text-on-surface uppercase tracking-wider mb-2">{plan.name}</h3>
                    <p className="text-xs text-on-surface-variant/60 font-medium leading-relaxed h-10">{plan.description}</p>
                  </div>

                  <div className="mb-8">
                    <div className="flex items-baseline gap-1">
                      <span className="text-3xl font-display font-bold text-on-surface">
                        {plan.unitAmount != null ? `$${(plan.unitAmount / 100).toFixed(0)}` : "$0"}
                      </span>
                      <span className="text-[10px] font-mono text-on-surface-variant uppercase tracking-widest">
                        / {plan.interval ?? "forever"}
                      </span>
                    </div>
                  </div>

                  <ul className="space-y-4 mb-10 flex-1">
                    <li className="flex items-start gap-3 text-xs text-on-surface-variant">
                      <Check className="w-4 h-4 text-green shrink-0 mt-0.5" />
                      <span>{plan.generationsPerMonth?.toLocaleString() ?? "Unlimited"} protocol executions</span>
                    </li>
                    <li className="flex items-start gap-3 text-xs text-on-surface-variant">
                      <Check className="w-4 h-4 text-green shrink-0 mt-0.5" />
                      <span>Advanced Governance API</span>
                    </li>
                    <li className="flex items-start gap-3 text-xs text-on-surface-variant">
                      <Check className="w-4 h-4 text-green shrink-0 mt-0.5" />
                      <span>Priority Priority Processing</span>
                    </li>
                  </ul>

                  <Button
                    className={cn(
                      "w-full font-mono text-[10px] uppercase tracking-[0.2em] h-12 transition-all",
                      isCurrent ? "bg-surface-container-highest text-on-surface-variant cursor-default hover:bg-surface-container-highest" : "btn-primary"
                    )}
                    disabled={isCurrent || checkoutMutation.isPending}
                    onClick={() => plan.priceId && checkoutMutation.mutate(plan.priceId)}
                  >
                    {isCurrent ? "Current Tier" : plan.priceId ? "Upgrade Protocol" : "Initialize Tier"}
                  </Button>
                </div>
              );
            })
          )}
        </div>

        <div className="ds-panel-inset p-8 rounded-2xl flex flex-col md:flex-row items-center justify-between gap-6 border-outline-variant/40">
          <div className="flex items-center gap-6">
            <div className="w-14 h-14 rounded-2xl bg-on-surface/[0.03] flex items-center justify-center text-on-surface-variant border border-outline-variant">
              <Building2 className="w-7 h-7" />
            </div>
            <div>
              <h3 className="text-lg font-display font-bold text-on-surface uppercase tracking-wider">Custom Governance</h3>
              <p className="text-xs text-on-surface-variant/60 font-medium max-w-sm">Need dedicated resource pools or custom compliance layers? Let's engineer a solution.</p>
            </div>
          </div>
          <Button variant="outline" className="border-outline-variant text-on-surface-variant hover:text-on-surface font-mono text-[10px] uppercase tracking-widest h-11 px-8">
            Contact Engineering
          </Button>
        </div>
      </div>
    </div>
  );
}
