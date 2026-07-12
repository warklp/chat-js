import { afterEach, describe, expect, test } from "bun:test";
import { Chat, type UseChatHelpers, useChat } from "@ai-sdk/react";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { createElement } from "react";
import { act, create, type ReactTestRenderer } from "react-test-renderer";
import { getMessageText, ThreadRuntime } from "../src/runtime";
import { ThreadChatFacade } from "../src/thread-chat-facade";
import { type UseThreadHelpers, useThread } from "../src/use-thread";

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

let renderer: ReactTestRenderer | undefined;

afterEach(() => {
	if (renderer) {
		act(() => renderer?.unmount());
		renderer = undefined;
	}
});

describe("SPIKE: useChat with an externally owned thread facade", () => {
	test("honors useChat's message subscription throttle", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [userMessage("root", "root")],
		});
		const facade = new ThreadChatFacade(runtime);
		let notifications = 0;
		const unsubscribe = facade["~registerMessagesCallback"](() => {
			notifications += 1;
		}, 10);

		runtime.setCursor(null);
		runtime.setCursor("root");
		expect(notifications).toBe(1);

		await Bun.sleep(15);
		expect(notifications).toBe(2);
		unsubscribe();
	});

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

describe("SPIKE: current useThread React behavior", () => {
	test("refreshes callbacks without replacing the runtime", async () => {
		const transport = new ControlledTransport();
		const finishedBy: string[] = [];
		let helpers: UseThreadHelpers<UIMessage> | undefined;

		function Probe({ callbackVersion }: { callbackVersion: string }) {
			helpers = useThread({
				id: "callback-chat",
				onFinish: () => finishedBy.push(callbackVersion),
				transport,
			});
			return null;
		}

		await act(async () => {
			renderer = create(createElement(Probe, { callbackVersion: "old" }));
		});
		await act(async () => {
			renderer?.update(createElement(Probe, { callbackVersion: "new" }));
		});

		let run: Awaited<ReturnType<ThreadRuntime["startRun"]>> | undefined;
		await act(async () => {
			run = await helpers?.tree.startRun({
				message: userMessage("callback-user", "callback"),
				request: { body: { assistantMessageId: "callback-assistant" } },
			});
			await waitFor(() => transport.requests.has("callback-assistant"));
			transport.emitText("callback-assistant", "callback-text", "done");
			transport.finish("callback-assistant");
			await run?.finished;
		});

		expect(finishedBy).toEqual(["new"]);
	});

	test("batches multiple external-store notifications into one React render", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			id: "render-chat",
			messages: [userMessage("root", "root")],
		});
		let helpers: UseThreadHelpers<UIMessage> | undefined;
		let renderCount = 0;

		function Probe() {
			renderCount += 1;
			helpers = useThread({ runtime });
			return null;
		}

		await act(async () => {
			renderer = create(createElement(Probe));
		});
		const rendersBefore = renderCount;

		await act(async () => {
			helpers?.tree.setCursor(null);
		});

		expect(renderCount - rendersBefore).toBe(1);
		expect(helpers?.messages).toEqual([]);
	});

	test("switches externally owned runtimes with the same chat id", async () => {
		const runtimeA = new ThreadRuntime<UIMessage>({
			id: "shared-id",
			messages: [userMessage("user-a", "A")],
		});
		const runtimeB = new ThreadRuntime<UIMessage>({
			id: "shared-id",
			messages: [userMessage("user-b", "B")],
		});
		let helpers: UseThreadHelpers<UIMessage> | undefined;

		function Probe({ runtime }: { runtime: ThreadRuntime<UIMessage> }) {
			helpers = useThread({ runtime });
			return null;
		}

		await act(async () => {
			renderer = create(createElement(Probe, { runtime: runtimeA }));
		});
		expect(helpers?.messages.map((message) => message.id)).toEqual(["user-a"]);

		await act(async () => {
			renderer?.update(createElement(Probe, { runtime: runtimeB }));
		});
		expect(helpers?.messages.map((message) => message.id)).toEqual(["user-b"]);

		await act(async () => {
			runtimeB.setCursor(null);
		});
		expect(helpers?.messages).toEqual([]);
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
