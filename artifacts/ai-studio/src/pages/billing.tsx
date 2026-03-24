import { useEffect } from "react";
import { Check, CreditCard, Shield, Zap, Sparkles, Building2 } from "lucide-react";
import { useAuth } from "@workspace/replit-auth-web";
import { Button } from "@/components/ui/button";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { formatDistanceToNow } from "date-fns";

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
  free: "border-border",
  pro: "border-violet-500 ring-1 ring-violet-500",
  enterprise: "border-amber-500 ring-1 ring-amber-500",
};

export default function BillingPage() {
  const { isAuthenticated, login } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (!checkout) return;

    // Strip the param from the URL without reloading
    const clean = window.location.pathname;
    window.history.replaceState({}, "", clean);

    if (checkout === "success") {
      toast({
        title: "Subscription activated!",
        description: "Your plan has been upgraded. It may take a few seconds to reflect.",
      });
      // Refetch subscription status after a short delay to pick up webhook sync
      setTimeout(() => {
        queryClient.invalidateQueries({ queryKey: ["billing-subscription"] });
      }, 3000);
    } else if (checkout === "cancel") {
      toast({
        title: "Checkout cancelled",
        description: "No changes were made to your plan.",
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
      if (data.url) window.location.href = data.url;
    },
  });

  const portalMutation = useMutation({
    mutationFn: () =>
      fetchJson<{ url: string }>("/api/billing/portal", { method: "POST" }),
    onSuccess: (data) => {
      if (data.url) window.location.href = data.url;
    },
  });

  const isActive = subscription?.status === "active" || subscription?.status === "trialing";

  return (
    <div className="flex-1 overflow-auto p-6 max-w-4xl mx-auto w-full">
      <div className="space-y-8">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <CreditCard className="w-6 h-6 text-violet-500" />
            Billing & Plans
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Choose a plan that fits your usage. Upgrade anytime, cancel anytime.
          </p>
        </div>

        {/* Current subscription status */}
        {isAuthenticated && isActive && (
          <div className="border border-green-500/30 bg-green-500/10 rounded-lg p-4 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-green-700 dark:text-green-400">
                Active subscription — {subscription?.planName ?? "Pro"}
              </p>
              {subscription?.currentPeriodEnd && (
                <p className="text-xs text-muted-foreground mt-0.5">
                  {subscription.cancelAtPeriodEnd
                    ? `Cancels ${formatDistanceToNow(new Date(subscription.currentPeriodEnd), { addSuffix: true })}`
                    : `Renews ${formatDistanceToNow(new Date(subscription.currentPeriodEnd), { addSuffix: true })}`}
                </p>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => portalMutation.mutate()}
              disabled={portalMutation.isPending}
            >
              {portalMutation.isPending ? "Opening…" : "Manage Subscription"}
            </Button>
          </div>
        )}

        {/* Plans grid */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {plansLoading && [1, 2, 3].map((i) => (
            <div key={i} className="h-64 rounded-xl bg-muted animate-pulse" />
          ))}

          {plans.map((plan) => {
            const planKey = plan.id.toLowerCase().includes("pro")
              ? "pro"
              : plan.id.toLowerCase().includes("enterprise") || (plan.unitAmount ?? 0) > 5000
              ? "enterprise"
              : "free";
            const Icon = PLAN_ICONS[planKey] ?? Zap;
            const colorClass = PLAN_COLORS[planKey];
            const isCurrentPlan = subscription?.planName?.toLowerCase().includes(planKey);
            const isFree = !plan.unitAmount || plan.unitAmount === 0;

            const features: string[] = [
              plan.generationsPerMonth
                ? `${plan.generationsPerMonth.toLocaleString()} generations/mo`
                : "Unlimited generations",
              "TypeScript Express route generation",
              "Semantic cache (Layer 8)",
              "PII redaction & injection shield",
              ...(planKey !== "free" ? ["Priority support", "Higher rate limits"] : []),
              ...(planKey === "enterprise" ? ["Dedicated support", "Custom rate limits", "SLA guarantee"] : []),
            ];

            return (
              <div
                key={plan.id}
                className={`border rounded-xl p-6 flex flex-col gap-4 bg-card ${colorClass} relative`}
              >
                {planKey === "pro" && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-violet-600 text-white text-xs px-3 py-0.5 rounded-full font-medium">
                    Most Popular
                  </div>
                )}

                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <Icon className="w-4 h-4 text-muted-foreground" />
                    <h3 className="font-semibold">{plan.name}</h3>
                  </div>
                  <p className="text-xs text-muted-foreground">{plan.description}</p>
                </div>

                <div>
                  <span className="text-3xl font-bold">
                    {isFree ? "Free" : `$${((plan.unitAmount ?? 0) / 100).toFixed(0)}`}
                  </span>
                  {!isFree && plan.interval && (
                    <span className="text-muted-foreground text-sm">/{plan.interval}</span>
                  )}
                </div>

                <ul className="space-y-1.5 flex-1">
                  {features.map((f) => (
                    <li key={f} className="flex items-start gap-2 text-xs">
                      <Check className="w-3.5 h-3.5 text-green-500 mt-0.5 flex-shrink-0" />
                      {f}
                    </li>
                  ))}
                </ul>

                {!isAuthenticated ? (
                  <Button size="sm" variant={planKey === "pro" ? "default" : "outline"} onClick={login}>
                    Log in to subscribe
                  </Button>
                ) : isCurrentPlan ? (
                  <Button size="sm" variant="outline" disabled>
                    Current Plan
                  </Button>
                ) : isFree ? (
                  <Button size="sm" variant="outline" disabled>
                    Default Plan
                  </Button>
                ) : !plan.priceId ? (
                  <Button size="sm" variant="outline" disabled>
                    Coming Soon
                  </Button>
                ) : (
                  <Button
                    size="sm"
                    variant={planKey === "pro" ? "default" : "outline"}
                    onClick={() => checkoutMutation.mutate(plan.priceId!)}
                    disabled={checkoutMutation.isPending}
                  >
                    {checkoutMutation.isPending ? "Redirecting…" : `Upgrade to ${plan.name}`}
                  </Button>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-xs text-center text-muted-foreground flex items-center justify-center gap-1">
          <Shield className="w-3 h-3" />
          Secure payments powered by Stripe. Cancel anytime.
        </p>
      </div>
    </div>
  );
}
