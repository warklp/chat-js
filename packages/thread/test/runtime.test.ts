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

	reconnectToStream(): Promise<ReadableStream<UIMessageChunk> | null> {
		return Promise.resolve(null);
	}
}

class ResumeTransport extends EmptyTransport {
	reconnectToStream() {
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

		const snapshot = runtime.exportTree();
		expect(Object.keys(snapshot.messagesById)).toEqual([
			"user-from-app",
			"assistant-from-app",
		]);
		expect(snapshot.parentById).toEqual({
			"assistant-from-app": "user-from-app",
			"user-from-app": null,
		});
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
		const runtime = new ThreadRuntime<UIMessage>({
			messages: [
				{ id: "u1", parts: [], role: "user" },
				{ id: "a1", parts: [], role: "assistant" },
			],
			transport: new ResumeTransport(),
		});

		await runtime.resumeStream();

		expect(getMessageText(runtime.getMessage("a1") as UIMessage)).toBe(
			"resumed",
		);
		expect(runtime.getRun("run:a1")?.state).toBe("completed");
	});
});
