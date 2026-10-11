"use client";

import { RiAddLine } from "@remixicon/react";
import { Accordion as AccordionPrimitive } from "radix-ui";

import { FAQ } from "@/components/marketing/plans";

/** Large, quiet accordion: one question open at a time, a plus that turns into a minus. */
export function Faq({ items = FAQ, dark = false }: { items?: readonly { q: string; a: string }[]; dark?: boolean }) {
  return (
    <AccordionPrimitive.Root type="single" collapsible defaultValue={items[0]?.q} className={dark ? "border-t border-white/10 text-white" : "border-t border-black/[0.08]"}>
      {items.map((item) => (
        <AccordionPrimitive.Item key={item.q} value={item.q} className={dark ? "border-b border-white/10" : "border-b border-black/[0.08]"}>
          <AccordionPrimitive.Header>
            <AccordionPrimitive.Trigger className="group flex w-full cursor-pointer items-center justify-between gap-6 py-6 text-left text-[18px] outline-none focus-visible:underline md:text-[19px]">
              {item.q}
              <span className="relative flex size-5 shrink-0 items-center justify-center text-[#8b8b92]">
                <RiAddLine className="size-5 transition-transform duration-300 ease-power3-out group-data-[state=open]:rotate-45" />
              </span>
            </AccordionPrimitive.Trigger>
          </AccordionPrimitive.Header>
          <AccordionPrimitive.Content className="overflow-hidden data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down">
            <p className={dark ? "max-w-[44rem] pb-7 text-[16px] leading-relaxed text-white/60" : "max-w-[44rem] pb-7 text-[16px] leading-relaxed text-[#6b6b70]"}>{item.a}</p>
          </AccordionPrimitive.Content>
        </AccordionPrimitive.Item>
      ))}
    </AccordionPrimitive.Root>
  );
}
