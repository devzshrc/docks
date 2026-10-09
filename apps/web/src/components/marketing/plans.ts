export const TEAM_PRICE = 12;
export const FREE_MEMBERS = 5;
export const FREE_REPOS = 3;

export const PLANS = {
  free: {
    name: "Free",
    blurb: "A focused review queue for small teams.",
    features: [
      `Up to ${FREE_MEMBERS} workspace members`,
      `Up to ${FREE_REPOS} enabled repositories`,
      "Review board and merge blockers",
      "Guided review order and checklists",
      "Personal inbox and review progress",
    ],
  },
  team: {
    name: "Team",
    blurb: "Keep every review moving, up to the release.",
    features: [
      "Unlimited members and repositories",
      "Work-hour deadlines and reminders",
      "Backup reviewer requests",
      "Release tracking and readiness",
      "Changes since your last review",
      "Evidence exports in CSV and JSON",
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
      ["Backup reviewer requests", false, true],
      ["Slack and Linear", true, true],
    ],
  },
  {
    group: "Releases and records",
    rows: [
      ["Release tracking and readiness", false, true],
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
    a: "No. Docks connects to GitHub. Your repositories, pull requests and review history stay there. Docks gives your team one place to see what is waiting, in what order to read it, and who is next.",
  },
  {
    q: "Do reviews post back to GitHub?",
    a: "Yes. When you link your GitHub account, approvals and comments you make in Docks post to GitHub as you.",
  },
  {
    q: "Who can see which repositories?",
    a: "Each person sees only the repositories they can open on GitHub. Docks never widens access.",
  },
  {
    q: "Can we start free?",
    a: `Yes. Free includes up to ${FREE_MEMBERS} workspace members and ${FREE_REPOS} enabled repositories, with no time limit.`,
  },
  {
    q: "What does Team cost?",
    a: `$${TEAM_PRICE} USD for each workspace member per month, plus applicable taxes. It adds deadlines, backup reviewers, release tracking and evidence exports.`,
  },
  {
    q: "How do we manage the subscription?",
    a: "Workspace owners open the billing portal from Settings to change seats, update payment details or cancel.",
  },
];
