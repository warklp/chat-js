import { ProjectChatPage } from "./project-chat-page";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function ProjectChatPageRoute() {
  // Data loading lives in the client route system so project bootstrap entries
  // can replace persisted queries during the first-message navigation.
  return <ProjectChatPage />;
}
