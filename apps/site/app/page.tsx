import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { GetStarted } from "@/components/get-started";
import { Hero } from "@/components/hero";
import { LogoCloud } from "@/components/logo-cloud";
import { Navbar } from "@/components/navbar";

export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col">
			<Navbar />
			<main className="flex-1">
				<Hero />
				<LogoCloud />
				<Features />
				<GetStarted />
			</main>
			<Footer />
		</div>
	);
}
