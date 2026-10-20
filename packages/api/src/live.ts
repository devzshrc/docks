import { db, schema } from "@docks/db";
import { eq } from "drizzle-orm";
import { assertMember } from "./access.js";
import { isSuspended } from "./account-status.js";
import { logError } from "./logger.js";

/**
 * Live updates: tell open browsers *that* something changed, never *what*.
 * Clients re-fetch through the normal permission-checked queries, so an event
 * carries no repo names, titles or other content.
 */
export type LiveTopic = "pr" | "guide" | "inbox" | "release" | "issues";
export interface LiveEvent {
  t: LiveTopic;
}

/** Deliver to every open connection in the workspace, or only to `userId`'s. */
export type LivePublisher = (workspaceId: string, event: LiveEvent, userId?: string) => Promise<void>;

type Listener = { userId: string; send: (event: LiveEvent) => void };
const local = new Map<string, Set<Listener>>();

/** Single-process hub (Node server, tests). Workers swap in a Durable Object publisher. */
const localPublisher: LivePublisher = async (workspaceId, event, userId) => {
  for (const l of local.get(workspaceId) ?? []) if (!userId || l.userId === userId) l.send(event);
};

let publisher: LivePublisher = localPublisher;

export function useLivePublisher(next: LivePublisher | undefined) {
  publisher = next ?? localPublisher;
}

export function subscribeLocal(workspaceId: string, userId: string, send: (event: LiveEvent) => void) {
  const listener = { userId, send };
  const set = local.get(workspaceId) ?? new Set<Listener>();
  set.add(listener);
  local.set(workspaceId, set);
  return () => {
    set.delete(listener);
    if (!set.size) local.delete(workspaceId);
  };
}

/** Best effort: a missed event only means the client's fallback poll catches it. */
export async function publish(workspaceId: string, event: LiveEvent, userId?: string) {
  try {
    await publisher(workspaceId, event, userId);
  } catch (err) {
    logError("live.publish_failed", err);
  }
}

export async function publishForRepo(repoId: number, event: LiveEvent) {
  const [row] = await db
    .select({ workspaceId: schema.githubInstallation.workspaceId })
    .from(schema.repository)
    .innerJoin(schema.githubInstallation, eq(schema.githubInstallation.id, schema.repository.installationId))
    .where(eq(schema.repository.id, repoId))
    .limit(1);
  if (row?.workspaceId) await publish(row.workspaceId, event);
}

/** Same bar as protectedProcedure plus workspace membership (and its 2FA rule). */
export async function canJoinLive(userId: string, workspaceId: string): Promise<boolean> {
  if (await isSuspended(userId)) return false;
  try {
    await assertMember(userId, workspaceId);
    return true;
  } catch {
    return false;
  }
}
