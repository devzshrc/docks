"use client";
import { useMutation } from "@tanstack/react-query";
import { useTRPC } from "@/trpc/react";
import { QueryError } from "@/components/query-state";
import { Button } from "@/components/ui/button";
export function EvidenceExport({
  workspaceId,
  prs,
}: {
  workspaceId: string;
  prs: { repo: string; number: number }[];
}) {
  const trpc = useTRPC();
  const exportReport = useMutation(
    trpc.releases.evidence.mutationOptions({
      onSuccess: (file) => {
        const url = URL.createObjectURL(
          new Blob([file.content], { type: file.mime }),
        );
        const link = document.createElement("a");
        link.href = url;
        link.download = file.filename;
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      },
    }),
  );
  return (
    <div className="grid gap-2">
      <div className="flex items-center justify-between gap-3">
        <p className="text-xs leading-relaxed text-muted-foreground">Review and merge records for audits.</p>
        <div className="flex shrink-0 rounded-full bg-muted/70 p-0.5">
          {(["json", "csv"] as const).map((format) => (
            <Button
              key={format}
              size="xs"
              variant="ghost"
              title={`Download evidence as ${format.toUpperCase()}`}
              disabled={!prs.length || exportReport.isPending}
              onClick={() => exportReport.mutate({ workspaceId, prs, format })}
              className="h-6 rounded-full px-2.5 text-[11px] hover:bg-card hover:shadow-control"
            >
              {format.toUpperCase()}
            </Button>
          ))}
        </div>
      </div>
      {exportReport.error && <QueryError error={exportReport.error} />}
    </div>
  );
}
