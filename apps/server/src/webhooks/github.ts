import { handleGithubEvent, verifyGithubSignature } from "@docks/api";
import express, { Router, type Router as ExpressRouter } from "express";

/**
 * GitHub App webhooks (plan.md §9.2). Mounted before express.json():
 * the signature is computed over the raw body.
 */
export const githubWebhookRouter: ExpressRouter = Router();

githubWebhookRouter.post(
  "/webhooks/github",
  express.raw({ type: "application/json", limit: "5mb" }),
  async (req, res) => {
    const body = req.body as Buffer;
    if (!verifyGithubSignature(body, req.header("x-hub-signature-256"))) {
      res.status(401).json({ error: "Invalid signature" });
      return;
    }
    const event = req.header("x-github-event") ?? "";
    try {
      await handleGithubEvent(event, JSON.parse(body.toString("utf8")));
      res.status(202).json({ ok: true });
    } catch (err) {
      // 5xx makes GitHub show the delivery as failed so it can be redelivered.
      console.error(`[webhook] ${event} failed: ${(err as Error).message}`);
      res.status(500).json({ error: "Webhook handling failed" });
    }
  },
);
