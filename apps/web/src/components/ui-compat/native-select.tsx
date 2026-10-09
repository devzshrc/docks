"use client";
import { cn } from "@/lib/utils";
import {
  Children,
  isValidElement,
  type ComponentProps,
  type ReactElement,
  type ChangeEvent,
  type ReactNode,
} from "react";
import {
  Select,
  SelectTrigger,
  SelectValue,
  SelectContent,
  SelectItem,
} from "@/components/ui/select";
export function NativeSelect({
  children,
  value,
  defaultValue,
  onChange,
  className,
  disabled,
  id,
  name,
  "aria-label": label,
}: ComponentProps<"select">) {
  const options: ReactElement<ComponentProps<"option">>[] = [];
  const visit = (nodes: ReactNode) =>
    Children.forEach(nodes, (node) => {
      if (!isValidElement(node)) return;
      if (node.type === "option")
        options.push(node as ReactElement<ComponentProps<"option">>);
      else visit((node.props as { children?: ReactNode }).children);
    });
  visit(children);
  // Older call sites pass square, bordered classes; keep only layout classes so every select is the same pill.
  const kept = className
    ?.split(/\s+/)
    .filter((c) => !/^(rounded(-.*)?|border(-.*)?|bg-.*|px-.*|py-.*|text-(sm|xs|base)|shadow.*)$/.test(c))
    .join(" ");
  const key = (v: unknown) => (v === "" || v == null ? "__all__" : String(v));
  return (
    <Select
      value={value === undefined ? undefined : key(value)}
      defaultValue={defaultValue === undefined ? undefined : key(defaultValue)}
      disabled={disabled}
      name={name}
      onValueChange={(v) => {
        const actual = v === "__all__" ? "" : v;
        onChange?.({
          target: { value: actual },
          currentTarget: { value: actual },
        } as ChangeEvent<HTMLSelectElement>);
      }}
    >
      <SelectTrigger id={id} size="sm" className={cn("h-[30px] text-xs", kept)} aria-label={label}>
        <SelectValue placeholder={label ?? "Choose an option"} />
      </SelectTrigger>
      <SelectContent>
        {options.map((option, index) => (
          <SelectItem
            key={index}
            value={key(option.props.value ?? option.props.children)}
            disabled={option.props.disabled}
          >
            {option.props.children}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
