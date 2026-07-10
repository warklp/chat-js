import { LogIn } from "lucide-react";
import { buttonVariants } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DevLoginTool() {
  if (process.env.NODE_ENV !== "development") {
    return null;
  }

  return (
    <a
      className={cn(
        buttonVariants({ size: "sm", variant: "outline" }),
        "group fixed bottom-4 left-16 z-50 h-9 rounded-full border-border/80 bg-background/90 px-3 shadow-black/10 shadow-lg backdrop-blur-md hover:border-foreground/20 hover:bg-accent"
      )}
      href="/api/dev-login"
    >
      <span aria-hidden="true" className="relative flex size-2">
        <span className="absolute inline-flex size-full animate-ping rounded-full bg-emerald-400 opacity-50 motion-reduce:animate-none" />
        <span className="relative inline-flex size-2 rounded-full bg-emerald-500" />
      </span>
      <LogIn className="text-muted-foreground transition-colors group-hover:text-foreground" />
      <span>Dev login</span>
      <span className="font-mono text-[10px] text-muted-foreground/70">
        DEV
      </span>
    </a>
  );
}
