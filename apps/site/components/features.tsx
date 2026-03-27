import type { LucideIcon } from "lucide-react";
import {
	BrainCircuit,
	Code,
	GitBranch,
	Globe,
	Image,
	Lock,
	Puzzle,
	Search,
} from "lucide-react";

type Feature = {
	icon: LucideIcon;
	title: string;
	description: string;
	large?: boolean;
	tags?: string[];
};

const FEATURES: Feature[] = [
	{
		icon: BrainCircuit,
		title: "120+ Models",
		description:
			"Access Claude, GPT, Gemini, Grok, Llama, and more through a unified interface. Switch providers mid-conversation without losing context.",
		large: true,
		tags: ["Claude", "GPT-4o", "Gemini", "Grok", "Llama", "Mistral"],
	},
	{
		icon: Lock,
		title: "Authentication",
		description:
			"Built-in OAuth with Google, GitHub, and Vercel. Session management, anonymous mode, and rate limiting — production-ready from day one.",
	},
	{
		icon: Search,
		title: "Deep Research",
		description:
			"Multi-step research agent that searches the web, synthesizes information, and produces comprehensive reports.",
	},
	{
		icon: Code,
		title: "Code Execution",
		description:
			"Run Python and JavaScript in secure sandboxes with pre-installed packages like pandas and numpy.",
	},
	{
		icon: Globe,
		title: "Web Search",
		description:
			"Real-time web search with citations to ground conversations in current information.",
	},
	{
		icon: Puzzle,
		title: "MCP Support",
		description:
			"Extend capabilities with external tools and services via the Model Context Protocol.",
	},
	{
		icon: Image,
		title: "Image Generation",
		description:
			"AI-powered image creation and editing, inline in conversations.",
	},
	{
		icon: GitBranch,
		title: "Branching",
		description:
			"Fork conversations to explore different directions without losing context.",
	},
];

export function Features() {
	return (
		<section className="py-24 sm:py-32">
			<div className="mx-auto max-w-6xl px-6">
				<h2 className="text-center font-display text-3xl tracking-tight sm:text-5xl">
					Everything you need,{" "}
					<span className="italic">out of the box</span>
				</h2>
				<p className="mx-auto mt-6 max-w-2xl text-center text-lg text-muted-foreground">
					Production features that would take months to build, ready
					in minutes.
				</p>

				<div className="mt-16 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
					{FEATURES.map((feature) => (
						<div
							key={feature.title}
							className={`group relative overflow-hidden rounded-2xl border border-border/50 bg-card p-6 transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-lg hover:shadow-foreground/3 ${feature.large ? "sm:col-span-2" : ""}`}
						>
							{/* Hover glow */}
							<div className="pointer-events-none absolute -top-24 -left-24 h-48 w-48 rounded-full bg-foreground/2 opacity-0 blur-3xl transition-opacity duration-500 group-hover:opacity-100" />

							<div className="relative">
								<div className="inline-flex rounded-xl border border-border/50 bg-secondary/50 p-2.5">
									<feature.icon className="h-6 w-6 text-foreground/70" />
								</div>
								<h3 className="mt-4 text-lg font-semibold tracking-tight">
									{feature.title}
								</h3>
								<p className="mt-2 text-sm leading-relaxed text-muted-foreground">
									{feature.description}
								</p>
								{feature.tags && (
									<div className="mt-4 flex flex-wrap gap-2">
										{feature.tags.map((tag) => (
											<span
												key={tag}
												className="rounded-full border border-border/50 bg-secondary/50 px-3 py-1 text-xs font-medium text-secondary-foreground"
											>
												{tag}
											</span>
										))}
									</div>
								)}
							</div>
						</div>
					))}
				</div>
			</div>
		</section>
	);
}
