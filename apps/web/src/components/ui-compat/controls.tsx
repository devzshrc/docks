"use client";
import {
  useId,
  type ReactNode,
  type ComponentType,
  type ComponentProps,
} from "react";
import { Button as CoreButton } from "@/components/ui/button";
import { Input as CoreInput } from "@/components/ui/input";
import { Checkbox as CoreCheckbox } from "@/components/ui/checkbox";
import {
  Select as CoreSelect,
  SelectTrigger,
  SelectContent,
  SelectValue,
  SelectItem as CoreItem,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Avatar as CoreAvatar,
  AvatarImage,
  AvatarFallback,
} from "@/components/ui/avatar";
type Icon = ComponentType<{
  className?: string;
  "aria-hidden"?: boolean | "true" | "false";
}>;
export function Button({
  variant = "primary",
  size = "medium",
  leadingIcon: Leading,
  trailingIcon: Trailing,
  iconOnly,
  children,
  ...props
}: Omit<ComponentProps<typeof CoreButton>, "variant" | "size"> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "medium" | "small" | "xs";
  leadingIcon?: Icon;
  trailingIcon?: Icon;
  iconOnly?: boolean;
}) {
  return (
    <CoreButton
      {...props}
      variant={
        variant === "primary"
          ? "default"
          : variant === "danger"
            ? "destructive"
            : variant
      }
      size={iconOnly ? "icon" : size === "medium" ? "default" : "sm"}
    >
      {Leading && <Leading aria-hidden />}
      {children}
      {Trailing && <Trailing aria-hidden />}
    </CoreButton>
  );
}
export function Input({
  onChange,
  label,
  hint,
  isDisabled,
  isInvalid,
  isRequired,
  size,
  fieldClassName,
  leadingIcon: Leading,
  trailingIcon: Trailing,
  ...props
}: Omit<ComponentProps<typeof CoreInput>, "onChange" | "size"> & {
  onChange?: (value: string) => void;
  label?: ReactNode;
  hint?: ReactNode;
  isDisabled?: boolean;
  isInvalid?: boolean;
  isRequired?: boolean;
  size?: string;
  fieldClassName?: string;
  leadingIcon?: Icon;
  trailingIcon?: Icon;
}) {
  const generatedId = useId();
  const id = props.id ?? generatedId;
  return (
    <div className="space-y-2">
      {label && (
        <label htmlFor={id} className="text-sm font-medium">
          {label}
        </label>
      )}
      <CoreInput
        {...props}
        id={id}
        disabled={isDisabled ?? props.disabled}
        required={isRequired ?? props.required}
        aria-invalid={isInvalid}
        onChange={(e) => onChange?.(e.target.value)}
      />
      {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
    </div>
  );
}
export function Checkbox({
  isSelected = false,
  onChange,
  isDisabled,
  children,
  className,
  id: provided,
  size,
}: {
  isSelected?: boolean;
  onChange?: (value: boolean) => void;
  isDisabled?: boolean;
  children?: ReactNode;
  className?: string;
  id?: string;
  size?: string;
}) {
  const generatedId = useId();
  const id = provided ?? generatedId;
  return (
    <div className="flex items-center gap-2">
      <CoreCheckbox
        id={id}
        className={className}
        checked={isSelected}
        onCheckedChange={(value) => onChange?.(value === true)}
        disabled={isDisabled}
      />
      {children && (
        <label htmlFor={id} className="text-sm">
          {children}
        </label>
      )}
    </div>
  );
}
export function Select({
  selectedKey,
  onSelectionChange,
  children,
  placeholder,
  label,
  isDisabled,
  className,
  triggerClassName,
  popoverClassName,
  "aria-label": ariaLabel,
  size,
  renderValue,
}: {
  selectedKey?: string | number | null;
  onSelectionChange?: (value: string) => void;
  children: ReactNode;
  placeholder?: string;
  label?: ReactNode;
  isDisabled?: boolean;
  className?: string;
  triggerClassName?: string;
  popoverClassName?: string;
  "aria-label"?: string;
  size?: string;
  renderValue?: ReactNode | ((value: { selectedText: string }) => ReactNode);
}) {
  return (
    <div className={className}>
      {label && <p className="mb-2 text-sm font-medium">{label}</p>}
      <CoreSelect
        value={selectedKey == null ? undefined : String(selectedKey)}
        onValueChange={onSelectionChange}
        disabled={isDisabled}
      >
        <SelectTrigger
          className={triggerClassName}
          aria-label={
            ariaLabel ?? (typeof label === "string" ? label : placeholder)
          }
        >
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className={popoverClassName}>{children}</SelectContent>
      </CoreSelect>
    </div>
  );
}
export function SelectItem({
  id,
  textValue,
  ...props
}: Omit<ComponentProps<typeof CoreItem>, "value"> & {
  id: string | number;
  textValue?: string;
}) {
  return <CoreItem {...props} value={String(id)} />;
}
export function Chip({
  color,
  variant,
  size,
  ...props
}: Omit<ComponentProps<typeof Badge>, "variant"> & {
  color?: string;
  size?: string;
  variant?: string;
}) {
  return <Badge {...props} variant="secondary" />;
}
export function Avatar({
  src,
  alt,
  initials,
  imageProps,
  size,
  ...props
}: Omit<ComponentProps<typeof CoreAvatar>, "size"> & {
  src?: string;
  alt?: string;
  initials?: string;
  imageProps?: ComponentProps<typeof AvatarImage>;
  size?: string;
}) {
  return (
    <CoreAvatar {...props}>
      <AvatarImage {...imageProps} src={src} alt={alt} />
      <AvatarFallback>{initials}</AvatarFallback>
    </CoreAvatar>
  );
}
