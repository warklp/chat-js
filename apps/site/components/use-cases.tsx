import Link from "next/link";

const USE_CASES = [
  {
    number: "01",
    title: "Ship an AI chat MVP fast",
    description:
      "Start from a working Next.js AI chat app starter instead of wiring authentication, model routing, and streaming from scratch.",
  },
  {
    number: "02",
    title: "Prototype across multiple model providers",
    description:
      "Compare OpenAI, Anthropic, Google, xAI, and open models behind one interface without rebuilding your app shell.",
  },
  {
    number: "03",
    title: "Move from side project to production",
    description:
      "Keep the same codebase as you add auth, observability, tool calling, document workflows, and deployment polish.",
  },
];

export function UseCases() {
  return (
    <section
      aria-labelledby="use-cases-heading"
      className="border-border/30 border-t py-24 sm:py-32"
    >
      <div className="mx-auto grid max-w-6xl gap-12 px-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <p className="font-mono text-muted-foreground text-xs uppercase tracking-[0.25em]">
            Why developers use ChatJS
          </p>
          <h2
            className="mt-4 font-display text-3xl tracking-tight sm:text-5xl"
            id="use-cases-heading"
          >
            A practical starting point for shipping AI chat products
          </h2>
          <p className="mt-6 max-w-xl text-lg text-muted-foreground leading-relaxed">
            ChatJS gives you a credible baseline for building AI chat apps fast:
            real product infrastructure, flexible model support, and room to
            grow beyond a demo.
          </p>
          <div className="mt-8 flex flex-wrap gap-4">
            <Link
              className="group inline-flex items-center gap-2 rounded-xl border border-border bg-card px-4 py-2 font-medium text-sm transition-all duration-300 hover:border-foreground/20 hover:text-foreground"
              href="/docs/getting-started"
            >
              See the setup guide
              <span className="inline-block transition-transform duration-300 group-hover:translate-x-0.5">
                &rarr;
              </span>
            </Link>
            <Link
              className="inline-flex items-center rounded-xl border border-border bg-card px-4 py-2 font-medium text-sm transition-all duration-300 hover:border-foreground/20 hover:text-foreground"
              href="/docs"
            >
              Explore documentation
            </Link>
          </div>
        </div>

        <div className="grid gap-4">
          {USE_CASES.map((item, index) => (
            <article
              className="use-case-card group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all duration-400 hover:border-border/80 hover:shadow-black/5 hover:shadow-lg dark:hover:shadow-black/20"
              key={item.title}
              style={{ animationDelay: `${index * 100}ms` }}
            >
              {/* Top-left gradient glow on hover */}
              <div
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-2xl bg-linear-to-br from-foreground/3 via-transparent to-transparent opacity-0 transition-opacity duration-400 group-hover:opacity-100"
              />

              <div className="relative flex items-start gap-4">
                <span className="mt-1 shrink-0 font-mono text-[10px] text-muted-foreground/40 transition-colors duration-400 group-hover:text-muted-foreground/70">
                  {item.number}
                </span>
                <div>
                  <h3 className="font-semibold text-xl tracking-tight">
                    {item.title}
                  </h3>
                  <p className="mt-3 text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
