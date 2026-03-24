import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { logger } from "./logger";

type StripeEventData = {
  object: {
    id: string;
    customer?: string | null;
    subscription?: string | null;
    status?: string;
    metadata?: Record<string, string>;
    client_reference_id?: string | null;
  };
};

type StripeEvent = {
  type: string;
  data: StripeEventData;
};

async function handleSubscriptionEvent(event: StripeEvent): Promise<void> {
  const sub = event.data.object;
  const customerId = sub.customer;
  const subscriptionId = sub.id;

  if (!customerId || typeof customerId !== "string") return;

  if (event.type === "customer.subscription.deleted") {
    const result = await db
      .update(usersTable)
      .set({ stripeSubscriptionId: null })
      .where(eq(usersTable.stripeCustomerId, customerId))
      .returning({ id: usersTable.id });

    if (result.length > 0) {
      logger.info({ userId: result[0].id, subscriptionId }, "Cleared subscription on user");
    }
    return;
  }

  // created or updated
  const result = await db
    .update(usersTable)
    .set({ stripeSubscriptionId: subscriptionId })
    .where(eq(usersTable.stripeCustomerId, customerId))
    .returning({ id: usersTable.id });

  if (result.length > 0) {
    logger.info({ userId: result[0].id, subscriptionId, event: event.type }, "Updated subscription on user");
  }
}

async function handleCheckoutCompleted(event: StripeEvent): Promise<void> {
  const session = event.data.object;
  const customerId = session.customer;
  const subscriptionId = session.subscription;

  if (!customerId || typeof customerId !== "string") return;
  if (!subscriptionId || typeof subscriptionId !== "string") return;

  // Update subscription ID — customer ID was already stored at checkout creation time
  const result = await db
    .update(usersTable)
    .set({ stripeSubscriptionId: subscriptionId })
    .where(eq(usersTable.stripeCustomerId, customerId))
    .returning({ id: usersTable.id });

  if (result.length > 0) {
    logger.info({ userId: result[0].id, subscriptionId }, "Activated subscription from checkout");
  } else {
    // Customer ID not matched — can happen on first checkout if customerId was just created
    logger.warn({ customerId, subscriptionId }, "checkout.session.completed: no user matched by customerId");
  }
}

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error(
        "Payload must be a Buffer — ensure the webhook route is registered before express.json()"
      );
    }

    // 1. Let stripe-replit-sync verify signature and sync to stripe.* schema
    const { getStripeSync } = await import("./stripeClient");
    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);

    // 2. Parse the raw event (already verified above) for application-level handling
    let event: StripeEvent;
    try {
      event = JSON.parse(payload.toString("utf8")) as StripeEvent;
    } catch {
      logger.warn("Failed to parse webhook payload as JSON — skipping app-level handling");
      return;
    }

    logger.info({ type: event.type }, "Stripe webhook received");

    try {
      switch (event.type) {
        case "checkout.session.completed":
          await handleCheckoutCompleted(event);
          break;
        case "customer.subscription.created":
        case "customer.subscription.updated":
        case "customer.subscription.deleted":
          await handleSubscriptionEvent(event);
          break;
        default:
          break;
      }
    } catch (err) {
      // Log but don't re-throw — stripe-replit-sync sync already succeeded
      logger.error({ err, eventType: event.type }, "App-level webhook handler failed");
    }
  }
}
