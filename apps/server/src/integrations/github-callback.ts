import { auth, completeAuthorization, linkInstallation } from "@docks/api";
import { fromNodeHeaders } from "better-auth/node";
import { Router, type Router as ExpressRouter } from "express";

/**
 * GitHub App "Setup URL": GitHub redirects here after install with
 * ?installation_id=…&setup_action=install&state=<workspaceId>.
 */
export const githubCallbackRouter: ExpressRouter = Router();

const CLIENT_URL = process.env.CLIENT_URL ?? "http://localhost:3000";

githubCallbackRouter.get("/integrations/github/callback", async (req, res) => {
  const back = (status: string) =>
    res.redirect(`${CLIENT_URL}/settings/integrations?github=${status}`);

  const installationId = Number(req.query.installation_id);
  const workspaceId = typeof req.query.state === "string" ? req.query.state : "";
  if (!Number.isInteger(installationId) || !workspaceId) return back("invalid");

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return back("signed-out");

  try {
    await linkInstallation(session.user.id, installationId, workspaceId);
    back("connected");
  } catch (err) {
    console.error(`[github] link installation ${installationId} failed: ${(err as Error).message}`);
    back("failed");
  }
});

/** GitHub App user authorization: links the person's GitHub account. */
githubCallbackRouter.get("/integrations/github/oauth/callback", async (req, res) => {
  const back = (status: string) =>
    res.redirect(`${CLIENT_URL}/settings/integrations?account=${status}`);

  const code = typeof req.query.code === "string" ? req.query.code : "";
  const state = typeof req.query.state === "string" ? req.query.state : "";
  if (!code || !state) return back("invalid");

  const session = await auth.api.getSession({ headers: fromNodeHeaders(req.headers) });
  if (!session?.user) return back("signed-out");

  try {
    await completeAuthorization(session.user.id, code, state);
    back("connected");
  } catch (err) {
    console.error(`[github] user authorization failed: ${(err as Error).message}`);
    back("failed");
  }
});
