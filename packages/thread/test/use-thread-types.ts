import type { UseChatHelpers } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { type UseThreadHelpers, useThread } from "../src/react";

declare const messageId: string;

function useCompatibilityCheck() {
	const thread = useThread();
	const chatCompatible: UseChatHelpers<UIMessage> = thread;

	chatCompatible.messages;
	chatCompatible.sendMessage({ text: "hello" });
	chatCompatible.setMessages((messages) => messages);

	thread.tree.setCursor(messageId);
	thread.tree.setCursor(null);
	thread.tree.getPath(messageId);
	thread.tree.getChildren(null);
	thread.tree.getSiblings(messageId);
	thread.tree.stopAllStreams();

	const explicitHelpers: UseThreadHelpers<UIMessage> = thread;
	explicitHelpers.exportTree();
	return explicitHelpers;
}

void useCompatibilityCheck;
