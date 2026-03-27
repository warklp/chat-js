const PROVIDERS = ["OpenAI", "Anthropic", "Google", "xAI", "Meta"];

export function LogoCloud() {
	return (
		<section className="border-y border-border/30 py-12">
			<div className="mx-auto max-w-6xl px-6">
				<p className="text-center text-sm tracking-wide text-muted-foreground/60 uppercase">
					Access 120+ models from leading AI providers
				</p>
				<div className="mt-8 flex flex-wrap items-center justify-center gap-x-14 gap-y-4">
					{PROVIDERS.map((name) => (
						<span
							key={name}
							className="text-xl font-medium tracking-tight text-foreground/25 transition-colors hover:text-foreground/50"
						>
							{name}
						</span>
					))}
				</div>
			</div>
		</section>
	);
}
