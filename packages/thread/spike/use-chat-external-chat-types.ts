import { type Chat, useChat } from "@ai-sdk/react";
import { AbstractChat, type ChatState, type UIMessage } from "ai";

declare const state: ChatState<UIMessage>;

class AbstractExternalChat extends AbstractChat<UIMessage> {
	constructor() {
		super({ state });
	}
}

declare const concreteChat: Chat<UIMessage>;
declare const abstractChat: AbstractExternalChat;

function Supported() {
	return useChat({ chat: concreteChat });
}

function RejectedByPublicType() {
	// AbstractChat lacks @ai-sdk/react's three `~register*Callback` methods.
	// @ts-expect-error useChat({ chat }) requires the concrete React Chat class.
	return useChat({ chat: abstractChat });
}

void Supported;
void RejectedByPublicType;
