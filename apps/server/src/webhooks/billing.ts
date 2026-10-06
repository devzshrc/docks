import { handleBillingWebhook } from "@docks/api";
import express, { Router, type Router as ExpressRouter } from "express";

/**
 * Dodo Payments subscription events (plan.md §9.2). Raw body: the
 * Standard Webhooks signature covers the exact bytes.
 */
export const billingWebhookRouter: ExpressRouter = Router();

billingWebhookRouter.post(
  "/webhooks/dodo-payments",
  express.raw({ type: "application/json", limit: "1mb" }),
  async (req, res) => {
    const headers = {
      "webhook-id": req.header("webhook-id") ?? "",
      "webhook-signature": req.header("webhook-signature") ?? "",
      "webhook-timestamp": req.header("webhook-timestamp") ?? "",
    };
    try {
      const ok = await handleBillingWebhook(req.body as Buffer, headers);
      if (!ok) {
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
      res.json({ received: true });
    } catch (err) {
      // 5xx so Dodo Payments retries the delivery.
      console.error(`[billing] webhook failed: ${(err as Error).message}`);
      res.status(500).json({ error: "Webhook handling failed" });
    }
  },
);
