import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes } from "react";
import { forwardRef } from "react";
import { cn } from "../../lib/cn";

const buttonVariants = cva("button", {
  variants: {
    variant: {
      primary: "button--primary",
      secondary: "button--secondary",
      ghost: "button--ghost",
      destructive: "button--destructive",
    },
    size: { default: "button--default", compact: "button--compact", icon: "button--icon" },
  },
  defaultVariants: { variant: "primary", size: "default" },
});

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, size, type = "button", variant, ...props }, ref) => (
    <button className={cn(buttonVariants({ variant, size }), className)} ref={ref} type={type} {...props} />
  ),
);

Button.displayName = "Button";
