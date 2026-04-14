import * as React from "react";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";

import { cn } from "@/lib/utils";

const Dialog = DialogPrimitive.Root;

const DialogTrigger = DialogPrimitive.Trigger;

const DialogPortal = DialogPrimitive.Portal;

const DialogClose = DialogPrimitive.Close;

const FULL_SCREEN_CLASS_PREFIXES = [
  "max-w-",
  "max-h-",
  "sm:max-w-",
  "sm:max-h-",
  "md:max-w-",
  "md:max-h-",
  "lg:max-w-",
  "lg:max-h-",
  "xl:max-w-",
  "xl:max-h-",
  "2xl:max-w-",
  "2xl:max-h-",
  "rounded",
  "sm:rounded",
  "md:rounded",
  "lg:rounded",
  "xl:rounded",
  "2xl:rounded",
  "w-[calc(100vw-",
];

// PERFORMANCE: Memoize regex-based class stripping to avoid recomputation on every render
const stripCache = new Map<string, string>();

const stripFullScreenConflictingClasses = (className?: string) => {
  if (!className) return className;
  
  const cached = stripCache.get(className);
  if (cached !== undefined) return cached;
  
  const result = className
    .split(/\s+/)
    .filter(Boolean)
    .filter(
      (token) =>
        !FULL_SCREEN_CLASS_PREFIXES.some((prefix) => token === prefix || token.startsWith(prefix)),
    )
    .join(" ");
  
  // Limit cache size to prevent memory leaks
  if (stripCache.size > 200) {
    const firstKey = stripCache.keys().next().value;
    if (firstKey) stripCache.delete(firstKey);
  }
  stripCache.set(className, result);
  
  return result;
};

const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className,
    )}
    {...props}
  />
));
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName;

const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> & {
    hideCloseButton?: boolean;
    fullScreen?: boolean;
  }
>(({ className, children, hideCloseButton = false, fullScreen = false, ...props }, ref) => (
  <DialogPortal>
    {fullScreen ? null : <DialogOverlay />}
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        fullScreen
          ? "fixed inset-0 z-50 flex h-[100dvh] w-screen max-w-none flex-col gap-4 overflow-y-auto border-0 bg-background p-4 shadow-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 sm:p-6"
          : "fixed left-[50%] top-[50%] z-50 grid w-[calc(100%-1rem)] max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-4 sm:p-6 shadow-lg duration-200 max-h-[90dvh] overflow-y-auto data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] sm:rounded-lg",
        fullScreen ? stripFullScreenConflictingClasses(className) : className,
      )}
      {...props}
    >
      {children}
      {hideCloseButton ? null : (
        <DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity data-[state=open]:bg-accent data-[state=open]:text-muted-foreground hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none">
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      )}
    </DialogPrimitive.Content>
  </DialogPortal>
));
DialogContent.displayName = DialogPrimitive.Content.displayName;

const DialogHeader = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col space-y-1.5 text-center sm:text-left", className)} {...props} />
);
DialogHeader.displayName = "DialogHeader";

const DialogFooter = ({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) => (
  <div className={cn("flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2", className)} {...props} />
);
DialogFooter.displayName = "DialogFooter";

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn("text-lg font-semibold leading-none tracking-tight", className)}
    {...props}
  />
));
DialogTitle.displayName = DialogPrimitive.Title.displayName;

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
DialogDescription.displayName = DialogPrimitive.Description.displayName;

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
};
