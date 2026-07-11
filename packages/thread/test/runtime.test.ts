import { describe, expect, test } from "bun:test";
import type { ChatTransport, UIMessage, UIMessageChunk } from "ai";
import { getMessageText, ThreadRuntime } from "../src/runtime";

class EmptyTransport implements ChatTransport<UIMessage> {
	sendMessages() {
		return Promise.resolve(
			new ReadableStream({
				start(controller) {
					controller.close();
				},
			}),
		);
	}

	reconnectToStream(
		_options: Parameters<ChatTransport<UIMessage>["reconnectToStream"]>[0],
	): Promise<ReadableStream<UIMessageChunk> | null> {
		return Promise.resolve(null);
	}
}

class ResumeTransport extends EmptyTransport {
	lastReconnectOptions:
		| Parameters<ChatTransport<UIMessage>["reconnectToStream"]>[0]
		| undefined;

	reconnectToStream(
		options: Parameters<ChatTransport<UIMessage>["reconnectToStream"]>[0],
	) {
		this.lastReconnectOptions = options;
		return Promise.resolve(
			new ReadableStream<UIMessageChunk>({
				start(controller) {
					controller.enqueue({ id: "text", type: "text-start" });
					controller.enqueue({
						delta: "resumed",
						id: "text",
						type: "text-delta",
					});
					controller.enqueue({ id: "text", type: "text-end" });
					controller.enqueue({ finishReason: "stop", type: "finish" });
					controller.close();
				},
			}),
		);
	}
}

describe("ThreadRuntime.sendMessage", () => {
	test("preserves the id of a complete UIMessage input", async () => {
		let generatedIdCount = 0;
		const runtime = new ThreadRuntime<UIMessage>({
			generateId: () => {
				generatedIdCount += 1;
				return `generated-${generatedIdCount}`;
			},
			transport: new EmptyTransport(),
		});
		const message: UIMessage = {
			id: "user-from-app",
			parts: [{ text: "Create one node", type: "text" }],
			role: "user",
		};

		await runtime.sendMessage(message, {
			body: { assistantMessageId: "assistant-from-app" },
		});

		const snapshot = runtime.getTreeSnapshot();
		expect(Object.keys(snapshot.messagesById)).toEqual([
			"user-from-app",
			"assistant-from-app",
		]);
		expect(snapshot.parentById).toEqual({
			"assistant-from-app": "user-from-app",
			"user-from-app": null,
		});
		expect(runtime.getRun("assistant-from-app")?.assistantMessageId).toBe(
			"assistant-from-app",
		);
		expect(generatedIdCount).toBe(0);
	});

	test("reconciles the selected path without deleting hidden branches", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
				{ id: "u2", parts: [], role: "user" },
			],
			transport: new EmptyTransport(),
		});

		runtime.setMessages((messages) => messages.slice(0, 1));
		expect(runtime.getSnapshot().cursorId).toBe("u1");
		expect(runtime.getMessage("a1")).toBeDefined();
		expect(runtime.getMessage("u2")).toBeDefined();

		runtime.setMessages([
			{ id: "u1", parts: [], role: "user" },
			{ id: "a2", parts: [], role: "assistant" },
		]);
		expect(runtime.getChildren("u1").map((message) => message.id)).toEqual([
			"a1",
			"a2",
		]);
	});

	test("rejects attempts to move an existing node to another parent", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
			],
			transport: new EmptyTransport(),
		});

		expect(() =>
			runtime.setMessages([{ id: "a1", parts: [], role: "assistant" }]),
		).toThrow("Cannot move message a1");
	});

	test("resumes a restored assistant path without an in-memory run", async () => {
		const transport = new ResumeTransport();
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
			],
			transport,
		});

		await runtime.resumeStream();

		expect(getMessageText(runtime.getMessage("a1") as UIMessage)).toBe(
			"resumed",
		);
		expect(runtime.getRun("a1")?.status).toBe("ready");
		expect(transport.lastReconnectOptions?.body).toEqual(
			expect.objectContaining({
				assistantMessageId: "a1",
				tree: expect.objectContaining({
					assistantMessageId: "a1",
				}),
			}),
		);
	});

	test("does not mutate the tree when concurrency rejects a run", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			concurrency: { maxActiveRuns: 0 },
			transport: new EmptyTransport(),
		});

		await expect(
			runtime.sendMessage({ messageId: "u1", text: "blocked" }),
		).rejects.toThrow("Cannot start another run from u1");
		expect(runtime.getTreeSnapshot().messagesById).toEqual({});
	});

	test("rejects an unknown parent before adding a node", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			transport: new EmptyTransport(),
		});

		expect(() =>
			runtime.addMessage(
				{ id: "u1", parts: [], role: "user" },
				"missing-parent",
			),
		).toThrow("Unknown parent message missing-parent");
	});

	test("matches useChat's visible path after editing a user message", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [{ text: "before", type: "text" }], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
			],
			transport: new EmptyTransport(),
		});

		await runtime.sendMessage(
			{ messageId: "u1", text: "after" },
			{ body: { assistantMessageId: "a2" } },
		);

		expect(runtime.getSnapshot().messages.map((message) => message.id)).toEqual(
			["u1", "a2"],
		);
		expect(getMessageText(runtime.getSnapshot().messages[0] as UIMessage)).toBe(
			"after",
		);
		expect(runtime.getChildren("u1").map((message) => message.id)).toEqual([
			"a1",
			"a2",
		]);
	});
});
