import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { ReactNode } from "react";
import { RiCheckLine } from "@remixicon/react";

const plans = [
  {
    id: "free",
    name: "Free",
    price: "0",
    unit: "Free to get started",
    description: "A focused review workspace for small teams.",
    features: [
      "Up to 5 workspace members",
      "Up to 3 enabled repositories",
      "Review board and merge blockers",
      "Personal inbox and review progress",
    ],
  },
  {
    id: "team",
    name: "Team",
    price: "12",
    unit: "USD per member / month",
    description: "Keep reviews moving. Ship with a clear picture.",
    features: [
      "Unlimited members and repositories",
      "Review deadlines and reminders",
      "Backup reviewer requests",
      "Release tracking and readiness reports",
      "Changes since your last review",
      "Review evidence exports · CSV and JSON",
    ],
  },
] as const;

export function PlanCards({
  current,
  actions,
}: {
  current?: "free" | "team";
  actions: Record<"free" | "team", ReactNode>;
}) {
  return (
    <div className="grid gap-5 md:grid-cols-2">
      {plans.map((plan) => (
        <Card key={plan.id} className="flex flex-col">
          <CardHeader>
            <div className="flex min-h-6 items-center justify-between gap-3">
              <CardTitle>{plan.name}</CardTitle>
              {current === plan.id && (
                <Badge variant="secondary">Current plan</Badge>
              )}
            </div>
            <p className="mt-3 min-h-10 text-sm leading-relaxed text-muted-foreground">
              {plan.description}
            </p>
          </CardHeader>
          <CardContent className="flex-1">
            <div className="mt-2">
              <span className="text-5xl font-medium tracking-tight">
                ${plan.price}
              </span>
              <p className="mt-2 text-xs text-muted-foreground">{plan.unit}</p>
            </div>
            <div className="my-7 h-px bg-border" />
            <ul className="flex-1 space-y-3.5 text-sm">
              {plan.features.map((feature) => (
                <li key={feature} className="flex gap-3">
                  <RiCheckLine
                    aria-hidden
                    className="mt-0.5 size-4 shrink-0 text-primary"
                  />
                  <span>{feature}</span>
                </li>
              ))}
            </ul>
          </CardContent>
          <CardFooter>{actions[plan.id]}</CardFooter>
        </Card>
      ))}
    </div>
  );
}
