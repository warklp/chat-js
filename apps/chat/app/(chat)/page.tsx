import { ChatHome } from "./chat-home";

export const dynamic = "force-dynamic";
export const fetchCache = "force-no-store";

export default function HomePage() {
  return <ChatHome />;
}
