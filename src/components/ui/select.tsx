import * as SelectPrimitive from "@radix-ui/react-select";
import { Check, ChevronDown } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "../../lib/cn";

export const Select = SelectPrimitive.Root;
export const SelectValue = SelectPrimitive.Value;

export function SelectTrigger({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Trigger>) {
  return <SelectPrimitive.Trigger className={cn("select__trigger", className)} {...props}>{children}<SelectPrimitive.Icon><ChevronDown aria-hidden="true" size={16} /></SelectPrimitive.Icon></SelectPrimitive.Trigger>;
}

export function SelectContent({ className, ...props }: ComponentProps<typeof SelectPrimitive.Content>) {
  return <SelectPrimitive.Portal><SelectPrimitive.Content className={cn("select__content", className)} position="popper" {...props}><SelectPrimitive.Viewport /></SelectPrimitive.Content></SelectPrimitive.Portal>;
}

export function SelectItem({ children, className, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
  return <SelectPrimitive.Item className={cn("select__item", className)} {...props}><SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText><SelectPrimitive.ItemIndicator><Check aria-hidden="true" size={15} /></SelectPrimitive.ItemIndicator></SelectPrimitive.Item>;
}
