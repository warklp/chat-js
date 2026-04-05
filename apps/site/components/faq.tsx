const FAQS = [
  {
    question: "What is ChatJS?",
    answer:
      "ChatJS is an open-source Next.js AI chat app starter that gives you a production-ready foundation with authentication, streaming UI, tool calling, and support for 120+ models.",
  },
  {
    question: "Who is ChatJS for?",
    answer:
      "It is aimed at developers and product teams building AI copilots, internal assistants, customer chat products, or multi-model playgrounds that need to ship quickly without starting from zero.",
  },
  {
    question: "Can I use ChatJS with multiple AI providers?",
    answer:
      "Yes. The project is designed for multi-provider workflows, so you can evaluate and route across model vendors without rebuilding your frontend and app infrastructure.",
  },
  {
    question: "Is ChatJS suitable for production use?",
    answer:
      "Yes. The starter includes the core building blocks teams usually need before launch, including auth, model integrations, streaming responses, and a modern type-safe stack.",
  },
];

export function Faq() {
  return (
    <section
      aria-labelledby="faq-heading"
      className="bg-secondary/50 py-24 sm:py-32"
    >
      <div className="mx-auto max-w-4xl px-6">
        <div className="text-center">
          <p className="font-mono text-foreground/70 text-xs uppercase tracking-[0.25em]">
            FAQ
          </p>
          <h2
            className="mt-4 font-display text-3xl tracking-tight sm:text-5xl"
            id="faq-heading"
          >
            Frequently asked questions
          </h2>
          <p className="mx-auto mt-6 max-w-2xl text-foreground/75 text-lg leading-relaxed">
            These answers cover the common evaluation points for teams looking
            for a Next.js AI chat template they can extend in production.
          </p>
        </div>

        <div className="mt-12 space-y-4">
          {FAQS.map((item) => (
            <details
              className="group rounded-2xl border border-border/50 bg-card p-6"
              key={item.question}
            >
              <summary className="cursor-pointer list-none font-semibold text-lg tracking-tight marker:hidden">
                {item.question}
              </summary>
              <p className="mt-4 text-foreground/75 leading-relaxed">
                {item.answer}
              </p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}
