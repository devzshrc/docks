import { auth, connectSlack } from "@docks/api";
import { fromNodeHeaders } from "better-auth/node";
import { Router, type Router as ExpressRouter } from "express";

/** Slack OAuth callback (incoming webhook install). */
export const slackCallbackRouter: ExpressRouter = Router();

const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:3000";

slackCallbackRouter.get("/integrations/slack/callback", async (req, res) => {
  const back = (status: string) =>
    res.redirect(`${CLIENT_URL}/settings/integrations?slack=${status}`);

  // The person clicked "Cancel" on Slack's screen.
  if (req.query.error) return back("cancelled");
  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) return back("invalid");

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return back("signed-out");

  try {
    await connectSlack(session.user.id, code, state);
    back("connected");
  } catch (err) {
    console.error(`[slack] connect failed: ${(err as Error).message}`);
    back("failed");
  }
});
