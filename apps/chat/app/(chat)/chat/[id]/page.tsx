import { ChatPage } from "./chat-page";

export default function ChatPageRoute() {
  // Data loading lives in the client route system so provisional bootstrap
  // entries can replace persisted queries during the first-message navigation.
  return <ChatPage />;
}
