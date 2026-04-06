import { ArrowUpRight, Download } from "lucide-react";

import { siteLinks } from "@/lib/site-config";

/* ── Platform logo icons ──────────────────────────────────────────── */

function AppleLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M18.71 19.5c-.83 1.24-1.71 2.45-3.05 2.47-1.34.03-1.77-.79-3.29-.79-1.53 0-2 .77-3.27.82-1.31.05-2.3-1.32-3.14-2.53C4.25 17 2.94 12.45 4.7 9.39c.87-1.52 2.43-2.48 4.12-2.51 1.28-.02 2.5.87 3.29.87.78 0 2.26-1.07 3.8-.91.65.03 2.47.26 3.64 1.98-.09.06-2.17 1.28-2.15 3.81.03 3.02 2.65 4.03 2.68 4.04-.03.07-.42 1.44-1.38 2.83M13 3.5c.73-.83 1.94-1.46 2.94-1.5.13 1.17-.34 2.35-1.04 3.19-.69.85-1.83 1.51-2.95 1.42-.15-1.15.41-2.35 1.05-3.11z" />
    </svg>
  );
}

function WindowsLogo({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="currentColor"
      viewBox="0 0 24 24"
    >
      <path d="M3 12V6.75l6-1.32v6.48L3 12zm6.73-.07l8.27-.9V3.12l-8.27 1.24v7.57zM18 12.08l-8.27.9v7.57l8.27 1.24V12.08zM9 12.1l-6 .09v5.16l6 1.32V12.1z" />
    </svg>
  );
}

function BrowserFrame({ className }: { className?: string }) {
  return (
    <svg
      aria-hidden="true"
      className={className}
      fill="none"
      viewBox="0 0 120 80"
    >
      <rect
        height="72"
        rx="8"
        stroke="currentColor"
        strokeOpacity="0.25"
        strokeWidth="1"
        width="112"
        x="4"
        y="4"
      />
      <line
        stroke="currentColor"
        strokeOpacity="0.15"
        strokeWidth="1"
        x1="4"
        x2="116"
        y1="20"
        y2="20"
      />
      <circle cx="16" cy="12" fill="currentColor" opacity="0.2" r="2.5" />
      <circle cx="24" cy="12" fill="currentColor" opacity="0.15" r="2.5" />
      <circle cx="32" cy="12" fill="currentColor" opacity="0.1" r="2.5" />
      <rect
        fill="currentColor"
        height="6"
        opacity="0.1"
        rx="3"
        width="40"
        x="42"
        y="9"
      />
    </svg>
  );
}

/* ── Main Component ───────────────────────────────────────────────── */

