import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-bold transition-colors select-none",
  {
    variants: {
      variant: {
        default:
          "border border-amber-500/30 bg-amber-500/15 text-amber-400 font-extrabold",
        secondary:
          "border border-stone-800 bg-stone-900/90 text-stone-300",
        destructive:
          "border border-rose-500/30 bg-rose-500/15 text-rose-400 font-bold",
        warning:
          "border border-yellow-500/30 bg-yellow-500/15 text-yellow-400 font-bold",
        info:
          "border border-sky-500/30 bg-sky-500/15 text-sky-400 font-bold",
        outline:
          "border border-amber-900/40 text-stone-400",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

export { Badge, badgeVariants };
