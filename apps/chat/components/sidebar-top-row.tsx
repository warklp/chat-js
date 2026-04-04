"use client";

import { PanelLeftIcon } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { SidebarToggle } from "@/components/sidebar-toggle";
import { useSidebar } from "@/components/ui/sidebar";
import { config } from "@/lib/config";
import { useChatId } from "@/providers/chat-id-provider";

export function SidebarTopRow() {
  const { isMobile, openMobile, setOpenMobile, state, toggleSidebar } =
    useSidebar();
  const { refreshChatID } = useChatId();
  const isExpanded = isMobile ? openMobile : state === "expanded";

  return (
    <div className="flex w-full items-center justify-between gap-2">
      {isExpanded ? (
        <Link
          className="flex flex-row items-center gap-2"
          href="/"
          onClick={() => {
            setOpenMobile(false);
            refreshChatID();
          }}
        >
          <span className="flex cursor-pointer items-center gap-2 rounded-md p-1 font-semibold text-lg hover:bg-muted">
            <Image
              alt={config.appName}
              className="h-5 w-5"
              height={20}
              src="/icon.svg"
              width={20}
            />
            {config.appName}
          </span>
        </Link>
      ) : (
        <button
          aria-label="Expand sidebar"
          className="group/logo relative flex size-8 items-center justify-center rounded-md hover:bg-muted"
          onClick={toggleSidebar}
          type="button"
        >
          <Image
            alt={config.appName}
            className="h-5 w-5 transition-opacity duration-150 group-hover/logo:opacity-0"
            height={20}
            src="/icon.svg"
            width={20}
          />
          <PanelLeftIcon className="absolute size-4 opacity-0 transition-opacity duration-150 group-hover/logo:opacity-100" />
        </button>
      )}

      {isExpanded && <SidebarToggle className="md:h-fit md:px-2" />}
    </div>
  );
}
