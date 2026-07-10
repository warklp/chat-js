import { ArrowRight, Code2, GitFork, Layers3, Radio } from "lucide-react";
import type { Metadata } from "next";

import { Footer } from "@/components/footer";
import { Navbar } from "@/components/navbar";
import { ThreadRegistryShowcase } from "@/components/thread-registry-showcase";
import { siteLinks } from "@/lib/site-config";

export const metadata: Metadata = {
  title: "useThread — Branching Chats for AI SDK",
  description:
    "Add branching message trees, cursor navigation, and concurrent AI SDK response streams with an npm package or a shadcn-compatible source registry.",
  alternates: {
    canonical: siteLinks.threads,
  },
  openGraph: {
    url: siteLinks.threads,
    title: "useThread — Branching Chats for AI SDK",
    description:
      "A useChat-compatible active path backed by a complete message tree.",
  },
};

const capabilities = [
  {
    icon: GitFork,
    title: "Branch from any message",
    description:
      "Move the cursor to any node and send normally. The runtime attaches the new user message and response to that point.",
  },
  {
    icon: Radio,
    title: "Stream branches independently",
    description:
      "Each active response owns its AI SDK stream while writing into one shared message map.",
  },
  {
    icon: Layers3,
    title: "Keep the useChat surface",
    description:
      "Render chat.messages and call sendMessage, stop, regenerate, and setMessages as usual on the active path.",
  },
] as const;

export default function ThreadsPage() {
  return (
    <div className="flex min-h-screen flex-col">
      <Navbar />
      <main className="flex-1">
        <section className="border-border/50 border-b">
          <div className="mx-auto max-w-6xl px-6 pt-20 pb-16 sm:pt-28 sm:pb-24">
            <div className="flex items-center gap-2 font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
              <Code2 className="size-4" />
              Headless threaded chat
            </div>
            <h1 className="mt-7 max-w-4xl font-display text-5xl tracking-tight sm:text-7xl lg:text-8xl">
              useThread
            </h1>
            <p className="mt-6 max-w-2xl text-foreground/75 text-lg leading-8 sm:text-xl">
              A strict extension of AI SDK&apos;s active chat path, backed by a
              complete tree of messages and independently streaming branches.
            </p>
            <ThreadRegistryShowcase />
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto max-w-6xl px-6">
            <div className="max-w-2xl">
              <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
                One model, two views
              </p>
              <h2 className="mt-5 font-display text-3xl tracking-tight sm:text-5xl">
                Linear where chat should be. A tree where navigation needs it.
              </h2>
            </div>

            <div className="mt-14 grid border-border border-y md:grid-cols-3 md:divide-x md:divide-border">
              {capabilities.map((capability) => (
                <article
                  className="border-border border-b px-0 py-8 last:border-b-0 md:border-b-0 md:px-7 last:md:pr-0 first:md:pl-0"
                  key={capability.title}
                >
                  <capability.icon className="size-5 text-muted-foreground" />
                  <h3 className="mt-5 font-semibold text-lg">
                    {capability.title}
                  </h3>
                  <p className="mt-3 text-foreground/70 text-sm leading-6">
                    {capability.description}
                  </p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="border-border/50 border-y bg-card py-20 sm:py-28">
          <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[0.8fr_1.2fr] lg:items-start">
            <div>
              <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.18em]">
                Choose ownership
              </p>
              <h2 className="mt-5 font-display text-3xl tracking-tight sm:text-5xl">
                Install the source or track the package.
              </h2>
              <p className="mt-5 text-foreground/70 leading-7">
                The registry copies the runtime into your application for full
                control. The package keeps the engine upgradeable while your UI
                and persistence stay application-owned.
              </p>
            </div>

            <div className="divide-y divide-border border-border border-y">
              <div className="grid gap-3 py-6 sm:grid-cols-[9rem_1fr]">
                <span className="font-mono text-sm">thread</span>
                <p className="text-foreground/70 text-sm leading-6">
                  Runtime, React hook, snapshots, tree navigation, and
                  concurrent stream control copied into <code>@lib/thread</code>
                  .
                </p>
              </div>
              <div className="grid gap-3 py-6 sm:grid-cols-[9rem_1fr]">
                <span className="font-mono text-sm">thread-demo</span>
                <p className="text-foreground/70 text-sm leading-6">
                  Optional application-owned conversation and tree UI that
                  accepts any AI SDK ChatTransport.
                </p>
              </div>
              <div className="grid gap-3 py-6 sm:grid-cols-[9rem_1fr]">
                <span className="font-mono text-sm">@chatjs/thread</span>
                <p className="text-foreground/70 text-sm leading-6">
                  The same headless engine as a versioned dependency for teams
                  that prefer managed upgrades.
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="py-20 sm:py-28">
          <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-6 sm:flex-row sm:items-end">
            <div className="max-w-2xl">
              <h2 className="font-display text-3xl tracking-tight sm:text-5xl">
                Inspect it before it touches your app.
              </h2>
              <p className="mt-5 text-foreground/70 leading-7">
                The registry is plain source. Use shadcn&apos;s view, dry-run,
                and diff commands before installation.
              </p>
            </div>
            <a
              className="inline-flex items-center gap-2 bg-primary px-6 py-3 font-medium text-primary-foreground text-sm transition-opacity hover:opacity-85"
              href={`${siteLinks.github}/blob/main/registry.json`}
            >
              View registry.json
              <ArrowRight className="size-4" />
            </a>
          </div>
        </section>
      </main>
      <Footer />
    </div>
  );
}
