import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

export function Hero() {
  return (
    <section className="mx-auto max-w-5xl px-6 py-24 sm:py-32 text-center">
      <h1 className="text-4xl font-bold tracking-tight sm:text-6xl">
        The prod-ready AI chat app
      </h1>
      <p className="mx-auto mt-6 max-w-2xl text-lg leading-8 text-muted-foreground">
        Stop rebuilding the same AI chat infrastructure. ChatJS gives you a
        production-ready foundation with authentication, hundreds of models,
        streaming, tool calling, and everything you need to ship fast.
      </p>
      <div className="mt-10 flex items-center justify-center gap-4 flex-wrap">
        <Link
          href="https://demo.chatjs.dev"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-5 py-2.5 text-sm font-medium text-primary-foreground shadow-sm hover:bg-primary/90 transition-colors"
        >
          Try the Demo
          <ArrowRight className="h-4 w-4" />
        </Link>
        <Link
          href="/docs"
          className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-5 py-2.5 text-sm font-medium text-foreground shadow-sm hover:bg-secondary transition-colors"
        >
          <BookOpen className="h-4 w-4" />
          Read the Docs
        </Link>
      </div>
    </section>
  );
}
