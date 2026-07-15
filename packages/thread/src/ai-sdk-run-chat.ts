import {
	AbstractChat,
	type ChatState,
	type ChatStatus,
	type ChatTransport,
	type UIMessage,
} from "ai";
import type { ThreadChat } from "./thread-chat";
import type { ThreadRunSpec } from "./types";

class ThreadChatState<TMessage extends UIMessage>
	implements ChatState<TMessage>
{
	#error: Error | undefined;
	readonly #chat: ThreadChat<TMessage>;
	readonly #spec: ThreadRunSpec;
	#status: ChatStatus = "ready";

	constructor(chat: ThreadChat<TMessage>, spec: ThreadRunSpec) {
		this.#chat = chat;
		this.#spec = spec;
	}

	get error() {
		return this.#error;
	}

	set error(error: Error | undefined) {
		this.#error = error;
		this.#chat.setRunError(this.#spec.runId, error);
	}

	get messages() {
		const leafId = this.#chat.hasAssistantStarted(this.#spec.assistantMessageId)
			? this.#spec.assistantMessageId
			: this.#spec.userMessageId;
		return this.#chat.getPath(leafId);
	}

	set messages(messages: TMessage[]) {
		this.#chat.mergeRunPath(messages);
	}

	get status() {
		return this.#status;
	}

	set status(status: ChatStatus) {
		this.#status = status;
		this.#chat.setRunStatus(this.#spec.runId, status);
	}

	popMessage = () => {
		const lastMessage = this.messages.at(-1);
		if (lastMessage) {
			this.#chat.removeMessage(lastMessage.id);
		}
	};

	pushMessage = (message: TMessage) => {
		this.writeMessage(message);
	};

	replaceMessage = (_index: number, message: TMessage) => {
		this.writeMessage(message);
	};

	snapshot = <T>(thing: T): T => structuredClone(thing);

	private writeMessage(message: TMessage) {
		if (message.role === "assistant") {
			const assistantMessage = {
				...message,
				id: this.#spec.assistantMessageId,
			};
			this.#chat.markAssistantStarted(this.#spec.assistantMessageId);
			this.#chat.upsertMessage(assistantMessage, this.#spec.userMessageId);
			this.#chat.indexMessageOwnership(this.#spec.runId, assistantMessage);
			return;
		}

		this.#chat.upsertMessage(message, this.#spec.parentMessageId);
	}
}

export class ThreadRunChat<
	TMessage extends UIMessage,
> extends AbstractChat<TMessage> {
	constructor(chat: ThreadChat<TMessage>, spec: ThreadRunSpec) {
		const transport: ChatTransport<TMessage> = {
			reconnectToStream: (options) => chat.transport.reconnectToStream(options),
			sendMessages: (options) => chat.transport.sendMessages(options),
		};
		super({
			dataPartSchemas: chat.dataPartSchemas,
			generateId: () => spec.assistantMessageId,
			id: chat.id,
			messageMetadataSchema: chat.messageMetadataSchema,
			onData: (event) => chat.onData?.(event),
			onError: (error) => {
				chat.setRunError(spec.runId, error);
				chat.onError?.(error);
			},
			onFinish: (event) => {
				const assistantMessage = {
					...event.message,
					id: spec.assistantMessageId,
				};
				chat.upsertMessage(assistantMessage, spec.userMessageId, {
					silent: true,
				});
				chat.indexMessageOwnership(spec.runId, assistantMessage);
				chat.finishRequest(spec.runId, event.isAbort);
				chat.onFinish?.({
					...event,
					message: assistantMessage,
					messages: chat.getPath(spec.assistantMessageId),
				});
			},
			onToolCall: async (event) => {
				chat.registerToolCall(spec.runId, event.toolCall.toolCallId);
				await chat.onToolCall?.(event);
			},
			sendAutomaticallyWhen: (event) =>
				chat.sendAutomaticallyWhen?.(event) ?? false,
			state: new ThreadChatState(chat, spec),
			transport,
		});
	}
}
