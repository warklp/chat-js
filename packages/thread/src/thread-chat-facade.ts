import { Chat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import type { ThreadRuntime } from "./runtime";

function subscribeWithThrottle<TMessage extends UIMessage>(
	runtime: ThreadRuntime<TMessage>,
	listener: () => void,
	waitMs?: number,
) {
	if (!waitMs) {
		return runtime.subscribe(listener);
	}

	let lastCall = 0;
	let timeout: ReturnType<typeof setTimeout> | undefined;
	const notify = () => {
		const elapsed = Date.now() - lastCall;
		if (elapsed >= waitMs) {
			lastCall = Date.now();
			listener();
			return;
		}
		if (timeout) {
			return;
		}
		timeout = setTimeout(() => {
			timeout = undefined;
			lastCall = Date.now();
			listener();
		}, waitMs - elapsed);
	};

	const unsubscribe = runtime.subscribe(notify);
	return () => {
		unsubscribe();
		if (timeout) {
			clearTimeout(timeout);
		}
	};
}

/**
 * Adapts the canonical thread runtime to the concrete Chat contract required
 * by useChat({ chat }). The inherited linear state and request engine are not
 * used; all state and operations delegate to ThreadRuntime.
 */
export class ThreadChatFacade<
	TMessage extends UIMessage = UIMessage,
> extends Chat<TMessage> {
	readonly runtime: ThreadRuntime<TMessage>;

	constructor(runtime: ThreadRuntime<TMessage>) {
		super({
			id: runtime.chatId,
			messages: runtime.getSnapshot().messages,
			transport: runtime.transport,
		});
		this.runtime = runtime;

		this.sendMessage = runtime.sendMessage;
		this.regenerate = runtime.regenerate;
		this.stop = runtime.stop;
		this.resumeStream = runtime.resumeStream;
		this.clearError = runtime.clearError;
		this.addToolOutput = runtime.addToolOutput;
		this.addToolResult = runtime.addToolResult;
		this.addToolApprovalResponse = runtime.addToolApprovalResponse;

		this["~registerMessagesCallback"] = (listener, waitMs) =>
			subscribeWithThrottle(runtime, listener, waitMs);
		this["~registerStatusCallback"] = (listener) => runtime.subscribe(listener);
		this["~registerErrorCallback"] = (listener) => runtime.subscribe(listener);
	}

	override get messages() {
		return this.runtime.getSnapshot().messages;
	}

	override set messages(messages: TMessage[]) {
		this.runtime.setMessages(messages);
	}

	override get status() {
		return this.runtime.getSnapshot().status;
	}

	override get error() {
		return this.runtime.getSnapshot().error;
	}
}
