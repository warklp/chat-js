import { afterEach, describe, expect, test } from "bun:test";
import { Chat, type UseChatHelpers, useChat } from "@ai-sdk/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getMessageText, ThreadRuntime } from "../src/runtime";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type PendingRequest = {
	abortSignal: AbortSignal | undefined;
	controller: ReadableStreamDefaultController<UIMessageChunk>;
	messages: UIMessage[];
};

class ControlledTransport implements ChatTransport<UIMessage> {
	readonly aborted = new Set<string>();
	readonly requests = new Map<string, PendingRequest>();

	sendMessages: ChatTransport<UIMessage>["sendMessages"] = (options) => {
		const body = options.body as
			| {
					assistantMessageId?: string;
					tree?: { assistantMessageId?: string };
			  }
			| undefined;
		const requestId =
			body?.tree?.assistantMessageId ?? body?.assistantMessageId;
		if (!requestId) {
			throw new Error("Spike requires an assistantMessageId");
		}

		return Promise.resolve(
			new ReadableStream<UIMessageChunk>({
				start: (controller) => {
					this.requests.set(requestId, {
						abortSignal: options.abortSignal,
						controller,
						messages: structuredClone(options.messages),
					});
					options.abortSignal?.addEventListener(
						"abort",
						() => {
							this.aborted.add(requestId);
							controller.enqueue({ type: "abort" });
							controller.close();
						},
						{ once: true },
					);
				},
			}),
		);
	};

	reconnectToStream() {
		return Promise.resolve(null);
	}

	emitText(requestId: string, textId: string, text: string) {
		const request = this.requests.get(requestId);
		if (!request) {
			throw new Error(`Unknown request ${requestId}`);
		}
		request.controller.enqueue({ messageId: requestId, type: "start" });
		request.controller.enqueue({ id: textId, type: "text-start" });
		request.controller.enqueue({ delta: text, id: textId, type: "text-delta" });
	}

	finish(requestId: string) {
		const request = this.requests.get(requestId);
		if (!request) {
			throw new Error(`Unknown request ${requestId}`);
		}
		request.controller.enqueue({ finishReason: "stop", type: "finish" });
		request.controller.close();
	}
}

function userMessage(id: string, text: string): UIMessage {
	return {
		id,
		parts: [{ text, type: "text" }],
		role: "user",
	};
}

async function waitFor(predicate: () => boolean) {
	for (let attempt = 0; attempt < 100; attempt += 1) {
		if (predicate()) {
			return;
		}
		await Bun.sleep(1);
	}
	throw new Error("Timed out waiting for spike state");
}

/**
 * SPIKE: the smallest object accepted by useChat({ chat }) without a cast.
 *
 * It extends the public React Chat class only to satisfy useChat's concrete
 * `Chat` type and subscription protocol. All behavior and state are delegated
 * to ThreadRuntime; the inherited linear Chat engine is never used.
 */
class ThreadChatFacade extends Chat<UIMessage> {
	readonly runtime: ThreadRuntime<UIMessage>;

	constructor(runtime: ThreadRuntime<UIMessage>) {
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

		this["~registerMessagesCallback"] = (listener) =>
			runtime.subscribe(listener);
		this["~registerStatusCallback"] = (listener) => runtime.subscribe(listener);
		this["~registerErrorCallback"] = (listener) => runtime.subscribe(listener);
	}

	override get messages() {
		return this.runtime.getSnapshot().messages;
	}

	override set messages(messages: UIMessage[]) {
		this.runtime.setMessages(messages);
	}

	override get status() {
		return this.runtime.getSnapshot().status;
	}

	override get error() {
		return this.runtime.getSnapshot().error;
	}
}

let renderer: ReactTestRenderer | undefined;

afterEach(() => {
	if (renderer) {
		act(() => renderer?.unmount());
		renderer = undefined;
	}
});

