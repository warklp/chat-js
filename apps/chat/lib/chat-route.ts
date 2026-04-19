"use client";

import { usePathname } from "next/navigation";
import {
  type ParsedChatIdFromPathname,
  parseChatIdFromPathname,
} from "@/providers/parse-chat-id-from-pathname";

export type ChatRouteSource = ParsedChatIdFromPathname["source"];

export function useCurrentChatRoute() {
  const pathname = usePathname();

  return parseChatIdFromPathname(pathname);
}
