"use client";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { Button } from "@/components/ui/button";
import { QueryError } from "@/components/query-state";
import { BackupReviewer } from "@/components/review/backup-reviewer";
import { useWorkspace } from "@/hooks/use-workspace";
import { useTRPC } from "@/trpc/react";
type Rules = {
  hours: number;
  reminderHours: number;
  schedule: {
    timezone: string;
    days: number[];
    startHour: number;
    endHour: number;
  };
  leadUserId: string;
};
function Policy({
  repo,
  initial,
  enabled,
  leads,
  disabled,
}: {
  repo: string;
  initial: Rules;
  enabled: boolean;
  leads: { userId: string; name: string }[];
  disabled: boolean;
}) {
  const trpc = useTRPC();
  const client = useQueryClient();
  const [rules, setRules] = useState(initial);
  const [active, setActive] = useState(enabled);
  const save = useMutation(
    trpc.delivery.savePolicy.mutationOptions({
      onSuccess: () =>
        Promise.all([
          client.invalidateQueries(trpc.delivery.policies.queryFilter()),
          client.invalidateQueries(trpc.delivery.cycles.queryFilter()),
        ]),
    }),
  );
  const field = "bg-background rounded border p-2";
  return (
    <form
      className="space-y-3 rounded-lg border p-4"
      onSubmit={(e) => {
        e.preventDefault();
        save.mutate({ repo, enabled: active, rules });
      }}
    >
      <h2 className="font-medium">{repo}</h2>
      <label className="flex gap-2">
        <input
          type="checkbox"
          checked={active}
          disabled={disabled && !enabled}
          onChange={(e) => setActive(e.target.checked)}
        />
        Enable review deadlines
      </label>
      <fieldset
        disabled={disabled || save.isPending}
        className="flex flex-wrap gap-3"
      >
        <label>
          Deadline (working hours)
          <input
            className={`${field} block w-24`}
            type="number"
            min={1}
            max={80}
            value={rules.hours}
            onChange={(e) =>
              setRules({ ...rules, hours: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Remind before (working hours)
          <input
            className={`${field} block w-24`}
            type="number"
            min={0}
            max={79}
            value={rules.reminderHours}
            onChange={(e) =>
              setRules({ ...rules, reminderHours: Number(e.target.value) })
            }
          />
        </label>
        <label>
          Timezone
          <input
            className={`${field} block`}
            value={rules.schedule.timezone}
            onChange={(e) =>
              setRules({
                ...rules,
                schedule: { ...rules.schedule, timezone: e.target.value },
              })
            }
          />
        </label>
        <label>
          Work starts
          <select
            className={`${field} block`}
            value={rules.schedule.startHour}
            onChange={(e) =>
              setRules({
                ...rules,
                schedule: {
                  ...rules.schedule,
                  startHour: Number(e.target.value),
                },
              })
            }
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h} value={h}>
                {h}:00
              </option>
            ))}
          </select>
        </label>
        <label>
          Work ends
          <select
            className={`${field} block`}
            value={rules.schedule.endHour}
            onChange={(e) =>
              setRules({
                ...rules,
                schedule: {
                  ...rules.schedule,
                  endHour: Number(e.target.value),
                },
              })
            }
          >
            {Array.from({ length: 24 }, (_, h) => (
              <option key={h + 1} value={h + 1}>
                {h + 1}:00
              </option>
            ))}
          </select>
        </label>
        <label>
          Escalation lead
          <select
            className={`${field} block`}
            value={rules.leadUserId}
            onChange={(e) => setRules({ ...rules, leadUserId: e.target.value })}
          >
            <option value="">Choose a lead</option>
            {leads.map((lead) => (
              <option key={lead.userId} value={lead.userId}>
                {lead.name}
              </option>
            ))}
          </select>
        </label>
        <div
          className="w-full flex flex-wrap gap-3"
          role="group"
          aria-label={`Working days for ${repo}`}
        >
          {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
            <label key={day}>
              <input
                type="checkbox"
                checked={rules.schedule.days.includes(i)}
                onChange={(e) =>
                  setRules({
                    ...rules,
                    schedule: {
                      ...rules.schedule,
                      days: e.target.checked
                        ? [...rules.schedule.days, i]
                        : rules.schedule.days.filter((d) => d !== i),
                    },
                  })
                }
              />{" "}
              {day}
            </label>
          ))}
        </div>
      </fieldset>
      <p className="text-xs text-muted-foreground">
        One reminder and one escalation per review cycle. Existing deadlines
        keep their saved policy. New policies start clocks when PRs next sync.
        Drafts pause the clock.
      </p>
      <Button
        type="submit"
        size="sm"
        disabled={save.isPending || (disabled && (active || !enabled))}
      >
        {save.isPending ? "Saving…" : "Save policy"}
      </Button>
      {save.error && <QueryError error={save.error} />}
      {save.isSuccess && <p role="status">Policy saved.</p>}
    </form>
  );
}
function Deadlines({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const [overdueOnly, setOverdueOnly] = useState(false);
  const policies = useQuery(
    trpc.delivery.policies.queryOptions({ workspaceId }),
  );
  const cycles = useQuery({
    ...trpc.delivery.cycles.queryOptions({ workspaceId, overdueOnly }),
    refetchInterval: 30000,
  });
  return (
    <div className="space-y-6">
      <p>
        Review deadlines respect the workspace work schedule. Leads can request
        a backup when a review is overdue.
      </p>
      {policies.data?.plan === "free" && (
        <p className="rounded border p-3">
          Deadline automation and backup requests require the{" "}
          <Link className="underline" href="/settings/billing">
            Team plan
          </Link>
          . Existing records remain readable.
        </p>
      )}
      {policies.error && <QueryError error={policies.error} />}
      <section aria-label="Active review deadlines" className="space-y-3">
        <h2 className="font-medium">Active reviews</h2>
        <label>
          <input
            type="checkbox"
            checked={overdueOnly}
            onChange={(e) => setOverdueOnly(e.target.checked)}
          />{" "}
          Overdue only
        </label>
        {cycles.isPending && <p>Loading deadlines…</p>}
        {cycles.error && <QueryError error={cycles.error} />}
        {cycles.data?.length === 0 && <p>No active review deadlines.</p>}
        {cycles.data?.map(({ cycle, repo, title }) => (
          <article key={cycle.id} className="space-y-2 rounded-lg border p-3">
            <Link
              className="font-medium underline"
              href={`/review/${repo}/${cycle.prNumber}`}
            >
              {repo} #{cycle.prNumber}: {title}
            </Link>
            <p className="text-sm">
              {cycle.kind === "first"
                ? "First review"
                : `Review by ${cycle.reviewer}`}{" "}
              ·{" "}
              {cycle.pausedAt
                ? "Paused"
                : cycle.dueAt.getTime() <= Date.now()
                  ? "Overdue"
                  : "Due"}{" "}
              {cycle.dueAt.toLocaleString()} ({cycle.rules.schedule.timezone})
            </p>
            {policies.data?.canManage &&
              policies.data.plan === "team" &&
              !cycle.pausedAt &&
              cycle.dueAt.getTime() <= Date.now() && (
                <BackupReviewer
                  repo={repo}
                  number={cycle.prNumber}
                  cycleId={cycle.id}
                  assigned={cycle.backupLogin}
                />
              )}
          </article>
        ))}
        {cycles.data?.length === 100 && (
          <p>Showing the first 100 deadlines, earliest first.</p>
        )}
      </section>
      {policies.data?.canManage && (
        <section className="space-y-3">
          <h2 className="font-medium">Repository policies</h2>
          {policies.data.repos.map((repo) => {
            const policy = policies.data.policies.find(
              (p) => p.repoId === repo.id,
            );
            return (
              <Policy
                key={repo.id}
                repo={repo.fullName}
                enabled={policy?.enabled ?? false}
                initial={
                  policy?.rules ?? {
                    hours: 8,
                    reminderHours: 2,
                    schedule: {
                      timezone: "UTC",
                      days: [1, 2, 3, 4, 5],
                      startHour: 9,
                      endHour: 17,
                    },
                    leadUserId: policies.data.members[0]?.userId ?? "",
                  }
                }
                leads={policies.data.members}
                disabled={policies.data.plan !== "team"}
              />
            );
          })}
        </section>
      )}
    </div>
  );
}
export default function Page() {
  const { workspace } = useWorkspace();
  return (
    <AppShell title="Review deadlines">
      {workspace ? (
        <Deadlines key={workspace.id} workspaceId={workspace.id} />
      ) : (
        <p>Loading workspace…</p>
      )}
    </AppShell>
  );
}
