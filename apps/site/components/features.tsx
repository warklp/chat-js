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

const FEATURES = [
	{
		icon: BrainCircuit,
		title: "Multi-Model",
		description:
			"Access hundreds of AI models from OpenAI, Anthropic, Google, and more through a unified interface.",
	},
	{
		icon: Lock,
		title: "Authentication",
		description:
			"Built-in auth with Google, GitHub, and Vercel OAuth. Ready for production from day one.",
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
			"Run code in a secure sandbox with support for Python, JavaScript, and more.",
	},
	{
		icon: Image,
		title: "Image Generation",
		description:
			"Generate images inline in conversations with support for multiple generation models.",
	},
	{
		icon: Puzzle,
		title: "MCP Support",
		description:
			"Connect external tools and services through the Model Context Protocol.",
	},
	{
		icon: Globe,
		title: "Web Search",
		description:
			"Search the web and retrieve URLs to ground conversations in real-time information.",
	},
	{
		icon: GitBranch,
		title: "Branching",
		description:
			"Branch conversations to explore different directions without losing context.",
	},
];

export function Features() {
	return (
		<section className="mx-auto max-w-5xl px-6 py-16">
			<h2 className="text-center text-2xl font-semibold sm:text-3xl">
				Everything you need, out of the box
			</h2>
			<p className="mx-auto mt-4 max-w-2xl text-center text-muted-foreground">
				Production features that would take months to build, ready in minutes.
			</p>
			<div className="mt-12 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-4">
				{FEATURES.map((feature) => (
					<div
						key={feature.title}
						className="rounded-xl border border-border bg-card p-6 transition-colors hover:bg-secondary/50"
					>
						<feature.icon className="h-8 w-8 text-primary" />
						<h3 className="mt-4 font-medium">{feature.title}</h3>
						<p className="mt-2 text-sm text-muted-foreground leading-relaxed">
							{feature.description}
						</p>
					</div>
				))}
			</div>
		</section>
	);
}
