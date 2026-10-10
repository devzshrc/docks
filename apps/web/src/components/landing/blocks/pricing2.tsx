// Adapted from shadcnblocks landing-page1 / pricing2.
// Source: https://www.shadcnblocks.com/r/pricing2.json
"use client";

import { RiCheckLine } from "@remixicon/react";
import type { ReactNode } from "react";
import { cx } from "@/utils/cx";

import { ButtonLink } from "@/components/base/buttons/button";
import {
  Card,
  CardContent,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";

interface PricingCards2CardsPlan {
  name: string;
  description: string;
  monthlyPrice: string;
  priceNote: string;
  action?: ReactNode;
  features: string[];
  button: {
    text: string;
    url: string;
  };
  highlighted?: boolean;
  featureListLabel?: string;
  image?: string;
}

interface PricingCards2CardsProps {
  heading: string;
  description: string;
  plans: PricingCards2CardsPlan[];
  className?: string;
  headingAs?: "h1" | "h2";
}

interface Pricing2Props extends PricingCards2CardsProps {}
type Props = Pricing2Props;

const Pricing2 = (props: Props) => {
  const {
    heading,
    description,
    plans,
    className,
    headingAs: Heading = "h2",
  } = {
    ...props,
  };

  return (
    <section className={cx("py-16 md:py-24", className)}>
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="mx-auto mb-5 max-w-5xl text-center">
          <Heading className="mb-4 text-display-4-semibold lg:text-display-2-semibold">
            {heading}
          </Heading>
          <p className="text-headline-regular text-text-secondary lg:text-title-3-regular">
            {description}
          </p>
        </div>
        <div className="flex flex-col items-center gap-10">
          <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-col items-stretch gap-4 md:flex-row md:items-stretch md:justify-center">
            {(plans ?? []).map((plan) => (
              <Card
                key={plan.name}
                className={cx(
                  "flex w-full max-w-full min-w-0 flex-col justify-between gap-8 rounded-3xl text-start shadow-none ring-0 md:flex-1 md:basis-0",
                  plan.highlighted
                    ? "border-2 border-text-primary"
                    : "border border-border-button-default",
                )}
              >
                <CardHeader className="gap-0.5">
                  <CardTitle>
                    <h3 className="text-title-2-semibold">{plan.name}</h3>
                  </CardTitle>
                  <div className="mb-5 flex min-w-0 flex-wrap items-end gap-x-1">
                    <span className="min-w-0 text-display-4-medium">
                      {plan.monthlyPrice}
                    </span>
                    <span className="text-body-regular text-text-secondary">
                      {plan.priceNote}
                    </span>
                  </div>
                  <p className="text-headline-regular text-text-secondary">
                    {plan.description}
                  </p>
                </CardHeader>
                <CardContent>
                  <Separator className="mb-6" />
                  {plan.featureListLabel && (
                    <p className="mb-3 text-headline-semibold">
                      {plan.featureListLabel}
                    </p>
                  )}
                  <ul className="flex flex-col gap-3">
                    {plan.features.map((feature, index) => (
                      <li
                        key={index}
                        className="flex items-center gap-2 text-body-regular"
                      >
                        <RiCheckLine className="size-4 shrink-0" />
                        <span className="min-w-0 wrap-break-word">
                          {feature}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
                <CardFooter className="mt-auto">
                  {plan.action ?? (
                    <ButtonLink
                      href={plan.button.url}
                      variant={plan.highlighted ? "primary" : "secondary"}
                      className="min-h-12 w-full shadow-none"
                    >
                      {plan.button.text}
                    </ButtonLink>
                  )}
                </CardFooter>
              </Card>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
};

export { Pricing2 };
