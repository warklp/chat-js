import type { Metadata } from "next";
import { DeviceLoginPage } from "@/components/device-login-page";

export const metadata: Metadata = {
  title: "Device Login",
  description: "Sign in for the desktop app",
};

export default function DeviceLoginRoute() {
  return <DeviceLoginPage />;
}
