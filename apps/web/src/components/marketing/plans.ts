export const TEAM_PRICE = 12;
export const FREE_MEMBERS = 5;
export const FREE_REPOS = 3;

export const PLANS = {
  free: {
    name: "Free",
    blurb: "For teams of up to 5 people.",
    features: [
      `Up to ${FREE_MEMBERS} members`,
      `Up to ${FREE_REPOS} repositories`,
      "Pull requests and what blocks merging",
      "File reading order and review checklists",
      "Your review inbox and saved progress",
    ],
  },
  team: {
    name: "Team",
    blurb: "For larger teams and reviews with deadlines.",
    features: [
      "Unlimited members and repositories",
      "Work-hour deadlines and reminders",
      "Requests for a backup reviewer",
      "Release progress and unfinished reviews",
      "Changes since your last review",
      "Download review records as CSV or JSON",
    ],
  },
} as const;

/** Rows for the comparison table: [feature, free, team]. A string cell is shown as text. */
export const COMPARE: { group: string; rows: [string, boolean | string, boolean | string][] }[] = [
  {
    group: "Review",
    rows: [
      ["Review board with merge blockers", true, true],
      ["Guided review order", true, true],
      ["Per-repository checklists", true, true],
      ["Changes since your last review", false, true],
      ["Hand off to Claude Code, Codex or Cursor", true, true],
    ],
  },
  {
    group: "Keeping reviews moving",
    rows: [
      ["Personal inbox", true, true],
      ["Work-hour deadlines and reminders", false, true],
      ["Requests for a backup reviewer", false, true],
      ["Slack and Linear", true, true],
    ],
  },
  {
    group: "Releases and records",
    rows: [
      ["Release progress and unfinished reviews", false, true],
      ["Review evidence export", false, "CSV and JSON"],
      ["Insights", true, true],
      ["Audit log", true, true],
    ],
  },
  {
    group: "Workspace",
    rows: [
      ["Members", `Up to ${FREE_MEMBERS}`, "Unlimited"],
      ["Enabled repositories", `Up to ${FREE_REPOS}`, "Unlimited"],
      ["Roles and two-factor sign-in", true, true],
    ],
  },
];

export const FAQ = [
  {
    q: "Does Docks replace GitHub?",
    a: "Docks works with GitHub. Your code and pull requests stay on GitHub. Use Docks to find reviews, read the changes, and send feedback.",
  },
  {
    q: "Will my comments and approvals appear on GitHub?",
    a: "Yes. Link your GitHub account, then post comments and approvals from Docks under your GitHub name.",
  },
  {
    q: "Who can see which repositories?",
    a: "Your GitHub permissions decide which repositories you can see in Docks.",
  },
  {
    q: "Can we start free?",
    a: `Yes. Free includes up to ${FREE_MEMBERS} members and ${FREE_REPOS} repositories for as long as you need.`,
  },
  {
    q: "What does Team cost?",
    a: `$${TEAM_PRICE} USD for each workspace member per month, plus applicable taxes. Team includes unlimited members and repositories. It also adds deadlines, backup reviewer requests, release tracking, and review record downloads.`,
  },
  {
    q: "How do we manage the subscription?",
    a: "Workspace owners can open Settings → Billing to change the member count, update payment details, or cancel.",
  },
];
