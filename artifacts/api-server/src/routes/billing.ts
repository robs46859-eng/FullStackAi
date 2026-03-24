import { Router, type IRouter } from "express";
import { db, usersTable } from "@workspace/db";
import { eq, sql } from "drizzle-orm";
import { logger } from "../lib/logger";

const router: IRouter = Router();

const STATIC_PLANS = [
  {
    id: "free",
    name: "Free",
    description: "Get started with 100 code generations per month",
    priceId: null,
    unitAmount: 0,
    currency: "usd",
    interval: null,
    generationsPerMonth: 100,
  },
  {
    id: "pro",
    name: "Pro",
    description: "10,000 generations per month + priority support",
    priceId: null,
    unitAmount: 2900,
    currency: "usd",
    interval: "month",
    generationsPerMonth: 10000,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    description: "Unlimited generations + dedicated support",
    priceId: null,
    unitAmount: 14900,
    currency: "usd",
    interval: "month",
    generationsPerMonth: null,
  },
];

async function getStripeProducts() {
  try {
    const result = await db.execute(sql`
      WITH paginated AS (
        SELECT id, name, description, metadata
        FROM stripe.products
        WHERE active = true
        ORDER BY id
        LIMIT 20
      )
      SELECT
        p.id as product_id,
        p.name as product_name,
        p.description as product_description,
        p.metadata,
        pr.id as price_id,
        pr.unit_amount,
        pr.currency,
        pr.recurring
      FROM paginated p
      LEFT JOIN stripe.prices pr ON pr.product = p.id AND pr.active = true
      ORDER BY p.id, pr.unit_amount
    `);
    return result.rows as Array<{
      product_id: string;
      product_name: string;
      product_description: string;
      metadata: Record<string, string> | null;
      price_id: string | null;
      unit_amount: number | null;
      currency: string;
      recurring: { interval: string } | null;
    }>;
  } catch {
    return null;
  }
}

router.get("/billing/plans", async (_req, res) => {
  const stripeRows = await getStripeProducts();

  if (!stripeRows || stripeRows.length === 0) {
    res.json(STATIC_PLANS);
    return;
  }

  const productsMap = new Map<string, typeof STATIC_PLANS[0]>();
  for (const row of stripeRows) {
    if (!productsMap.has(row.product_id)) {
      const meta = row.metadata ?? {};
      productsMap.set(row.product_id, {
        id: row.product_id,
        name: row.product_name,
        description: row.product_description ?? "",
        priceId: row.price_id ?? null,
        unitAmount: row.unit_amount ?? 0,
        currency: row.currency ?? "usd",
        interval: row.recurring?.interval ?? null,
        generationsPerMonth: meta.generations_per_month ? parseInt(meta.generations_per_month, 10) : null,
      });
    }
  }

  res.json(Array.from(productsMap.values()));
});

router.get("/billing/subscription", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.user.id));

  if (!user?.stripeSubscriptionId) {
    res.json({ status: null, planName: null, currentPeriodEnd: null, cancelAtPeriodEnd: null });
    return;
  }

  try {
    const result = await db.execute(sql`
      SELECT s.status, s.current_period_end, s.cancel_at_period_end, p.name as plan_name
      FROM stripe.subscriptions s
      LEFT JOIN stripe.prices pr ON pr.id = (
        SELECT item->>'price' FROM jsonb_array_elements(s.items) AS item LIMIT 1
      )
      LEFT JOIN stripe.products p ON p.id = pr.product
      WHERE s.id = ${user.stripeSubscriptionId}
      LIMIT 1
    `);

    const sub = result.rows[0] as {
      status: string;
      current_period_end: string;
      cancel_at_period_end: boolean;
      plan_name: string;
    } | undefined;

    res.json({
      status: sub?.status ?? null,
      planName: sub?.plan_name ?? null,
      currentPeriodEnd: sub?.current_period_end ?? null,
      cancelAtPeriodEnd: sub?.cancel_at_period_end ?? null,
    });
  } catch {
    res.json({ status: null, planName: null, currentPeriodEnd: null, cancelAtPeriodEnd: null });
  }
});

router.post("/billing/checkout", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  const { priceId } = req.body as { priceId: string };
  if (!priceId) {
    res.status(400).json({ error: "priceId is required" });
    return;
  }

  try {
    const { getUncachableStripeClient } = await import("../lib/stripeClient");
    const stripe = await getUncachableStripeClient();

    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));

    let customerId = user?.stripeCustomerId ?? undefined;
    if (!customerId) {
      const customer = await stripe.customers.create({
        email: req.user.email ?? undefined,
        metadata: { userId: req.user.id },
      });
      customerId = customer.id;
      await db.update(usersTable).set({ stripeCustomerId: customerId }).where(eq(usersTable.id, req.user.id));
    }

    const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers.host}`;

    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      payment_method_types: ["card"],
      line_items: [{ price: priceId, quantity: 1 }],
      mode: "subscription",
      success_url: `${origin}/?checkout=success`,
      cancel_url: `${origin}/?checkout=cancel`,
    });

    res.json({ url: session.url });
  } catch (err) {
    logger.error({ err }, "Checkout session creation failed");
    res.status(500).json({ error: "Failed to create checkout session" });
  }
});

router.post("/billing/portal", async (req, res) => {
  if (!req.isAuthenticated()) {
    res.status(401).json({ error: "Unauthorized" });
    return;
  }

  try {
    const [user] = await db.select().from(usersTable).where(eq(usersTable.id, req.user.id));
    if (!user?.stripeCustomerId) {
      res.status(400).json({ error: "No billing account found" });
      return;
    }

    const { getUncachableStripeClient } = await import("../lib/stripeClient");
    const stripe = await getUncachableStripeClient();

    const origin = `${req.headers["x-forwarded-proto"] ?? "https"}://${req.headers["x-forwarded-host"] ?? req.headers.host}`;

    const portal = await stripe.billingPortal.sessions.create({
      customer: user.stripeCustomerId,
      return_url: origin,
    });

    res.json({ url: portal.url });
  } catch (err) {
    logger.error({ err }, "Billing portal creation failed");
    res.status(500).json({ error: "Failed to create billing portal session" });
  }
});

export default router;
