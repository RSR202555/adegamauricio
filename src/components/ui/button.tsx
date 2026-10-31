import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-xl text-sm font-bold transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-500/50 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 active:scale-[0.98] select-none cursor-pointer",
  {
    variants: {
      variant: {
        default:
          "bg-gradient-to-r from-amber-500 via-amber-400 to-yellow-500 hover:from-amber-400 hover:to-yellow-400 text-stone-950 shadow-lg shadow-amber-950/50 hover:shadow-amber-950/80 border border-amber-300/40 font-black",
        destructive:
          "bg-rose-600 text-white hover:bg-rose-500 shadow-md shadow-rose-950/40 border border-rose-500/30",
        outline:
          "border border-amber-900/50 bg-stone-900/80 text-amber-200 hover:bg-stone-800 hover:text-white hover:border-amber-500/50 shadow-sm",
        secondary:
          "bg-stone-800 text-stone-200 hover:bg-stone-700 hover:text-white border border-stone-700/50",
        ghost:
          "text-stone-400 hover:text-amber-200 hover:bg-stone-900/60",
        link:
          "text-amber-400 underline-offset-4 hover:underline p-0 h-auto font-medium",
        glass:
          "bg-stone-900/60 backdrop-blur-md border border-amber-900/40 text-stone-200 hover:bg-stone-800/60 hover:border-amber-500/40 shadow-lg",
      },
      size: {
        default: "h-11 px-5 py-2.5",
        sm: "h-8.5 rounded-lg px-3.5 text-xs",
        lg: "h-13 rounded-2xl px-8 text-base font-bold",
        icon: "h-10 w-10 p-0",
        iconSm: "h-8 w-8 p-0 rounded-lg",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        {...props}
      />
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
