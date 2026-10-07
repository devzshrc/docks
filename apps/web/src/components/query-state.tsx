"use client"

import { Skeleton } from "@/components/ui/skeleton"

/** The one error treatment: readable message, optional Retry. */
export function QueryError({ error, onRetry }: { error: { message: string }; onRetry?: () => void }) {
  return (
    <div role="alert" className="text-destructive border-destructive/30 flex flex-wrap items-center gap-2 rounded-lg border px-3 py-2 text-sm">
      <span>{error.message}</span>
      {onRetry && (
        <button type="button" onClick={onRetry} className="underline underline-offset-2">
          Retry
        </button>
      )}
    </div>
  )
}

/**
 * One way to show a query: skeleton while loading, a readable error with Retry, an empty message,
 * then the content. Keeps every page's loading and failure states looking the same.
 */
export function QueryState({
  isPending,
  error,
  onRetry,
  isEmpty,
  empty,
  skeleton,
  children,
}: {
  isPending: boolean
  error: { message: string } | null
  onRetry?: () => void
  isEmpty?: boolean
  empty?: React.ReactNode
  skeleton?: React.ReactNode
  children: React.ReactNode
}) {
  if (isPending) return <>{skeleton ?? <Skeleton className="h-24 w-full" />}</>
  if (error) return <QueryError error={error} onRetry={onRetry} />
  if (isEmpty) return <>{empty ?? <p className="text-muted-foreground rounded-lg border border-dashed px-3 py-8 text-center text-sm">Nothing here yet.</p>}</>
  return <>{children}</>
}
