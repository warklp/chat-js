const PROVIDERS = ["OpenAI", "Anthropic", "Google", "xAI", "Meta"];

export function LogoCloud() {
	return (
		<section className="border-y border-border/40 py-12">
			<div className="mx-auto max-w-6xl px-6">
				<p className="text-center text-sm tracking-wide text-muted-foreground/70 uppercase">
					Access 120+ models from leading AI providers
				</p>
				<div className="mt-8 flex flex-wrap items-center justify-center gap-x-14 gap-y-4">
					{PROVIDERS.map((name) => (
						<span
							key={name}
							className="text-xl font-medium tracking-tight text-muted-foreground/40 transition-colors hover:text-muted-foreground/70"
						>
							{name}
						</span>
					))}
				</div>
			</div>
		</section>
	);
}
