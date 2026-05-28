import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/lib/utils";

/**
 * Alert — shadcn/ui structure (Alert / AlertTitle / AlertDescription, cva
 * variants), restyled onto the Atlas design tokens instead of shadcn's default
 * `background`/`foreground`/`destructive` palette.
 *
 * Icons: pass any `<svg>` as the first child — the project uses Iconify, so
 * `<Icon icon="solar:..." />` works since it renders an <svg>. The variant
 * tints the icon via `[&>svg]:text-*`.
 *
 *   import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
 *   import { Icon } from "@iconify/react";
 *
 *   <Alert variant="destructive">
 *     <Icon icon="solar:danger-triangle-bold" />
 *     <AlertTitle>Couldn't save</AlertTitle>
 *     <AlertDescription>Check your connection and try again.</AlertDescription>
 *   </Alert>
 */
const alertVariants = cva(
  "relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-2px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-3.5 [&>svg]:size-4 [&>svg~*]:pl-7",
  {
    variants: {
      variant: {
        default: "bg-elev1 border-border text-text-primary [&>svg]:text-text-tertiary",
        info: "bg-info-soft border-info text-text-primary [&>svg]:text-info",
        success: "bg-success-soft border-success text-text-primary [&>svg]:text-success",
        warning: "bg-warning-soft border-warning text-text-primary [&>svg]:text-warning",
        destructive: "bg-danger-soft border-danger text-text-primary [&>svg]:text-danger",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

const Alert = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof alertVariants>
>(({ className, variant, ...props }, ref) => (
  <div
    ref={ref}
    role="alert"
    className={cn(alertVariants({ variant }), className)}
    {...props}
  />
));
Alert.displayName = "Alert";

const AlertTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h5
    ref={ref}
    className={cn("mb-1 font-medium leading-none tracking-tight", className)}
    {...props}
  />
));
AlertTitle.displayName = "AlertTitle";

const AlertDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("text-sm text-text-secondary [&_p]:leading-relaxed", className)}
    {...props}
  />
));
AlertDescription.displayName = "AlertDescription";

export { Alert, AlertTitle, AlertDescription };
