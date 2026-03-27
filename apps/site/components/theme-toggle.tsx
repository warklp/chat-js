"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "next-themes";

export function ThemeToggle() {
  const { setTheme, resolvedTheme } = useTheme();

  return (
    <button
      type="button"
      onClick={() => setTheme(resolvedTheme === "dark" ? "light" : "dark")}
      className="rounded-md p-2 text-muted-foreground hover:bg-secondary hover:text-foreground transition-colors"
      aria-label="Toggle theme"
    >
      <Sun className="h-5 w-5 hidden dark:block" />
      <Moon className="h-5 w-5 block dark:hidden" />
    </button>
  );
}
