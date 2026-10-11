"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import {
  RiAlarmWarningLine,
  RiCheckboxCircleLine,
  RiFlashlightLine,
  RiGitRepositoryLine,
  RiShieldCheckLine,
  RiTimerLine,
} from "@remixicon/react";
import { AppShell } from "@/components/app-shell";
import { Button as CoreButton } from "@/components/ui/button";
import {
  EmptyPreview,
  GhostRow,
  HueIcon,
  UpgradeCallout,
  type Hue,
} from "@/components/ui/empty-preview";
import { Button } from "@/components/ui-compat/controls";
import { Input } from "@/components/ui-compat/controls";
import { Select, SelectItem } from "@/components/ui-compat/controls";
import { Checkbox } from "@/components/ui-compat/controls";
import { Chip } from "@/components/ui-compat/controls";
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
const panel =
  "overflow-hidden rounded-2xl border border-separator-border bg-background-primary-default";
const caption = "text-[13px] text-muted-foreground";

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
  const locked = disabled || save.isPending;
  const schedule = (patch: Partial<Rules["schedule"]>) =>
    setRules({ ...rules, schedule: { ...rules.schedule, ...patch } });
  const valid =
    rules.hours >= 1 &&
    rules.hours <= 80 &&
    rules.reminderHours >= 0 &&
    rules.reminderHours < rules.hours &&
    rules.schedule.days.length > 0 &&
    rules.schedule.startHour < rules.schedule.endHour &&
    Boolean(rules.leadUserId);
  return (
    <details className={panel}>
      <summary className="flex cursor-pointer flex-wrap items-center justify-between gap-3 rounded-xl p-5 outline-none transition-colors hover:bg-foreground/[0.02] focus-visible:ring-2 focus-visible:ring-border-focus-ring">
        <div className="min-w-0 space-y-1">
          <h3 className="break-words text-body-medium text-text-primary">
            {repo}
          </h3>
          <p className={caption}>
            {enabled
              ? `${initial.hours} working hours · ${initial.schedule.timezone}`
              : "Set a deadline, work schedule, and escalation lead"}
          </p>
        </div>
        <Chip color={enabled ? "lime" : "neutral"} variant="caption">
          {enabled ? "Enabled" : "Not configured"}
        </Chip>
      </summary>
      <form
        className="space-y-5 border-t border-separator-border p-5"
        onSubmit={(e) => {
          e.preventDefault();
          save.mutate({ repo, enabled: active, rules });
        }}
      >
        <Checkbox
          isSelected={active}
          isDisabled={save.isPending || (disabled && !enabled)}
          onChange={setActive}
        >
          Enable review deadlines
        </Checkbox>
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          <Input
            label="Deadline (working hours)"
            type="number"
            value={String(rules.hours)}
            onChange={(v) => setRules({ ...rules, hours: Number(v) })}
            isDisabled={locked}
          />
          <Input
            label="Remind before (working hours)"
            type="number"
            value={String(rules.reminderHours)}
            onChange={(v) => setRules({ ...rules, reminderHours: Number(v) })}
            hint="Must be shorter than the deadline."
            isDisabled={locked}
          />
          <Input
            label="Timezone"
            value={rules.schedule.timezone}
            onChange={(timezone) => schedule({ timezone })}
            hint="Use an IANA name, such as Asia/Kolkata."
            isDisabled={locked}
          />
          <div className="space-y-1">
            <p className="text-body-medium text-text-primary">Work starts</p>
            <Select
              aria-label={`Work starts for ${repo}`}
              selectedKey={String(rules.schedule.startHour)}
              onSelectionChange={(v) => schedule({ startHour: Number(v) })}
              isDisabled={locked}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem
                  key={h}
                  id={String(h)}
                >{`${String(h).padStart(2, "0")}:00`}</SelectItem>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-body-medium text-text-primary">Work ends</p>
            <Select
              aria-label={`Work ends for ${repo}`}
              selectedKey={String(rules.schedule.endHour)}
              onSelectionChange={(v) => schedule({ endHour: Number(v) })}
              isDisabled={locked}
            >
              {Array.from({ length: 24 }, (_, h) => (
                <SelectItem
                  key={h + 1}
                  id={String(h + 1)}
                >{`${String(h + 1).padStart(2, "0")}:00`}</SelectItem>
              ))}
            </Select>
          </div>
          <div className="space-y-1">
            <p className="text-body-medium text-text-primary">
              Escalation lead
            </p>
            <Select
              aria-label={`Escalation lead for ${repo}`}
              placeholder="Choose a lead"
              selectedKey={rules.leadUserId || null}
              onSelectionChange={(v) =>
                setRules({ ...rules, leadUserId: String(v ?? "") })
              }
              isDisabled={locked}
            >
              {leads.map((lead) => (
                <SelectItem key={lead.userId} id={lead.userId}>
                  {lead.name}
                </SelectItem>
              ))}
            </Select>
          </div>
        </div>
        <fieldset className="space-y-2" disabled={locked}>
          <legend className="text-body-medium text-text-primary">
            Working days
          </legend>
          <div className="flex flex-wrap gap-4">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day, i) => (
              <Checkbox
                key={day}
                isDisabled={locked}
                isSelected={rules.schedule.days.includes(i)}
                onChange={(checked) =>
                  schedule({
                    days: checked
                      ? [...rules.schedule.days, i]
                      : rules.schedule.days.filter((d) => d !== i),
                  })
                }
              >
                {day}
              </Checkbox>
            ))}
          </div>
        </fieldset>
        <p className={caption}>
          One reminder and one escalation per review. Drafts pause the clock.
          Changes apply to new review cycles after the next sync.
        </p>
        {!valid && active && !disabled && (
          <p
            role="alert"
            className="text-body-2-regular text-text-error-primary"
          >
            Choose working days and a lead. The end time must follow the start
            time, and the reminder must be shorter than the deadline.
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button
            type="submit"
            size="small"
            disabled={
              save.isPending ||
              (active && !valid) ||
              (disabled && (active || !enabled))
            }
          >
            {save.isPending ? "Saving…" : "Save policy"}
          </Button>
          {save.isSuccess && (
            <p role="status" className={caption}>
              Policy saved.
            </p>
          )}
        </div>
        {save.error && <QueryError error={save.error} />}
      </form>
    </details>
  );
}
type Cycles = { cycle: { dueAt: Date; pausedAt: Date | null } }[];

