"use client";

import { useEffect } from "react";
import { traceThread } from "@/lib/thread-debug";

export function ThreadDebugBootstrap() {
  useEffect(() => {
    traceThread("debug", "session.start", {
      href: window.location.href,
    });
  }, []);

  return null;
}
