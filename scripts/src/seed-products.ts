/**
 * Seed Stripe products and prices for AI Studio.
 * Run with: pnpm --filter @workspace/scripts exec tsx src/seed-products.ts
 *
 * Safe to run multiple times — checks for existing products before creating.
 */
import { getUncachableStripeClient } from "./stripeClient";

const PRODUCTS = [
  {
    name: "Pro",
    description: "10,000 generations per month + priority support",
    metadata: { generations_per_month: "10000", plan_tier: "pro" },
    price: { unit_amount: 2900, currency: "usd", interval: "month" as const },
  },
  {
    name: "Enterprise",
    description: "Unlimited generations + dedicated support + SLA",
    metadata: { plan_tier: "enterprise" },
    price: { unit_amount: 14900, currency: "usd", interval: "month" as const },
  },
];

async function seedProducts() {
  const stripe = await getUncachableStripeClient();

  for (const def of PRODUCTS) {
    const existing = await stripe.products.search({ query: `name:'${def.name}'` });
    if (existing.data.length > 0) {
      console.log(`✓ ${def.name} already exists (${existing.data[0].id})`);
      continue;
    }

    const product = await stripe.products.create({
      name: def.name,
      description: def.description,
      metadata: def.metadata,
    });

    const price = await stripe.prices.create({
      product: product.id,
      unit_amount: def.price.unit_amount,
      currency: def.price.currency,
      recurring: { interval: def.price.interval },
    });

    console.log(`✅ Created ${def.name}: product=${product.id}, price=${price.id}`);
  }

  console.log("Done. Webhooks will sync products to the local database automatically.");
}

seedProducts().catch((err) => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
