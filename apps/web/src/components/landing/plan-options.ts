import { PLANS, TEAM_PRICE } from "@/components/marketing/plans";

export const PLAN_OPTIONS = [
  {
    name: PLANS.free.name,
    description: PLANS.free.blurb,
    monthlyPrice: "$0",
    priceNote: "forever",
    features: [...PLANS.free.features],
    button: { text: "Start free", url: "/signup" },
  },
  {
    name: PLANS.team.name,
    description: PLANS.team.blurb,
    monthlyPrice: `$${TEAM_PRICE}`,
    priceNote: "USD / member / month",
    features: [...PLANS.team.features],
    button: { text: "Choose Team", url: "/settings/billing" },
    highlighted: true,
  },
];
