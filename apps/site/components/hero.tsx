import { ArrowRight, BookOpen } from "lucide-react";
import Link from "next/link";

export function Hero() {
	return (
		<section className="relative overflow-hidden">
			{/* Background atmosphere */}
			<div className="pointer-events-none absolute inset-0">
				<div className="absolute inset-0 bg-[radial-gradient(circle,var(--color-border)_1px,transparent_1px)] bg-size-[32px_32px] opacity-40" />
				<div className="absolute top-1/2 left-1/2 h-[600px] w-[900px] -translate-x-1/2 -translate-y-1/3 rounded-full bg-primary/10 blur-[140px]" />
			</div>

			<div className="relative mx-auto max-w-6xl px-6 pt-20 pb-20 sm:pt-28 sm:pb-28">
				{/* Badge */}
				<div className="flex justify-center animate-fade-in-up">
					<a
						href="https://github.com/franciscomoretti/chat-js"
						className="inline-flex items-center gap-2 rounded-full border border-border/60 bg-card/70 px-4 py-1.5 text-sm text-muted-foreground backdrop-blur-sm transition-colors hover:border-primary/40 hover:text-foreground"
					>
						<svg
							className="h-3.5 w-3.5"
							viewBox="0 0 24 24"
							fill="currentColor"
							aria-hidden="true"
						>
							<title>GitHub</title>
							<path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
						</svg>
						Open Source — Apache 2.0
						<ArrowRight className="h-3 w-3" />
					</a>
				</div>

				{/* Headline */}
				<h1
					className="mx-auto mt-8 max-w-4xl text-center font-display text-5xl tracking-tight text-foreground sm:text-7xl lg:text-8xl animate-fade-in-up"
					style={{ animationDelay: "0.1s" }}
				>
					Ship AI chat in{" "}
					<span className="text-primary italic">minutes</span>, not
					months
				</h1>

				{/* Subhead */}
				<p
					className="mx-auto mt-8 max-w-2xl text-center text-lg leading-relaxed text-muted-foreground sm:text-xl animate-fade-in-up"
					style={{ animationDelay: "0.2s" }}
				>
					An open-source, production-ready AI chat foundation.
					Authentication, 120+ models, streaming, tool calling —
					everything you need to launch.
				</p>

				{/* CTAs */}
				<div
					className="mt-10 flex flex-wrap items-center justify-center gap-4 animate-fade-in-up"
					style={{ animationDelay: "0.3s" }}
				>
					<Link
						href="/docs/getting-started"
						className="inline-flex items-center gap-2 rounded-xl bg-primary px-6 py-3 text-sm font-medium text-primary-foreground shadow-lg shadow-primary/20 transition-all hover:-translate-y-0.5 hover:shadow-xl hover:shadow-primary/25"
					>
						Get Started
						<ArrowRight className="h-4 w-4" />
					</Link>
					<Link
						href="https://demo.chatjs.dev"
						className="inline-flex items-center gap-2 rounded-xl border border-border bg-card/80 px-6 py-3 text-sm font-medium text-foreground backdrop-blur-sm transition-all hover:-translate-y-0.5 hover:bg-card"
					>
						View Demo
					</Link>
					<Link
						href="/docs"
						className="inline-flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
					>
						<BookOpen className="h-4 w-4" />
						Read the Docs
					</Link>
				</div>

				{/* Chat Mockup */}
				<div
					className="relative mx-auto mt-20 max-w-3xl animate-fade-in-up"
					style={{ animationDelay: "0.5s" }}
				>
					{/* Glow behind mockup */}
					<div className="pointer-events-none absolute -inset-8 rounded-3xl bg-primary/8 blur-2xl" />

					<div className="animate-float relative rounded-2xl border border-border/70 bg-card shadow-2xl shadow-black/8 dark:shadow-black/25">
						{/* Title bar */}
						<div className="flex items-center gap-2 border-b border-border/50 px-5 py-3.5">
							<div className="flex gap-2">
								<div className="h-3 w-3 rounded-full bg-red-400/60" />
								<div className="h-3 w-3 rounded-full bg-amber-400/60" />
								<div className="h-3 w-3 rounded-full bg-green-400/60" />
							</div>
							<span className="ml-2 text-xs font-medium text-muted-foreground/60">
								ChatJS
							</span>
						</div>

						{/* Chat messages */}
						<div className="space-y-5 p-6 sm:p-8">
							{/* User message */}
							<div className="flex justify-end">
								<div className="max-w-[75%] rounded-2xl rounded-br-sm bg-primary px-4 py-3 text-sm leading-relaxed text-primary-foreground">
									Build me a dashboard with real-time
									analytics and chart visualizations
								</div>
							</div>

							{/* AI response */}
							<div className="flex justify-start">
								<div className="max-w-[80%] rounded-2xl rounded-bl-sm bg-secondary px-4 py-3 text-sm leading-relaxed text-secondary-foreground">
									I&apos;ll create a responsive analytics
									dashboard with live-updating charts. Let me
									set up the data layer with WebSocket
									connections and configure the chart
									components
									<span className="ml-1 inline-block h-4 w-1.5 translate-y-0.5 animate-blink rounded-sm bg-foreground/60" />
								</div>
							</div>
						</div>

						{/* Input bar */}
						<div className="border-t border-border/50 px-5 py-3.5 sm:px-8">
							<div className="flex items-center rounded-xl bg-secondary/60 px-4 py-2.5">
								<span className="text-sm text-muted-foreground/40">
									Ask anything...
								</span>
							</div>
						</div>
					</div>
				</div>
			</div>
		</section>
	);
}
