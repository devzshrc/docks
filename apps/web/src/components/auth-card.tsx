import { AuthStage } from "@/components/auth-stage"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"

/** Centered card used by the signed-out auth pages. */
export function AuthCard({
  title,
  description,
  children,
}: {
  title: string
  description?: React.ReactNode
  children?: React.ReactNode
}) {
  return (
    <AuthStage>
      <Card data-auth className="w-full py-7 [&>[data-slot=card-content]]:px-7 [&>[data-slot=card-header]]:px-7">
        <CardHeader>
          
          <CardTitle className="text-xl font-semibold">{title}</CardTitle>
          {description && <CardDescription>{description}</CardDescription>}
        </CardHeader>
        {children && <CardContent>{children}</CardContent>}
      </Card>
    </AuthStage>
  )
}
