/**
 * Stripe client placeholder.
 * Replace this file with the code from the Stripe integration once connected.
 * The billing routes will gracefully handle the "Stripe not configured" error.
 */

export async function getStripeSync(): Promise<{
  processWebhook: (payload: Buffer, sig: string) => Promise<void>;
  findOrCreateManagedWebhook: (url: string) => Promise<{ webhook: { url: string } }>;
  syncBackfill: () => Promise<void>;
}> {
  throw new Error("Stripe integration not configured. Connect Stripe to enable billing.");
}

export async function getUncachableStripeClient(): Promise<import("stripe").default> {
  throw new Error("Stripe integration not configured. Connect Stripe to enable billing.");
}
