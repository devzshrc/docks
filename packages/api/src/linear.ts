/** Linear (api.linear.app) lookups for the review page. One personal API key per workspace. */

export interface LinearIssue {
  id: string; // ENG-123
  title: string;
  url: string;
  state: { name: string; type: string; color: string };
  assignee: string | null;
  priority: string;
}

const FIELDS = "identifier title url priorityLabel state{ name type color } assignee{ name }";

async function gql<T>(apiKey: string, query: string, variables: Record<string, string> = {}) {
  const res = await fetch("https://api.linear.app/graphql", {
    method: "POST",
    // Personal API keys go in the header as-is (OAuth tokens would need "Bearer ").
    headers: { "Content-Type": "application/json", Authorization: apiKey },
    body: JSON.stringify({ query, variables }),
  });
  if (res.status === 401 || res.status === 403) throw new Error("Linear rejected the API key");
  const body = (await res.json()) as { data?: T; errors?: { message: string }[] };
  return body;
}

/** Validates a key and names the organization it belongs to. */
export async function linearOrg(apiKey: string): Promise<string> {
  const { data, errors } = await gql<{ viewer: { organization: { name: string } } }>(apiKey, "{ viewer { organization { name } } }");
  if (!data?.viewer) throw new Error(errors?.[0]?.message ?? "Couldn't read your Linear workspace");
  return data.viewer.organization.name;
}

/** Issues by identifier; ids Linear doesn't know are simply absent. */
export async function linearIssues(apiKey: string, ids: string[]): Promise<LinearIssue[]> {
  if (!ids.length) return [];
  const vars = Object.fromEntries(ids.map((id, i) => [`i${i}`, id]));
  const query = `query(${ids.map((_, i) => `$i${i}:String!`).join(",")}){ ${ids
    .map((_, i) => `a${i}: issue(id:$i${i}){ ${FIELDS} }`)
    .join(" ")} }`;
  const { data } = await gql<Record<string, { identifier: string; title: string; url: string; priorityLabel: string; state: LinearIssue["state"]; assignee: { name: string } | null } | null>>(apiKey, query, vars);
  return Object.values(data ?? {}).flatMap((i) =>
    i ? [{ id: i.identifier, title: i.title, url: i.url, state: i.state, assignee: i.assignee?.name ?? null, priority: i.priorityLabel }] : [],
  );
}
