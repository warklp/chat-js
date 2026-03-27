import Link from "next/link";

export function Footer() {
  return (
    <footer className="border-t border-border/50 mt-16">
      <div className="mx-auto max-w-5xl px-6 py-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-between">
        <p className="text-sm text-muted-foreground">
          &copy; {new Date().getFullYear()} ChatJS. Open source under the Apache
          2.0 license.
        </p>
        <div className="flex items-center gap-6">
          <Link
            href="https://github.com/franciscomoretti/chat-js"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            GitHub
          </Link>
          <Link
            href="https://x.com/franmoretti_"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            X / Twitter
          </Link>
          <Link
            href="/docs"
            className="text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            Docs
          </Link>
        </div>
      </div>
    </footer>
  );
}