export function Platforms() {
  return (
    <section
      aria-labelledby="platforms-heading"
      className="relative overflow-hidden py-28 sm:py-36"
    >
      {/* Background atmosphere */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute top-0 left-1/2 h-[600px] w-[900px] -translate-x-1/2 rounded-full bg-foreground/[0.02] blur-[100px]" />
        <div className="absolute bottom-0 left-[20%] h-[400px] w-[500px] rounded-full bg-amber-500/[0.015] blur-[120px] dark:bg-amber-400/[0.025]" />
        <div className="absolute top-[40%] right-[15%] h-[350px] w-[400px] rounded-full bg-indigo-500/[0.012] blur-[100px] dark:bg-indigo-400/[0.02]" />
      </div>

      <div className="relative mx-auto max-w-6xl px-6">
        {/* ── Header ── */}
        <div className="mb-20 grid gap-6 lg:grid-cols-[1fr_auto] lg:items-end">
          <div>
            <p className="font-mono text-[11px] text-foreground/50 uppercase tracking-[0.35em]">
              Platforms
            </p>
            <h2
              className="mt-5 max-w-xl font-display text-4xl leading-[1.1] tracking-tight sm:text-5xl lg:text-6xl"
              id="platforms-heading"
            >
              Use it on the <span className="italic">web</span>,
              <br className="hidden sm:block" /> or on{" "}
              <span className="italic">desktop</span>
            </h2>
          </div>
          <p className="max-w-sm text-[15px] text-foreground/60 leading-relaxed lg:text-right">
            Start in the browser instantly. Download the desktop app for a
            faster, focused experience.
          </p>
        </div>

        {/* ── Cards ── */}
        <div className="grid gap-4 lg:grid-cols-5 lg:gap-5">
          {/* Web — spans 3 columns */}
          <a
            className="platform-card group relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/40 bg-card/60 p-8 backdrop-blur-sm transition-all duration-500 hover:border-foreground/15 hover:bg-card/90 hover:shadow-2xl hover:shadow-foreground/[0.04] sm:p-10 lg:col-span-3 lg:min-h-[360px]"
            href={siteLinks.demo}
          >
            {/* Hover glow */}
            <div className="pointer-events-none absolute -top-24 -right-24 h-64 w-64 rounded-full bg-amber-500/[0.06] opacity-0 blur-[80px] transition-opacity duration-700 group-hover:opacity-100 dark:bg-amber-400/[0.08]" />

            <div className="relative z-10">
              <div className="inline-flex items-center gap-2 rounded-full border border-foreground/[0.08] bg-foreground/[0.04] px-3 py-1">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 shadow-[0_0_6px_1px] shadow-emerald-500/40" />
                <span className="font-mono text-[10px] text-foreground/60 uppercase tracking-[0.2em]">
                  Live
                </span>
              </div>

              <h3 className="mt-8 font-display text-3xl tracking-tight sm:text-4xl">
                Web
              </h3>
              <p className="mt-4 max-w-md text-[15px] text-foreground/55 leading-relaxed">
                Open ChatJS instantly at{" "}
                <span className="font-mono text-foreground/70 text-sm">
                  demo.chatjs.dev
                </span>
                . No install, no sign-up friction. The full experience, right in
                your browser.
              </p>
            </div>

            {/* Browser illustration */}
            <div className="relative z-10 mt-8 flex items-end justify-between">
              <span className="inline-flex items-center gap-2 font-medium text-foreground/70 text-sm transition-colors duration-300 group-hover:text-foreground">
                Launch web app
                <ArrowUpRight className="h-4 w-4 transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
              </span>
              <BrowserFrame className="hidden h-20 w-auto text-foreground/60 transition-transform duration-500 group-hover:scale-105 sm:block" />
            </div>
          </a>

          {/* Desktop — spans 2 columns, single card with horizontal buttons */}
          <div
            className="platform-card relative flex flex-col justify-between overflow-hidden rounded-2xl border border-border/40 bg-card/60 p-8 backdrop-blur-sm sm:p-10 lg:col-span-2"
            style={{ animationDelay: "0.08s" }}
          >
            <div className="pointer-events-none absolute -bottom-20 -left-20 h-56 w-56 rounded-full bg-indigo-500/[0.04] blur-[80px] dark:bg-indigo-400/[0.06]" />

            <div className="relative z-10">
              <p className="font-mono text-[10px] text-foreground/45 uppercase tracking-[0.25em]">
                Desktop
              </p>
              <h3 className="mt-5 font-display text-3xl tracking-tight sm:text-4xl">
                Desktop
              </h3>
              <p className="mt-4 text-[15px] text-foreground/55 leading-relaxed">
                Packaged for your OS with auto-updates. Runs outside the browser
                so it's always one click away.
              </p>
            </div>

            <div className="relative z-10 mt-10 flex flex-col gap-3 sm:flex-row">
              <a
                className="group inline-flex flex-1 items-center justify-center gap-3 rounded-xl border border-border/50 bg-foreground/[0.03] px-5 py-3.5 transition-all duration-300 hover:border-foreground/20 hover:bg-foreground/[0.07]"
                href={siteLinks.desktopMac}
              >
                <AppleLogo className="h-5 w-5 text-foreground/70 transition-colors group-hover:text-foreground" />
                <span className="font-medium text-foreground/75 text-sm transition-colors group-hover:text-foreground">
                  macOS
                </span>
                <Download className="ml-auto h-3.5 w-3.5 text-foreground/40 transition-all duration-300 group-hover:translate-y-0.5 group-hover:text-foreground/70" />
              </a>
              <a
                className="group inline-flex flex-1 items-center justify-center gap-3 rounded-xl border border-border/50 bg-foreground/[0.03] px-5 py-3.5 transition-all duration-300 hover:border-foreground/20 hover:bg-foreground/[0.07]"
                href={siteLinks.desktopWindows}
              >
                <WindowsLogo className="h-5 w-5 text-foreground/70 transition-colors group-hover:text-foreground" />
                <span className="font-medium text-foreground/75 text-sm transition-colors group-hover:text-foreground">
                  Windows
                </span>
                <Download className="ml-auto h-3.5 w-3.5 text-foreground/40 transition-all duration-300 group-hover:translate-y-0.5 group-hover:text-foreground/70" />
              </a>
              <a
                className="group inline-flex flex-1 items-center justify-center gap-3 rounded-xl border border-border/50 bg-foreground/[0.03] px-5 py-3.5 transition-all duration-300 hover:border-foreground/20 hover:bg-foreground/[0.07]"
                href={siteLinks.desktop}
              >
                <span className="font-medium text-foreground/75 text-sm transition-colors group-hover:text-foreground">
                  Linux
                </span>
                <Download className="ml-auto h-3.5 w-3.5 text-foreground/40 transition-all duration-300 group-hover:translate-y-0.5 group-hover:text-foreground/70" />
              </a>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
