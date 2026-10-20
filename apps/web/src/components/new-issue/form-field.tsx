"use client";

import { NativeCheckbox as ShadcnCheckbox } from "@/components/ui-compat/native-checkbox";
import { NativeSelect as ShadcnSelect } from "@/components/ui-compat/native-select";
import { MentionTextarea } from "@/components/mention-textarea";
import { Label } from "@/components/new-issue/parts";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

/** Class for native selects in the panel. */
export const select =
  "bg-(--field) hover:bg-(--field-hover) h-9 rounded-md border px-2 text-sm";

/** One labelled field of an issue template form. */
export function FormFieldInput({
  field,
  value,
  onChange,
}: {
  field: import("@docks/api/issue").FormField;
  value: string;
  onChange: (v: string) => void;
}) {
  const id = `issue-f-${field.id}`;
  const box =
    "bg-(--field) hover:bg-(--field-hover) w-full rounded-md border px-3 py-2 text-sm";
  return (
    <div>
      <Label htmlFor={id}>
        {field.label}
        {field.required && <span className="text-destructive"> *</span>}
      </Label>
      {field.description && (
        <p className="text-muted-foreground -mt-1 mb-1.5 text-xs">
          {field.description}
        </p>
      )}
      {field.kind === "textarea" ? (
        <MentionTextarea
          id={id}
          rows={4}
          value={value}
          placeholder={field.placeholder}
          onChange={onChange}
          className={box}
        />
      ) : field.kind === "input" ? (
        <Input
          id={id}
          value={value}
          placeholder={field.placeholder}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : field.kind === "dropdown" ? (
        <ShadcnSelect
          id={id}
          className={cn(select, "w-full")}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        >
          <option value="">Choose…</option>
          {field.options.map((o) => (
            <option key={o} value={o}>
              {o}
            </option>
          ))}
        </ShadcnSelect>
      ) : (
        <div className="space-y-1.5">
          {field.options.map((opt) => {
            const set = new Set(value.split("\n").filter(Boolean));
            return (
              <label key={opt} className="flex items-center gap-2 text-sm">
                <ShadcnCheckbox
                  checked={set.has(opt)}
                  onChange={(e) => {
                    e.target.checked ? set.add(opt) : set.delete(opt);
                    onChange([...set].join("\n"));
                  }}
                />
                {opt}
              </label>
            );
          })}
        </div>
      )}
    </div>
  );
}
