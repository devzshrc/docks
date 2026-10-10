"use client";

import {
  RiAddLine,
  RiCheckLine,
  RiGithubFill,
  RiSubtractLine,
} from "@remixicon/react";
import { useState } from "react";
import { Button } from "@/components/base/buttons/button";
import { Faq9 } from "@/components/landing/blocks/faq9";
import { Footer2 } from "@/components/landing/blocks/footer2";
import { Navbar1 } from "@/components/landing/blocks/navbar1";
import { Pricing2 } from "@/components/landing/blocks/pricing2";
import { PLAN_OPTIONS } from "@/components/landing/plan-options";
import { useGithubStart } from "@/components/landing/use-github-start";
import { COMPARE, TEAM_PRICE } from "@/components/marketing/plans";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

function Cell({ value }: { value: boolean | string }) {
  if (typeof value === "string")
    return <span className="text-body-regular">{value}</span>;
  return value ? (
    <RiCheckLine
      className="mx-auto size-5 text-foreground-icon-primary"
      aria-label="Included"
    />
  ) : (
    <span aria-label="Not included">—</span>
  );
}

function SeatEstimator() {
  const [seats, setSeats] = useState(12);
  return (
    <section
      aria-labelledby="estimate-heading"
      className="mx-auto max-w-5xl px-5 pb-16 md:px-8"
    >
      <div className="flex flex-col gap-6 rounded-3xl border border-border-button-default bg-background-secondary-default p-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-col gap-2">
          <h2 id="estimate-heading" className="text-title-2-semibold">
            Estimate your Team plan cost
          </h2>
          <p className="text-body-regular text-text-secondary">
            ${TEAM_PRICE} USD per member per month, plus applicable taxes.
          </p>
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between gap-3">
            <Button
              variant="secondary"
              iconOnly
              leadingIcon={RiSubtractLine}
              aria-label="Remove one member"
              className="size-11 shadow-none"
              disabled={seats === 1}
              onClick={() => setSeats(seats - 1)}
            />
            <span className="text-body-medium">
              {seats} {seats === 1 ? "member" : "members"}
            </span>
            <Button
              variant="secondary"
              iconOnly
              leadingIcon={RiAddLine}
              aria-label="Add one member"
              className="size-11 shadow-none"
              disabled={seats === 100}
              onClick={() => setSeats(seats + 1)}
            />
          </div>
          <output
            aria-live="polite"
            className="text-center text-title-2-medium"
          >
            ${seats * TEAM_PRICE} USD / month
          </output>
        </div>
      </div>
    </section>
  );
}

export function PricingPage() {
  const { start, pending, notice } = useGithubStart();
  const startButton = (
    <Button
      leadingIcon={RiGithubFill}
      onClick={() => void start()}
      disabled={pending}
      aria-busy={pending}
      className="min-h-12 w-full px-6 shadow-none sm:w-auto"
    >
      {pending ? "Connecting…" : "Start free with GitHub"}
    </Button>
  );
  return (
    <div className="min-h-svh bg-background-primary-default text-text-primary">
      <Navbar1 action={startButton} />
      <main>
        <Pricing2
          headingAs="h1"
          heading="Choose a plan"
          description={`Start free. Team is $${TEAM_PRICE} USD per member per month, plus applicable taxes.`}
          plans={PLAN_OPTIONS.map((plan) => ({ ...plan, action: startButton }))}
        />
        {notice && (
          <p
            role="status"
            className="mx-auto max-w-6xl px-5 pb-6 text-body-regular text-text-secondary"
          >
            {notice}
          </p>
        )}
        <SeatEstimator />
        <section className="mx-auto max-w-5xl px-5 py-16 md:px-8">
          <h2 className="mb-8 text-center text-display-4-semibold">
            Compare plans
          </h2>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-body-medium">Feature</TableHead>
                <TableHead className="text-center text-body-medium">
                  Free · $0
                </TableHead>
                <TableHead className="text-center text-body-medium">
                  Team · ${TEAM_PRICE} / member
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {COMPARE.flatMap((group) => [
                <TableRow
                  key={group.group}
                  className="bg-background-secondary-default"
                >
                  <TableCell colSpan={3} className="text-body-semibold">
                    {group.group}
                  </TableCell>
                </TableRow>,
                ...group.rows.map(([label, free, team]) => (
                  <TableRow key={label}>
                    <TableCell className="whitespace-normal text-body-regular">
                      {label}
                    </TableCell>
                    <TableCell className="text-center">
                      <Cell value={free} />
                    </TableCell>
                    <TableCell className="text-center">
                      <Cell value={team} />
                    </TableCell>
                  </TableRow>
                )),
              ])}
            </TableBody>
          </Table>
        </section>
        <Faq9 />
      </main>
      <Footer2 />
    </div>
  );
}
