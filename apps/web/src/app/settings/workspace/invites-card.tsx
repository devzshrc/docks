"use client";

import { errorMessage } from "@/lib/error-message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { IconCopy } from "@tabler/icons-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { useTRPC } from "@/trpc/react";

/** Invite links and email invites. */
export function InvitesCard({ workspaceId }: { workspaceId: string }) {
  const trpc = useTRPC();
  const queryClient = useQueryClient();
  const invites = useQuery(
    trpc.workspace.invites.queryOptions({ workspaceId }),
  );
  const [link, setLink] = useState<string>();
  const [copied, setCopied] = useState(false);
  const refresh = () =>
    queryClient.invalidateQueries(trpc.workspace.invites.queryFilter());

  const create = useMutation(
    trpc.workspace.createInvite.mutationOptions({
      onSuccess: (res) => {
        setLink(res.url);
        setCopied(false);
        void refresh();
      },
    }),
  );
  const revoke = useMutation(
    trpc.workspace.revokeInvite.mutationOptions({ onSuccess: refresh }),
  );
  const [email, setEmail] = useState("");
  const inviteEmail = useMutation(
    trpc.workspace.inviteByEmail.mutationOptions({
      onSuccess: () => {
        setEmail("");
        void refresh();
      },
    }),
  );

  return (
    <Card id="invite" className="scroll-mt-24">
      <CardHeader>
        <CardTitle>Invite people</CardTitle>
        <CardDescription>
          Email invites work only for that address. Links work for anyone. Both
          expire after 7 days.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <form
          className="flex max-w-xl gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (email.trim()) inviteEmail.mutate({ workspaceId, email });
          }}
        >
          <Input
            type="email"
            placeholder="teammate@company.com"
            aria-label="Email to invite"
            value={email}
            onChange={(e) => {
              setEmail(e.target.value);
              inviteEmail.reset();
            }}
          />
          <Button type="submit" disabled={inviteEmail.isPending}>
            Send invite
          </Button>
        </form>
        {inviteEmail.isSuccess && (
          <p className="text-sm text-emerald-600">Invite sent.</p>
        )}
        {inviteEmail.error && (
          <p className="text-destructive text-sm">
            {errorMessage(inviteEmail.error)}
          </p>
        )}
        <p className="text-muted-foreground text-sm">
          Or share a link anyone can use:
        </p>
        <Button
          variant="outline"
          onClick={() => create.mutate({ workspaceId })}
          disabled={create.isPending}
        >
          Create invite link
        </Button>
        {create.error && (
          <p className="text-destructive text-sm">{errorMessage(create.error)}</p>
        )}
        {link && (
          <div className="flex max-w-xl gap-2">
            <Input
              readOnly
              value={link}
              aria-label="Invite link"
              onFocus={(e) => e.target.select()}
            />
            <Button
              variant="outline"
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(link);
                  setCopied(true);
                } catch {}
              }}
            >
              <IconCopy className="size-4" aria-hidden />
              {copied ? "Copied" : "Copy"}
            </Button>
          </div>
        )}
        {link && (
          <p className="text-muted-foreground text-xs">
            This is the only time the full link is shown. Create a new one if
            you lose it.
          </p>
        )}
        {invites.data && invites.data.length > 0 && (
          <ul className="divide-y rounded-md border text-sm">
            {invites.data.map((inv) => (
              <li
                key={inv.id}
                className="flex items-center justify-between gap-2 px-3 py-2"
              >
                <span>
                  {inv.email ? (
                    <span className="font-medium">{inv.email} · </span>
                  ) : (
                    "Link · "
                  )}
                  Created by {inv.createdBy}
                  <span className="text-muted-foreground">
                    {" "}
                    · expires {new Date(inv.expiresAt).toLocaleDateString()}
                  </span>
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() =>
                    revoke.mutate({ workspaceId, inviteId: inv.id })
                  }
                >
                  Revoke
                </Button>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}
