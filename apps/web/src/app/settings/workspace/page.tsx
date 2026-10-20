"use client";

import { errorMessage } from "@/lib/error-message";
import Link from "next/link";
import { AppShell } from "@/components/app-shell";
import { useWorkspace, useWorkspaceSettings } from "@/hooks/use-workspace";
import { NameCard, StuckCard, SecurityCard } from "./general-cards";
import { MembersCard } from "./members-card";
import { TeamsCard } from "./teams-card";
import { InvitesCard } from "./invites-card";
import { DataCard } from "./data-card";

function Content() {
  const { workspace, isPending } = useWorkspace();
  const settings = useWorkspaceSettings(workspace?.id);
  if (isPending || (workspace && settings.isPending)) return null;
  if (!workspace) {
    return (
      <p className="text-muted-foreground text-sm">
        You aren&apos;t in a workspace yet.{" "}
        <Link href="/settings/integrations" className="underline">
          Create one
        </Link>{" "}
        or ask a teammate for an invite link.
      </p>
    );
  }
  if (settings.error)
    return <p className="text-destructive text-sm">{errorMessage(settings.error)}</p>;
  const can = settings.data!.can;
  return (
    <div className="flex flex-col gap-6">
      <NameCard
        workspaceId={workspace.id}
        name={workspace.name}
        isOwner={can["workspace.manage"]}
      />
      <MembersCard
        workspaceId={workspace.id}
        canManage={can["members.manage"]}
        myRole={settings.data!.role}
      />
      {can["members.manage"] && <InvitesCard workspaceId={workspace.id} />}
      {can["members.manage"] && <TeamsCard workspaceId={workspace.id} />}
      {can["workspace.manage"] && (
        <StuckCard
          workspaceId={workspace.id}
          hours={settings.data!.stuckHours}
        />
      )}
      {can["workspace.manage"] && (
        <SecurityCard
          workspaceId={workspace.id}
          require2fa={settings.data!.require2fa}
        />
      )}
      {can["workspace.manage"] && (
        <DataCard
          workspaceId={workspace.id}
          name={workspace.name}
          canDelete={can["workspace.delete"]}
        />
      )}
    </div>
  );
}

export default function Page() {
  return (
    <AppShell
      title="Workspace"
      description="Name, members, invites, teams and security settings."
    >
      <Content />
    </AppShell>
  );
}
