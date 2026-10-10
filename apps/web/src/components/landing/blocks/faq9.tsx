// Uses landing-page1's Testimonial9 card grid for real product FAQs.
// Source: https://www.shadcnblocks.com/r/testimonial9.json.
import { FAQ } from "@/components/marketing/plans";
import { Card } from "@/components/ui/card";

export function Faq9() {
  return (
    <section id="faq" className="scroll-mt-8 py-16 md:py-24">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <div className="flex flex-col items-center gap-6">
          <h2 className="text-center text-display-4-semibold lg:text-display-2-semibold">
            Common questions
          </h2>
          <p className="text-center text-headline-regular text-text-secondary">
            How Docks works with your code and your team.
          </p>
        </div>
        <dl className="mt-14 grid gap-5 md:grid-cols-2 lg:grid-cols-3">
          {FAQ.map((item) => (
            <Card
              key={item.q}
              className="gap-3 rounded-3xl border border-border-button-default p-6 shadow-none"
            >
              <dt className="text-headline-semibold">{item.q}</dt>
              <dd className="text-headline-regular text-text-secondary">
                {item.a}
              </dd>
            </Card>
          ))}
        </dl>
      </div>
    </section>
  );
}
