"use client";
import { timeAgo } from "@/lib/utils";
import { useState, type ReactNode } from "react";
import {
  Table,
  TableHeader,
  TableBody,
  TableRow,
  TableHead,
  TableCell,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
export type ActiveSession = {
  id: string;
  device: "desktop" | "laptop" | "phone" | "tablet";
  browser?: string;
  os?: string;
  name?: string;
  location?: string;
  ip?: string;
  lastActiveAt: Date | string | number;
  current?: boolean;
  flag?: string;
};
export function ActiveSessions({
  sessions = [],
  loading,
  heading = "Active sessions",
  description,
  onRevoke,
  onRevokeOthers,
}: {
  sessions?: ActiveSession[];
  loading?: boolean;
  heading?: ReactNode;
  headingLevel?: number;
  description?: ReactNode;
  onRevoke?: (session: ActiveSession) => void | Promise<unknown>;
  onRevokeOthers?: (sessions: ActiveSession[]) => void | Promise<unknown>;
}) {
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [confirm, setConfirm] = useState(false);
  const others = sessions.filter((s) => !s.current);
  async function revoke(session?: ActiveSession) {
    setPending(session?.id ?? "others");
    setError("");
    try {
      if (session) await onRevoke?.(session);
      else if (onRevokeOthers) await onRevokeOthers(others);
      else await Promise.all(others.map((s) => onRevoke?.(s)));
      setConfirm(false);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Could not sign out. Try again.",
      );
    } finally {
      setPending(null);
    }
  }
  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle>{heading}</CardTitle>
            <CardDescription className="mt-2">{description}</CardDescription>
          </div>
          {others.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              disabled={pending !== null}
              onClick={() => setConfirm(true)}
            >
              Sign out other devices
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <p role="alert" className="mb-4 text-sm text-destructive">
            {error}
          </p>
        )}
        {loading ? (
          <Skeleton className="h-32 w-full" />
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Device</TableHead>
                <TableHead>Last active</TableHead>
                <TableHead>Action</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sessions.map((s) => (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="font-medium">
                      {s.name ??
                        ([s.browser, s.os].filter(Boolean).join(" on ") ||
                          "Unknown device")}
                    </span>
                    <p className="text-xs text-muted-foreground">
                      {[s.location, s.ip].filter(Boolean).join(" · ")}
                    </p>
                  </TableCell>
                  <TableCell>
                    <time title={new Date(s.lastActiveAt).toLocaleString()}>{timeAgo(s.lastActiveAt)}</time>
                  </TableCell>
                  <TableCell>
                    {s.current ? (
                      <Badge variant="secondary">This device</Badge>
                    ) : (
                      <Button
                        variant="outline"
                        size="sm"
                        disabled={pending !== null}
                        onClick={() => void revoke(s)}
                      >
                        {pending === s.id ? "Signing out…" : "Sign out"}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </CardContent>
      <Dialog
        open={confirm}
        onOpenChange={(open) => {
          if (!pending) setConfirm(open);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sign out other devices?</DialogTitle>
            <DialogDescription>
              Your current session stays signed in. Other devices will need to
              sign in again.
            </DialogDescription>
          </DialogHeader>
          {error && (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              disabled={pending !== null}
              onClick={() => setConfirm(false)}
            >
              Cancel
            </Button>
            <Button disabled={pending !== null} onClick={() => void revoke()}>
              {pending ? "Signing out…" : "Sign out other devices"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