describe("SPIKE: useChat with an externally owned thread facade", () => {
	test("standard useChat helpers read and mutate ThreadRuntime directly", async () => {
		const transport = new ControlledTransport();
		const runtime = new ThreadRuntime<UIMessage>({ transport });
		const facade = new ThreadChatFacade(runtime);
		let helpers: UseChatHelpers<UIMessage> | undefined;

		function Probe() {
			helpers = useChat({ chat: facade });
			return null;
		}

		await act(async () => {
			renderer = create(createElement(Probe));
		});

		let sendPromise: Promise<void> | undefined;
		await act(async () => {
			sendPromise = helpers?.sendMessage(userMessage("user-a", "A"), {
				body: { assistantMessageId: "assistant-a" },
			});
			await waitFor(() => transport.requests.has("assistant-a"));
			transport.emitText("assistant-a", "text-a", "alpha");
			transport.finish("assistant-a");
			await sendPromise;
		});

		expect(helpers?.messages.map((message) => message.id)).toEqual([
			"user-a",
			"assistant-a",
		]);
		expect(getMessageText(runtime.getMessage("assistant-a") as UIMessage)).toBe(
			"alpha",
		);
		expect(helpers?.status).toBe("ready");

		await act(async () => {
			helpers?.setMessages((messages) => messages.slice(0, 1));
		});
		expect(runtime.getSnapshot().cursorId).toBe("user-a");
		expect(helpers?.messages.map((message) => message.id)).toEqual(["user-a"]);
	});

	test("the facade keeps hidden branch runs alive while useChat follows the cursor", async () => {
		const transport = new ControlledTransport();
		const runtime = new ThreadRuntime<UIMessage>({ transport });
		const facade = new ThreadChatFacade(runtime);
		let helpers: UseChatHelpers<UIMessage> | undefined;

		function Probe() {
			helpers = useChat({ chat: facade });
			return null;
		}

		await act(async () => {
			renderer = create(createElement(Probe));
		});

		let runA: Awaited<ReturnType<ThreadRuntime["startRun"]>> | undefined;
		let runB: Awaited<ReturnType<ThreadRuntime["startRun"]>> | undefined;
		await act(async () => {
			runA = await runtime.startRun({
				follow: true,
				message: userMessage("user-a", "A"),
				request: { body: { assistantMessageId: "assistant-a" } },
			});
			runB = await runtime.startRun({
				follow: false,
				from: null,
				message: userMessage("user-b", "B"),
				request: { body: { assistantMessageId: "assistant-b" } },
			});
			await waitFor(() => transport.requests.size === 2);
			transport.emitText("assistant-a", "text-a", "alpha");
			transport.emitText("assistant-b", "text-b", "beta");
			await waitFor(
				() =>
					getMessageText(runtime.getMessage("assistant-a") as UIMessage) ===
						"alpha" &&
					getMessageText(runtime.getMessage("assistant-b") as UIMessage) ===
						"beta",
			);
			runtime.setCursor("assistant-b");
		});

		expect(helpers?.messages.map((message) => message.id)).toEqual([
			"user-b",
			"assistant-b",
		]);

		await act(async () => {
			transport.requests.get("assistant-a")?.controller.enqueue({
				delta: "-hidden",
				id: "text-a",
				type: "text-delta",
			});
			transport.finish("assistant-a");
			transport.finish("assistant-b");
			await Promise.all([runA?.finished, runB?.finished]);
		});

		expect(getMessageText(runtime.getMessage("assistant-a") as UIMessage)).toBe(
			"alpha-hidden",
		);
		expect(getMessageText(helpers?.messages.at(-1) as UIMessage)).toBe("beta");
	});
});

describe("SPIKE: one normal Chat instance is not a concurrent tree engine", () => {
	test("a second send shares linear history and stop only owns the latest response", async () => {
		const transport = new ControlledTransport();
		const chat = new Chat<UIMessage>({ transport });

		const requestA = chat.sendMessage(userMessage("user-a", "A"), {
			body: { assistantMessageId: "assistant-a" },
		});
		await waitFor(() => transport.requests.has("assistant-a"));
		const requestB = chat.sendMessage(userMessage("user-b", "B"), {
			body: { assistantMessageId: "assistant-b" },
		});
		await waitFor(() => transport.requests.has("assistant-b"));

		expect(
			transport.requests
				.get("assistant-a")
				?.messages.map((message) => message.id),
		).toEqual(["user-a"]);
		expect(
			transport.requests
				.get("assistant-b")
				?.messages.map((message) => message.id),
		).toEqual(["user-a", "user-b"]);

		await chat.stop();
		await requestB;
		expect(transport.aborted).toEqual(new Set(["assistant-b"]));

		transport.emitText("assistant-a", "text-a", "alpha");
		transport.finish("assistant-a");
		await requestA;
		expect(chat.messages.map((message) => message.id)).toEqual([
			"user-a",
			"user-b",
			"assistant-a",
		]);
	});
});
