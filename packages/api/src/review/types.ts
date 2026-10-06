/** Shared review types — plan.md §9.1. */

export type ReviewColumn =
  | "needs_reviewer"
  | "waiting"
  | "changes_requested"
  | "approved";

export type RiskTier = "core" | "config" | "test" | "noise";

export interface GitHubUserRef {
  login: string;
  avatar_url: string;
}

export interface BoardCard {
  repo: string;
  number: number;
  title: string;
  url: string;
  author: GitHubUserRef;
  reviewers: GitHubUserRef[];
  column: ReviewColumn;
  stuck: boolean;
  updatedAt: string;
  additions: number;
  deletions: number;
  ci: "pass" | "fail" | "pending" | "none";
  claimedBy: { userId: string; name: string } | null;
  labels: string[];
  priority: boolean;
  draft: boolean;
  size: "S" | "M" | "L";
}

export interface RankedFile {
  filename: string;
  sha: string;
  status: string;
  patch?: string;
  additions: number;
  deletions: number;
  tier: RiskTier;
  viewed: boolean;
  changedSinceViewed: boolean;
}

export interface Guide {
  source: "ai" | "fallback";
  summary: string;
  steps: { title: string; why: string; files: string[] }[];
  checklist: { question: string; files: string[] }[];
}
