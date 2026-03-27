import { Features } from "@/components/features";
import { Footer } from "@/components/footer";
import { Hero } from "@/components/hero";
import { Navbar } from "@/components/navbar";

export default function HomePage() {
	return (
		<div className="min-h-screen flex flex-col">
			<Navbar />
			<main className="flex-1">
				<Hero />
				<Features />
			</main>
			<Footer />
		</div>
	);
}
