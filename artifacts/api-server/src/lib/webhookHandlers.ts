import { logger } from "./logger";

export class WebhookHandlers {
  static async processWebhook(payload: Buffer, signature: string): Promise<void> {
    if (!Buffer.isBuffer(payload)) {
      throw new Error("Payload must be a Buffer — ensure the webhook route is registered before express.json()");
    }

    let getStripeSync: (() => Promise<{ processWebhook: (p: Buffer, sig: string) => Promise<void> }>) | undefined;

    try {
      const mod = await import("./stripeClient");
      getStripeSync = mod.getStripeSync;
    } catch {
      logger.warn("stripeClient not available — webhook ignored");
      return;
    }

    if (!getStripeSync) {
      logger.warn("Stripe not configured — webhook ignored");
      return;
    }

    const sync = await getStripeSync();
    await sync.processWebhook(payload, signature);
  }
}
