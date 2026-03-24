import { logger } from "./logger";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Payload must be a Buffer — ensure the webhook route is registered before express.json()");
    }

    try {
      const { getStripeSync } = await import("./stripeClient");
      const sync = await getStripeSync();
      await sync.processWebhook(payload, signature);
    } catch (err) {
      logger.warn({ err }, "Stripe webhook processing failed or Stripe not configured");
      throw err;
    }
  }
}
