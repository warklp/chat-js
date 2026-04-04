import type { Metadata } from "next";
import { SignupForm } from "@/components/signup-form";
import { buttonVariants } from "@/components/ui/button";
import { buildAuthPageHref } from "@/lib/electron-auth";
import { cn } from "@/lib/utils";

export const metadata: Metadata = {
  title: "Create an account",
  description: "Create an account to get started.",
};

export default async function RegisterPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;

  return (
    <div className="container m-auto flex h-dvh w-screen flex-col items-center justify-center px-4">
      <a
        className={cn(
          buttonVariants({ variant: "ghost" }),
          "absolute top-4 right-4 md:top-8 md:right-8"
        )}
        href={buildAuthPageHref("/login", resolvedSearchParams)}
      >
        Login
      </a>
      <div className="mx-auto w-full sm:w-[480px]">
        <SignupForm />
      </div>
    </div>
  );
}
