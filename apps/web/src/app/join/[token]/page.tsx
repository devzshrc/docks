"use client"

import { errorMessage } from "@/lib/error-message";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import Link from "next/link"
import { useParams, useRouter } from "next/navigation"

import { RequireAuth } from "@/components/auth-guard"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { useTRPC } from "@/trpc/react"

function Join({ token }: { token: string }) {
  const trpc = useTRPC()
  const router = useRouter()
  const queryClient = useQueryClient()
  const preview = useQuery({ ...trpc.workspace.invitePreview.queryOptions({ token }), retry: false })
  const accept = useMutation(
    trpc.workspace.acceptInvite.mutationOptions({
      onSuccess: async () => {
        await queryClient.invalidateQueries(trpc.workspace.list.queryFilter())
        router.push("/review")
      },
    })
  )

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>
          {preview.data ? `Join ${preview.data.workspaceName}` : "Join workspace"}
        </CardTitle>
        <CardDescription>
          {preview.data?.alreadyMember
            ? "You're already a member of this workspace."
            : "You'll see this workspace's review board and repositories."}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {preview.isPending && <p className="text-muted-foreground text-sm">Checking invite…</p>}
        {preview.error && <p className="text-destructive text-sm">{errorMessage(preview.error)}</p>}
        {preview.data?.wrongAccount && (
          <p className="text-sm">
            This invite is for <span className="font-medium">{preview.data.wrongAccount}</span>. Sign out and sign in
            with that email to accept it.
          </p>
        )}
        {preview.data &&
          !preview.data.wrongAccount &&
          (preview.data.alreadyMember ? (
            <Button asChild className="w-full">
              <Link href="/review">Go to reviews</Link>
            </Button>
          ) : (
            <Button className="w-full" disabled={accept.isPending} onClick={() => accept.mutate({ token })}>
              Join workspace
            </Button>
          ))}
        {accept.error && <p className="text-destructive text-sm">{errorMessage(accept.error)}</p>}
      </CardContent>
    </Card>
  )
}

export default function Page() {
  const { token } = useParams<{ token: string }>()
  return (
    <RequireAuth>
      <div className="flex min-h-svh items-center justify-center p-4">
        <Join token={token} />
      </div>
    </RequireAuth>
  )
}
