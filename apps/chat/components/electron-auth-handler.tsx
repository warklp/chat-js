"use client";

import { useEffect } from "react";
import authClient from "@/lib/auth-client";

/**
 * Handles the electron auth redirect after OAuth completes in the browser.
 * When the user finishes OAuth, `ensureElectronRedirect` detects the
 * electron redirect cookie and sends the user back to the Electron app
 * via deep link.
 *
 * Mount this in the root layout so it runs on every page.
 */
export function ElectronAuthHandler() {
  useEffect(() => {
    const id = authClient.ensureElectronRedirect();
    return () => clearTimeout(id);
  }, []);

  return null;
}