/** Four numbers across the top: what is running, what is late, what is close, and how much is covered. */
function DeadlineStats({
  cycles,
  policies,
}: {
  cycles?: Cycles;
  policies?: { repos: unknown[]; policies: { enabled: boolean }[] };
}) {
  const now = Date.now();
  const live = (cycles ?? []).filter((c) => !c.cycle.pausedAt);
  const overdue = live.filter((c) => c.cycle.dueAt.getTime() <= now).length;
  const soon = live.filter((c) => {
    const left = c.cycle.dueAt.getTime() - now;
    return left > 0 && left < 4 * 3600_000;
  }).length;
  const on = policies?.policies.filter((p) => p.enabled).length ?? 0;
  const stats: {
    label: string;
    value: string;
    hint: string;
    icon: typeof RiTimerLine;
    hue: Hue;
  }[] = [
    {
      label: "Active",
      value: cycles ? String(cycles.length) : "–",
      hint: "reviews on the clock",
      icon: RiTimerLine,
      hue: "amber",
    },
    {
      label: "Overdue",
      value: cycles ? String(overdue) : "–",
      hint: overdue ? "need a nudge" : "all on track",
      icon: RiAlarmWarningLine,
      hue: "red",
    },
    {
      label: "Due soon",
      value: cycles ? String(soon) : "–",
      hint: "within 4 work hours",
      icon: RiFlashlightLine,
      hue: "blue",
    },
    {
      label: "Covered",
      value: policies ? `${on}/${policies.repos.length}` : "–",
      hint: "repositories with a policy",
      icon: RiShieldCheckLine,
      hue: "green",
    },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {stats.map((s) => (
        <div
          key={s.label}
          className="bg-card shadow-card flex flex-col gap-3 rounded-xl p-4"
        >
          <div className="flex items-center justify-between">
            <span className="text-muted-foreground text-[13px]">{s.label}</span>
            <HueIcon
              icon={s.icon}
              hue={s.hue}
              className="size-6 rounded-md [&_svg]:size-3"
            />
          </div>
          <div className="grid gap-1">
            <span className="text-2xl font-semibold tracking-[-0.03em] tabular-nums">
              {s.value}
            </span>
            <span className="text-subtle text-xs">{s.hint}</span>
          </div>
        </div>
      ))}
    </div>
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
      {policies.data?.plan === "free" && (
        <UpgradeCallout
          icon={RiFlashlightLine}
          action={
            <CoreButton asChild size="sm">
              <Link href="/settings/billing">Upgrade</Link>
            </CoreButton>
          }
        >
          Automate deadlines and request backup reviewers with the Team plan.
          You can still view existing deadlines.
        </UpgradeCallout>
      )}
      {policies.error && <QueryError error={policies.error} />}
      <DeadlineStats cycles={cycles.data} policies={policies.data} />
      <section aria-label="Active review deadlines" className={panel}>
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-separator-border p-5">
          <div className="space-y-1">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">
              Active reviews
            </h2>
            <p className={caption}>
              Earliest deadlines first. Open a pull request to take action.
            </p>
          </div>
          <Checkbox isSelected={overdueOnly} onChange={setOverdueOnly}>
            Overdue only
          </Checkbox>
        </div>
        {cycles.isPending && (
          <p
            role="status"
            className="p-6 text-body-regular text-text-secondary"
          >
            Loading deadlines…
          </p>
        )}
        {cycles.error && (
          <div className="p-5">
            <QueryError
              error={cycles.error}
              onRetry={() => void cycles.refetch()}
            />
          </div>
        )}
        {cycles.data?.length === 0 && (
          <EmptyPreview
            icon={overdueOnly ? RiCheckboxCircleLine : RiTimerLine}
            hue={overdueOnly ? "green" : "amber"}
            title={
              overdueOnly ? "No overdue reviews" : "No active deadlines yet"
            }
            description={
              overdueOnly
                ? "Your current reviews are on track. Switch off the filter to see all deadlines."
                : "Each open pull request gets a clock that counts work hours only. When one is about to slip, Docks reminds the reviewer and can ask a backup. Turn on a repository policy below to start."
            }
            preview={
              <>
                <GhostRow hue="amber" accent="bar" wide={70} />
                <GhostRow hue="red" accent="bar" wide={88} />
                <GhostRow hue="green" accent="bar" wide={40} />
              </>
            }
          />
        )}
        <div className="divide-y divide-separator-border">
          {cycles.data?.map(({ cycle, repo, title }) => {
            const overdue =
              !cycle.pausedAt && cycle.dueAt.getTime() <= Date.now();
            const due = cycle.dueAt.toLocaleString(undefined, {
              timeZone: cycle.rules.schedule.timezone,
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
            return (
              <article key={cycle.id} className="space-y-3 p-5">
                <div className="flex flex-col justify-between gap-3 sm:flex-row">
                  <div className="min-w-0 space-y-1">
                    <p className="text-caption-1-medium text-text-tertiary">
                      {repo} · #{cycle.prNumber}
                    </p>
                    <Link
                      className="block break-words text-body-medium text-text-primary hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border-focus-ring"
                      href={`/review/${repo}/${cycle.prNumber}`}
                    >
                      {title}
                    </Link>
                    <p className={caption}>
                      {cycle.kind === "first"
                        ? "Awaiting first review"
                        : `Reviewer: ${cycle.reviewer}`}
                    </p>
                  </div>
                  <div className="shrink-0 space-y-1 sm:text-end">
                    <Chip
                      color={
                        cycle.pausedAt ? "neutral" : overdue ? "rose" : "cyan"
                      }
                      variant="caption"
                    >
                      {cycle.pausedAt
                        ? "Paused"
                        : overdue
                          ? "Overdue"
                          : "Upcoming"}
                    </Chip>
                    <p className={caption}>{due}</p>
                    <p className="text-caption-1-medium text-text-tertiary">
                      {cycle.rules.schedule.timezone}
                    </p>
                  </div>
                </div>
                {policies.data?.canManage &&
                  policies.data.plan === "team" &&
                  overdue && (
                    <BackupReviewer
                      repo={repo}
                      number={cycle.prNumber}
                      cycleId={cycle.id}
                      assigned={cycle.backupLogin}
                    />
                  )}
              </article>
            );
          })}
        </div>
        {cycles.data?.length === 100 && (
          <p className="p-5 text-body-2-regular text-text-secondary">
            Showing the first 100 deadlines, earliest first.
          </p>
        )}
      </section>
      {policies.data?.canManage && (
        <section aria-label="Repository policies" className="space-y-3">
          <div className="space-y-1">
            <h2 className="text-[15px] font-medium tracking-[-0.01em]">
              Repository policies
            </h2>
            <p className={caption}>
              Expand a repository to set its review schedule.
            </p>
          </div>
          {policies.data.repos.length === 0 && (
            <div className={panel}>
              <EmptyPreview
                icon={RiGitRepositoryLine}
                hue="amber"
                title="No repositories connected"
                description="Connect a repository, then set its review deadline, work hours and escalation lead here."
                action={
                  <CoreButton asChild size="sm">
                    <Link href="/settings/repositories">
                      Connect a repository
                    </Link>
                  </CoreButton>
                }
              />
            </div>
          )}
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
    <AppShell
      title="Deadlines"
      description="Keep reviews moving with working-hour deadlines and backup reviewers."
    >
      {workspace ? (
        <Deadlines key={workspace.id} workspaceId={workspace.id} />
      ) : (
        <p className={caption}>Loading workspace…</p>
      )}
    </AppShell>
  );
}
