import { describe, expect, test } from "bun:test";
import type { ChatTransport, FileUIPart, UIMessage, UIMessageChunk } from "ai";
import { getMessageText, ThreadRuntime } from "../src/thread-runtime";

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

class CountingTransport extends EmptyTransport {
	requests = 0;

	override sendMessages() {
		this.requests += 1;
		return super.sendMessages();
	}
}

class HangingTransport extends EmptyTransport {
	controller: ReadableStreamDefaultController<UIMessageChunk> | undefined;

	override sendMessages() {
		return Promise.resolve(
			new ReadableStream<UIMessageChunk>({
				start: (controller) => {
					this.controller = controller;
				},
			}),
		);
	}

	finish() {
		this.controller?.close();
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

	test("uses the latest transport for newly started runs", async () => {
		const initialTransport = new CountingTransport();
		const nextTransport = new CountingTransport();
		const runtime = new ThreadRuntime<UIMessage>({
			transport: initialTransport,
		});

		runtime.updateOptions({ transport: nextTransport });
		await runtime.sendMessage(
			{ messageId: "u1", text: "latest transport" },
			{ body: { assistantMessageId: "a1" } },
		);

		expect(initialTransport.requests).toBe(0);
		expect(nextTransport.requests).toBe(1);
	});

	test("preserves prebuilt file parts and matches useChat part ordering", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			transport: new EmptyTransport(),
		});
		const file: FileUIPart = {
			filename: "notes.txt",
			mediaType: "text/plain",
			type: "file",
			url: "data:text/plain;base64,aGVsbG8=",
		};

		await runtime.sendMessage(
			{ files: [file], messageId: "u1", text: "Read this" },
			{ body: { assistantMessageId: "a1" } },
		);

		expect(runtime.getMessage("u1")?.parts).toEqual([
			file,
			{ text: "Read this", type: "text" },
		]);
	});

	test("preserves omitted callbacks when options are updated", async () => {
		const finished: string[] = [];
		const runtime = new ThreadRuntime<UIMessage>({
			onFinish: ({ message }) => finished.push(message.id),
			transport: new EmptyTransport(),
		});

		runtime.updateOptions({ transport: new EmptyTransport() });
		await runtime.sendMessage(
			{ messageId: "u1", text: "callback" },
			{ body: { assistantMessageId: "a1" } },
		);

		expect(finished).toEqual(["a1"]);
	});

	test("uses the latest transport when resuming an existing run", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			transport: new EmptyTransport(),
		});
		await runtime.sendMessage(
			{ messageId: "u1", text: "resume" },
			{ body: { assistantMessageId: "a1" } },
		);
		const resumeTransport = new ResumeTransport();

		runtime.updateOptions({ transport: resumeTransport });
		await runtime.resumeRun("a1");

		expect(resumeTransport.lastReconnectOptions).toBeDefined();
		expect(getMessageText(runtime.getMessage("a1") as UIMessage)).toBe(
			"resumed",
		);
	});

	test("rejects non-leaf removal and moves the cursor after leaf removal", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
			],
			transport: new EmptyTransport(),
		});

		expect(() => runtime.removeMessage("u1")).toThrow(
			"Cannot remove non-leaf message u1",
		);
		expect(runtime.getSnapshot().cursorId).toBe("a1");
		runtime.removeMessage("a1");

		expect(runtime.getSnapshot().cursorId).toBe("u1");
		expect(runtime.getMessage("a1")).toBeUndefined();
	});

	test("validates a reconciled path before changing existing messages", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{
					id: "u1",
					parts: [{ text: "before", type: "text" }],
					role: "user",
				},
				{ id: "a1", parts: [], role: "assistant" },
				{ id: "u2", parts: [], role: "user" },
			],
			transport: new EmptyTransport(),
		});

		expect(() =>
			runtime.setMessages([
				{
					id: "u1",
					parts: [{ text: "after", type: "text" }],
					role: "user",
				},
				{ id: "u2", parts: [], role: "user" },
			]),
		).toThrow("Cannot move message u2");
		expect(getMessageText(runtime.getMessage("u1") as UIMessage)).toBe(
			"before",
		);
	});

	test("rejects cyclic reparenting without changing the tree", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
			],
			transport: new EmptyTransport(),
		});

		expect(() =>
			runtime.addMessage({ id: "u1", parts: [], role: "user" }, "a1"),
		).toThrow("Cannot create a cycle involving u1");
		expect(runtime.getSnapshot().parentById).toEqual({ a1: "u1", u1: null });
	});

	test("rejects assistant identity collisions before adding the user message", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u0", parts: [], role: "user" },
				{ id: "a0", parts: [], role: "assistant" },
			],
			transport: new EmptyTransport(),
		});

		await expect(
			runtime.sendMessage(
				{ messageId: "u1", text: "should not be inserted" },
				{ body: { assistantMessageId: "a0" } },
			),
		).rejects.toThrow("Message or run a0 already exists");
		expect(runtime.getMessage("u1")).toBeUndefined();
		expect(runtime.getSnapshot().messages.map((message) => message.id)).toEqual(
			["u0", "a0"],
		);
	});

	test("restore clears run ownership and publishes the restored snapshot", async () => {
		const runtime = new ThreadRuntime<UIMessage>({
			transport: new EmptyTransport(),
		});
		await runtime.sendMessage(
			{ messageId: "u1", text: "old" },
			{ body: { assistantMessageId: "a1" } },
		);
		runtime.registerToolCall("a1", "tool-old");
		let notifications = 0;
		runtime.subscribe(() => {
			notifications += 1;
		});

		runtime.restore({
			childrenByParentId: { __root__: ["u2"] },
			cursorId: "u2",
			messagesById: {
				u2: { id: "u2", parts: [], role: "user" },
			},
			parentById: { u2: null },
			rootIds: ["u2"],
			version: 1,
		});

		expect(notifications).toBe(1);
		expect(runtime.getSnapshot().messages.map((message) => message.id)).toEqual(
			["u2"],
		);
		expect(runtime.getRun("a1")).toBeUndefined();
		await expect(
			runtime.addToolOutput({
				output: "stale",
				tool: "test",
				toolCallId: "tool-old",
			}),
		).rejects.toThrow("No run owns tool call tool-old");
	});

	test("rejects tree replacement while a run is active", async () => {
		const transport = new HangingTransport();
		const runtime = new ThreadRuntime<UIMessage>({ transport });
		const run = await runtime.startRun({
			message: { messageId: "u1", text: "active" },
			request: { body: { assistantMessageId: "a1" } },
		});

		expect(() =>
			runtime.restore({
				childrenByParentId: {},
				cursorId: null,
				messagesById: {},
				parentById: {},
				rootIds: [],
				version: 1,
			}),
		).toThrow("Cannot replace the tree while runs are active");
		transport.finish();
		await run.finished;
	});

	test("rejects tool ownership collisions across runs", () => {
		const runtime = new ThreadRuntime<UIMessage>({
			transport: new EmptyTransport(),
		});

		runtime.registerToolCall("run-a", "tool-shared");
		expect(() => runtime.registerToolCall("run-b", "tool-shared")).toThrow(
			"tool call tool-shared is already owned by run run-a",
		);
	});
});
