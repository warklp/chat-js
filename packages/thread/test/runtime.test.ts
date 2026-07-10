import { describe, expect, test } from "bun:test";
import type { ChatTransport, UIMessage } from "ai";
import { ThreadRuntime } from "../src/runtime";

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

	reconnectToStream() {
		return Promise.resolve(null);
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
});
