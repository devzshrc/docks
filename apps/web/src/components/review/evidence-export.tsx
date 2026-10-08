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
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        {(["json", "csv"] as const).map((format) => (
          <Button
            key={format}
            size="sm"
            variant="outline"
            disabled={!prs.length || exportReport.isPending}
            onClick={() => exportReport.mutate({ workspaceId, prs, format })}
          >
            Export evidence ({format.toUpperCase()})
          </Button>
        ))}
      </div>
      {exportReport.error && <QueryError error={exportReport.error} />}
      <p className="text-xs text-muted-foreground">
        Collected review and merge records. Reports identify missing evidence
        and collection limits.
      </p>
    </div>
  );
}
