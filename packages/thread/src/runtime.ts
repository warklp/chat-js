import {
	AbstractChat,
	type ChatInit,
	type ChatRequestOptions,
	type ChatState,
	type ChatStatus,
	type ChatTransport,
	type CreateUIMessage,
	convertFileListToFileUIParts,
	DefaultChatTransport,
	generateId,
	type UIMessage,
} from "ai";

export const ROOT_PARENT_ID = "__root__";

export type ThreadRunState = "active" | "aborted" | "completed" | "failed";

export type ThreadRun = {
	assistantMessageId: string;
	error: Error | undefined;
	follow: boolean;
	id: string;
	originCursorId: string | null;
	parentMessageId: string | null;
	state: ThreadRunState;
	status: ChatStatus;
	userMessageId: string;
};

export type ThreadRunHandle = {
	readonly assistantMessageId: string;
	readonly finished: Promise<void>;
	readonly id: string;
	getSnapshot: () => ThreadRun | undefined;
	stop: () => Promise<void>;
};

export type TreeSendOptions = ChatRequestOptions & {
	tree?: {
		follow?: boolean;
		from?: string | null;
		[key: string]: unknown;
	};
};

export type ThreadStartRunOptions<TMessage extends UIMessage = UIMessage> = {
	follow?: boolean;
	from?: string | null;
	message?: SendMessageInput<TMessage>;
	request?: TreeSendOptions;
};

export type ThreadConcurrency = {
	maxActiveRuns?: number;
	maxActiveRunsPerMessage?: number;
};

export type ThreadEvent =
	| { cursorId: string | null; type: "cursor-changed" }
	| { run: ThreadRun; type: "run-started" | "run-updated" }
	| {
			run: ThreadRun;
			type: "run-aborted" | "run-completed" | "run-failed";
	  };

export type MessageTreeSnapshot<TMessage extends UIMessage = UIMessage> = {
	childrenByParentId: Record<string, string[]>;
	cursorId: string | null;
	messagesById: Record<string, TMessage>;
	parentById: Record<string, string | null>;
	rootIds: string[];
	version: 1;
};

export type TreeStateSnapshot<TMessage extends UIMessage = UIMessage> =
	MessageTreeSnapshot<TMessage> & {
		error: Error | undefined;
		lastEvent: string;
		messages: TMessage[];
		status: ChatStatus;
		activeRuns: ThreadRun[];
		runs: ThreadRun[];
		storeVersion: number;
		treeStatus: ChatStatus;
	};

export type MessageTreeStore<TMessage extends UIMessage = UIMessage> = {
	addMessage: (message: TMessage, parentId: string | null) => void;
	exportTree: () => MessageTreeSnapshot<TMessage>;
	getChildren: (messageId: string | null) => TMessage[];
	getLeaves: (messageId?: string | null) => TMessage[];
	getMessage: (messageId: string) => TMessage | undefined;
	getParent: (messageId: string) => TMessage | undefined;
	getPath: (messageId?: string | null) => TMessage[];
	getSiblings: (messageId: string) => TMessage[];
	replacePath: (messages: TMessage[]) => void;
	setCursor: (messageId: string | null) => void;
	setCursorToParentOf: (messageId: string) => void;
	stopAll: () => Promise<void>;
	stopRun: (runId: string) => Promise<void>;
};

type RunSpec = {
	assistantMessageId: string;
	follow: boolean;
	originCursorId: string | null;
	parentMessageId: string | null;
	runId: string;
	userMessageId: string;
};

type RunRecord<TMessage extends UIMessage> = {
	aborted: boolean;
	chat: ThreadRunChat<TMessage>;
	error: Error | undefined;
	finished: Promise<void>;
	spec: RunSpec;
	state: ThreadRunState;
	status: ChatStatus;
};

function getAssistantMessageIdFromOptions(options?: TreeSendOptions) {
	const assistantMessageId = (
		options?.body as Record<string, unknown> | undefined
	)?.assistantMessageId;
	return typeof assistantMessageId === "string" ? assistantMessageId : null;
}

export type ThreadRuntimeOptions<TMessage extends UIMessage = UIMessage> = Omit<
	ChatInit<TMessage>,
	"messages"
> & {
	concurrency?: ThreadConcurrency;
	initialTree?: MessageTreeSnapshot<TMessage>;
	messages?: TMessage[];
	onThreadEvent?: (event: ThreadEvent) => void;
};

export type SendMessageInput<TMessage extends UIMessage> = Parameters<
	AbstractChat<TMessage>["sendMessage"]
>[0];

function getInputMessageId<TMessage extends UIMessage>(
	input: NonNullable<SendMessageInput<TMessage>>,
) {
	if ("id" in input && typeof input.id === "string") {
		return input.id;
	}
	return input.messageId;
}

function parentKey(parentId: string | null) {
	return parentId ?? ROOT_PARENT_ID;
}

function clone<T>(value: T): T {
	return structuredClone(value);
}

export function getMessageText(message: UIMessage) {
	return message.parts
		.map((part) => (part.type === "text" ? part.text : ""))
		.join("");
}

function createEmptyAssistantMessage<TMessage extends UIMessage>({
	id,
}: {
	id: string;
}): TMessage {
	return {
		id,
		parts: [],
		role: "assistant",
	} as unknown as TMessage;
}

async function createUserMessageFromInput<TMessage extends UIMessage>({
	fallbackId,
	input,
}: {
	fallbackId: string;
	input: NonNullable<SendMessageInput<TMessage>>;
}): Promise<TMessage> {
	const messageId = getInputMessageId(input) ?? fallbackId;
	const metadata = "metadata" in input ? input.metadata : undefined;

	if ("text" in input) {
		const fileParts =
			"files" in input && input.files
				? await convertFileListToFileUIParts(input.files as FileList)
				: [];

		return {
			id: messageId,
			metadata,
			parts: [{ text: input.text, type: "text" }, ...fileParts],
			role: "user",
		} as TMessage;
	}

	if ("files" in input && input.files) {
		return {
			id: messageId,
			metadata,
			parts: await convertFileListToFileUIParts(input.files as FileList),
			role: "user",
		} as TMessage;
	}

	return {
		...input,
		id: messageId,
		metadata,
		parts: "parts" in input ? input.parts : [],
		role: "user",
	} as TMessage;
}

class ThreadChatState<TMessage extends UIMessage>
	implements ChatState<TMessage>
{
	#error: Error | undefined;
	readonly #runtime: ThreadRuntime<TMessage>;
	readonly #spec: RunSpec;
	#status: ChatStatus = "ready";

	constructor(runtime: ThreadRuntime<TMessage>, spec: RunSpec) {
		this.#runtime = runtime;
		this.#spec = spec;
	}

	get error() {
		return this.#error;
	}

	set error(error: Error | undefined) {
		this.#error = error;
		this.#runtime.setRunError(this.#spec.runId, error);
	}

	get messages() {
		const leafId = this.#runtime.hasAssistantStarted(
			this.#spec.assistantMessageId,
		)
			? this.#spec.assistantMessageId
			: this.#spec.userMessageId;
		return this.#runtime.getPath(leafId);
	}

	set messages(messages: TMessage[]) {
		this.#runtime.mergeRunPath(messages);
	}

	get status() {
		return this.#status;
	}

	set status(status: ChatStatus) {
		this.#status = status;
		this.#runtime.setRunStatus(this.#spec.runId, status);
	}

	popMessage = () => {
		const lastMessage = this.messages.at(-1);
		if (lastMessage) {
			this.#runtime.removeMessage(lastMessage.id);
		}
	};

	pushMessage = (message: TMessage) => {
		if (message.role === "assistant") {
			const assistantMessage = {
				...message,
				id: this.#spec.assistantMessageId,
			};
			this.#runtime.markAssistantStarted(this.#spec.assistantMessageId);
			this.#runtime.upsertMessage(assistantMessage, this.#spec.userMessageId);
			this.#runtime.indexMessageOwnership(this.#spec.runId, assistantMessage);
			return;
		}

		this.#runtime.upsertMessage(message, this.#spec.parentMessageId);
	};

	replaceMessage = (_index: number, message: TMessage) => {
		if (message.role === "assistant") {
			const assistantMessage = {
				...message,
				id: this.#spec.assistantMessageId,
			};
			this.#runtime.markAssistantStarted(this.#spec.assistantMessageId);
			this.#runtime.upsertMessage(assistantMessage, this.#spec.userMessageId);
			this.#runtime.indexMessageOwnership(this.#spec.runId, assistantMessage);
			return;
		}

		this.#runtime.upsertMessage(message, this.#spec.parentMessageId);
	};

	snapshot = <T>(thing: T): T => clone(thing);
}

class ThreadRunChat<TMessage extends UIMessage> extends AbstractChat<TMessage> {
	constructor(runtime: ThreadRuntime<TMessage>, spec: RunSpec) {
		super({
			dataPartSchemas: runtime.dataPartSchemas,
			generateId: () => spec.assistantMessageId,
			id: runtime.chatId,
			messageMetadataSchema: runtime.messageMetadataSchema,
			onData: (event) => runtime.onData?.(event),
			onError: (error) => {
				runtime.setRunError(spec.runId, error);
				runtime.onError?.(error);
			},
			onFinish: (event) => {
				const assistantMessage = {
					...event.message,
					id: spec.assistantMessageId,
				};
				runtime.upsertMessage(assistantMessage, spec.userMessageId);
				runtime.indexMessageOwnership(spec.runId, assistantMessage);
				runtime.finishRequest(spec.runId, event.isAbort);
				runtime.onFinish?.({ ...event, message: assistantMessage });
			},
			onToolCall: async (event) => {
				runtime.registerToolCall(spec.runId, event.toolCall.toolCallId);
				await runtime.onToolCall?.(event);
			},
			sendAutomaticallyWhen: (event) =>
				runtime.sendAutomaticallyWhen?.(event) ?? false,
			state: new ThreadChatState(runtime, spec),
			transport: runtime.transport,
		});
	}
}

export class ThreadRuntime<TMessage extends UIMessage = UIMessage> {
	readonly chatId: string;
	readonly dataPartSchemas: ThreadRuntimeOptions<TMessage>["dataPartSchemas"];
	readonly generateMessageId: NonNullable<
		ThreadRuntimeOptions<TMessage>["generateId"]
	>;
	readonly messageMetadataSchema: ThreadRuntimeOptions<TMessage>["messageMetadataSchema"];
	onData: ThreadRuntimeOptions<TMessage>["onData"];
	onError: ThreadRuntimeOptions<TMessage>["onError"];
	onFinish: ThreadRuntimeOptions<TMessage>["onFinish"];
	onThreadEvent: ThreadRuntimeOptions<TMessage>["onThreadEvent"];
	onToolCall: ThreadRuntimeOptions<TMessage>["onToolCall"];
	sendAutomaticallyWhen: ThreadRuntimeOptions<TMessage>["sendAutomaticallyWhen"];
	readonly transport: ChatTransport<TMessage>;

	readonly #assistantStarted = new Set<string>();
	readonly #childrenByParentId = new Map<string, string[]>();
	readonly #concurrency: Required<ThreadConcurrency>;
	readonly #listeners = new Set<() => void>();
	readonly #messagesById = new Map<string, TMessage>();
	readonly #parentById = new Map<string, string | null>();
	readonly #runIdByApprovalId = new Map<string, string>();
	readonly #runIdByToolCallId = new Map<string, string>();
	readonly #runsById = new Map<string, RunRecord<TMessage>>();
	#cursorId: string | null = null;
	#lastEvent = "Ready";
	#snapshot: TreeStateSnapshot<TMessage>;
	#storeVersion = 0;

	constructor(options: ThreadRuntimeOptions<TMessage> = {}) {
		this.chatId = options.id ?? generateId();
		this.dataPartSchemas = options.dataPartSchemas;
		this.generateMessageId = options.generateId ?? generateId;
		this.messageMetadataSchema = options.messageMetadataSchema;
		this.onData = options.onData;
		this.onError = options.onError;
		this.onFinish = options.onFinish;
		this.onThreadEvent = options.onThreadEvent;
		this.onToolCall = options.onToolCall;
		this.sendAutomaticallyWhen = options.sendAutomaticallyWhen;
		this.transport = options.transport ?? new DefaultChatTransport();
		this.#concurrency = {
			maxActiveRuns:
				options.concurrency?.maxActiveRuns ?? Number.POSITIVE_INFINITY,
			maxActiveRunsPerMessage:
				options.concurrency?.maxActiveRunsPerMessage ??
				Number.POSITIVE_INFINITY,
		};

		if (options.initialTree) {
			this.restore(options.initialTree);
		} else if (options.messages) {
			this.replacePath(options.messages, { silent: true });
		}

		this.#snapshot = this.buildSnapshot();
	}

	getSnapshot = () => this.#snapshot;

	updateCallbacks(options: ThreadRuntimeOptions<TMessage>) {
		this.onData = options.onData;
		this.onError = options.onError;
		this.onFinish = options.onFinish;
		this.onThreadEvent = options.onThreadEvent;
		this.onToolCall = options.onToolCall;
		this.sendAutomaticallyWhen = options.sendAutomaticallyWhen;
	}

	subscribe = (listener: () => void) => {
		this.#listeners.add(listener);
		return () => this.#listeners.delete(listener);
	};

	addMessage(message: TMessage, parentId: string | null) {
		this.upsertMessage(message, parentId);
	}

	clearError = () => {
		const run = this.getSelectedRunRecord();
		run?.chat.clearError();
	};

	addToolApprovalResponse: AbstractChat<TMessage>["addToolApprovalResponse"] =
		async (response) => {
			const run = this.getRunForApproval(response.id);
			await run.chat.addToolApprovalResponse(response);
		};

	addToolOutput: AbstractChat<TMessage>["addToolOutput"] = async (output) => {
		const run = this.getRunForToolCall(output.toolCallId);
		await run.chat.addToolOutput(output);
	};

	addToolResult: AbstractChat<TMessage>["addToolResult"] = this.addToolOutput;

	exportTree(): MessageTreeSnapshot<TMessage> {
		const snapshot = this.buildSnapshot();
		return {
			childrenByParentId: snapshot.childrenByParentId,
			cursorId: snapshot.cursorId,
			messagesById: snapshot.messagesById,
			parentById: snapshot.parentById,
			rootIds: snapshot.rootIds,
			version: 1,
		};
	}

	finishRequest(runId: string, isAbort: boolean) {
		const run = this.#runsById.get(runId);
		if (run) {
			run.aborted ||= isAbort;
		}
		this.emit(isAbort ? `Stopping ${runId}` : `Received ${runId}`);
	}

	getChildren(messageId: string | null) {
		return (this.#childrenByParentId.get(parentKey(messageId)) ?? [])
			.map((id) => this.#messagesById.get(id))
			.filter((message): message is TMessage => Boolean(message))
			.map(clone);
	}

	getLeaves(messageId: string | null = null) {
		const leaves: TMessage[] = [];
		const visit = (id: string) => {
			const children = this.#childrenByParentId.get(parentKey(id)) ?? [];
			if (children.length === 0) {
				const message = this.#messagesById.get(id);
				if (message) {
					leaves.push(clone(message));
				}
				return;
			}

			for (const childId of children) {
				visit(childId);
			}
		};

		for (const child of this.#childrenByParentId.get(parentKey(messageId)) ??
			[]) {
			visit(child);
		}

		return leaves;
	}

	getMessage(messageId: string) {
		const message = this.#messagesById.get(messageId);
		return message ? clone(message) : undefined;
	}

	getParent(messageId: string) {
		const parentId = this.#parentById.get(messageId);
		return parentId ? this.getMessage(parentId) : undefined;
	}

	getPath(messageId: string | null | undefined = this.#cursorId) {
		if (!messageId) {
			return [];
		}

		return this.getPathIds(messageId)
			.map((id) => this.#messagesById.get(id))
			.filter((message): message is TMessage => Boolean(message))
			.map(clone);
	}

	getSiblings(messageId: string) {
		const parentId = this.#parentById.get(messageId);
		if (!this.#messagesById.has(messageId)) {
			return [];
		}
		return this.getChildren(parentId ?? null);
	}

	hasAssistantStarted(assistantMessageId: string) {
		return this.#assistantStarted.has(assistantMessageId);
	}

	markAssistantStarted(assistantMessageId: string) {
		this.#assistantStarted.add(assistantMessageId);
	}

	regenerate: AbstractChat<TMessage>["regenerate"] = async ({
		messageId,
		...options
	} = {}) => {
		const target =
			(messageId ? this.#messagesById.get(messageId) : null) ??
			(this.#cursorId ? this.#messagesById.get(this.#cursorId) : null);
		if (!target) {
			return;
		}

		const userMessageId =
			target.role === "assistant" ? this.#parentById.get(target.id) : target.id;
		if (!userMessageId) {
			return;
		}

		const run = this.startAssistantForUser({
			follow: true,
			originCursorId: target.id,
			options,
			parentMessageId: this.#parentById.get(userMessageId) ?? null,
			userMessageId,
		});
		await run.finished;
	};

	removeMessage(messageId: string) {
		const parentId = this.#parentById.get(messageId);
		this.#messagesById.delete(messageId);
		this.#parentById.delete(messageId);
		const siblings =
			this.#childrenByParentId.get(parentKey(parentId ?? null)) ?? [];
		this.#childrenByParentId.set(
			parentKey(parentId ?? null),
			siblings.filter((id) => id !== messageId),
		);
		this.emit(`Removed ${messageId}`);
	}

	replacePath(messages: TMessage[], options: { silent?: boolean } = {}) {
		this.#childrenByParentId.clear();
		this.#messagesById.clear();
		this.#parentById.clear();

		let parentId: string | null = null;
		for (const message of messages) {
			this.upsertMessage(message, parentId, { silent: true });
			parentId = message.id;
		}

		this.#cursorId = messages.at(-1)?.id ?? null;
		if (!options.silent) {
			this.emit("Replaced active path");
		}
	}

	mergePath(messages: TMessage[], options: { silent?: boolean } = {}) {
		this.reconcilePath(messages, { moveCursor: true, ...options });
	}

	mergeRunPath(messages: TMessage[]) {
		this.reconcilePath(messages, { moveCursor: false, silent: true });
	}

	private reconcilePath(
		messages: TMessage[],
		options: { moveCursor: boolean; silent?: boolean },
	) {
		const ids = new Set<string>();
		let parentId: string | null = null;
		for (const message of messages) {
			if (ids.has(message.id)) {
				throw new Error(`Duplicate message id ${message.id} in path`);
			}
			ids.add(message.id);
			const existingParentId = this.#parentById.get(message.id);
			if (existingParentId !== undefined && existingParentId !== parentId) {
				throw new Error(
					`Cannot move message ${message.id} from ${existingParentId ?? "root"} to ${parentId ?? "root"}`,
				);
			}
			this.upsertMessage(message, parentId, { silent: true });
			parentId = message.id;
		}

		if (options.moveCursor) {
			this.#cursorId = messages.at(-1)?.id ?? null;
		}
		if (!options.silent) {
			this.emit("Reconciled active path");
		}
	}

	resumeStream: AbstractChat<TMessage>["resumeStream"] = async (
		options = {},
	) => {
		const run =
			this.getSelectedRunRecord() ?? this.createRunForSelectedAssistant();
		if (!run) {
			return;
		}
		await this.resumeRunRequest(run, options);
	};

	resumeRun = async (runId: string, options: ChatRequestOptions = {}) => {
		const run = this.getRunRecord(runId);
		await this.resumeRunRequest(run, options);
	};

	restore(snapshot: MessageTreeSnapshot<TMessage>) {
		this.#childrenByParentId.clear();
		this.#messagesById.clear();
		this.#parentById.clear();

		for (const [id, message] of Object.entries(snapshot.messagesById)) {
			this.#messagesById.set(id, clone(message));
		}
		for (const [id, parentId] of Object.entries(snapshot.parentById)) {
			this.#parentById.set(id, parentId);
		}
		for (const [id, children] of Object.entries(snapshot.childrenByParentId)) {
			this.#childrenByParentId.set(id, [...children]);
		}
		this.#cursorId = snapshot.cursorId;
	}

	setCursor(messageId: string | null) {
		if (messageId !== null && !this.#messagesById.has(messageId)) {
			throw new Error(`Unknown message ${messageId}`);
		}
		this.#cursorId = messageId;
		this.emit(`Set cursor ${messageId ?? "root"}`);
		this.onThreadEvent?.({ cursorId: messageId, type: "cursor-changed" });
	}

	setCursorToParentOf(messageId: string) {
		this.setCursor(this.#parentById.get(messageId) ?? null);
	}

	sendMessage = async (
		input?: SendMessageInput<TMessage>,
		options?: TreeSendOptions,
	) => {
		const run = await this.startRun({
			follow: options?.tree?.follow,
			from:
				options?.tree && "from" in options.tree
					? (options.tree.from ?? null)
					: undefined,
			message: input,
			request: options,
		});
		await run.finished;
	};

	startRun = async ({
		follow: requestedFollow,
		from,
		message: input,
		request: options,
	}: ThreadStartRunOptions<TMessage> = {}): Promise<ThreadRunHandle> => {
		const originCursorId = from === undefined ? this.#cursorId : from;
		if (originCursorId && !this.#messagesById.has(originCursorId)) {
			throw new Error(`Unknown message ${originCursorId}`);
		}
		const follow = requestedFollow ?? originCursorId === this.#cursorId;

		if (!input) {
			const originMessage = originCursorId
				? this.#messagesById.get(originCursorId)
				: undefined;
			if (!originMessage || originMessage.role !== "user") {
				this.emit("Select a user message before sending without input");
				throw new Error("Select a user message before starting a run");
			}

			return this.startAssistantForUser({
				follow,
				options,
				originCursorId,
				parentMessageId: this.#parentById.get(originMessage.id) ?? null,
				userMessageId: originMessage.id,
			});
		}

		const userMessage = await createUserMessageFromInput({
			fallbackId: getInputMessageId(input) ?? this.generateMessageId(),
			input,
		});
		const existingMessage = this.#messagesById.get(userMessage.id);
		if (existingMessage && existingMessage.role !== "user") {
			throw new Error(`Message ${userMessage.id} is not a user message`);
		}
		const attachmentId = existingMessage
			? (this.#parentById.get(userMessage.id) ?? null)
			: originCursorId;

		this.upsertMessage(userMessage, attachmentId, { silent: true });
		if (follow) {
			this.#cursorId = userMessage.id;
		}

		return this.startAssistantForUser({
			follow,
			options,
			originCursorId,
			parentMessageId: attachmentId,
			userMessageId: userMessage.id,
		});
	};

	setMessages(messages: TMessage[] | ((messages: TMessage[]) => TMessage[])) {
		const nextMessages =
			typeof messages === "function"
				? messages(this.#snapshot.messages)
				: messages;
		this.mergePath(nextMessages);
	}

	setRunError(runId: string, error: Error | undefined) {
		const run = this.#runsById.get(runId);
		if (!run) {
			return;
		}
		run.error = error;
		run.status = error ? "error" : run.status;
		this.emit(error ? `Error in ${runId}` : "Cleared error");
		this.emitRunEvent(run, "run-updated");
	}

	setRunStatus(runId: string, status: ChatStatus) {
		const run = this.#runsById.get(runId);
		if (!run) {
			return;
		}
		run.status = status;
		if (status === "submitted" || status === "streaming") {
			run.state = "active";
		} else if (status === "ready" && run.state === "active") {
			run.state = run.aborted ? "aborted" : "completed";
		}
		this.emit(`${runId} is ${status}`);
		this.emitRunEvent(run, "run-updated");
	}

	stop: AbstractChat<TMessage>["stop"] = () => {
		return this.getSelectedRunRecord()?.chat.stop() ?? Promise.resolve();
	};

	stopAll() {
		return Promise.all(
			this.getActiveRunRecords().map((run) => run.chat.stop()),
		).then(() => undefined);
	}

	stopRun(runId: string) {
		return this.#runsById.get(runId)?.chat.stop() ?? Promise.resolve();
	}

	stopRunForMessage(messageId: string) {
		const run = this.getRunForMessage(messageId);
		return run ? this.stopRun(run.id) : Promise.resolve();
	}

	upsertMessage(
		message: TMessage,
		parentId: string | null,
		options: { silent?: boolean } = {},
	) {
		const previousParentId = this.#parentById.get(message.id);
		this.#messagesById.set(message.id, clone(message));
		this.#parentById.set(message.id, parentId);

		if (previousParentId !== parentId) {
			if (previousParentId !== undefined) {
				const previousKey = parentKey(previousParentId);
				this.#childrenByParentId.set(
					previousKey,
					(this.#childrenByParentId.get(previousKey) ?? []).filter(
						(id) => id !== message.id,
					),
				);
			}

			const key = parentKey(parentId);
			const siblings = this.#childrenByParentId.get(key) ?? [];
			if (!siblings.includes(message.id)) {
				this.#childrenByParentId.set(key, [...siblings, message.id]);
			}
		}

		if (!options.silent) {
			this.emit(`Upserted ${message.id}`);
		}
	}

	private buildSnapshot(): TreeStateSnapshot<TMessage> {
		const messagesById = Object.fromEntries(
			Array.from(this.#messagesById.entries()).map(([id, message]) => [
				id,
				clone(message),
			]),
		);
		const parentById = Object.fromEntries(this.#parentById.entries());
		const childrenByParentId = Object.fromEntries(
			Array.from(this.#childrenByParentId.entries()).map(([id, children]) => [
				id,
				[...children],
			]),
		);
		const runs = Array.from(this.#runsById.values()).map((run) =>
			this.toRunSnapshot(run),
		);
		const activeRuns = runs.filter((run) => run.state === "active");
		const selectedRun = this.getSelectedRunRecord();
		const error = selectedRun?.error;

		return {
			childrenByParentId,
			cursorId: this.#cursorId,
			error,
			lastEvent: this.#lastEvent,
			messages: this.getPath(this.#cursorId),
			messagesById,
			parentById,
			rootIds: [...(this.#childrenByParentId.get(ROOT_PARENT_ID) ?? [])],
			status: selectedRun ? this.resolveStatus([selectedRun], error) : "ready",
			storeVersion: this.#storeVersion,
			activeRuns,
			runs,
			treeStatus: this.resolveStatus(
				Array.from(this.#runsById.values()).filter(
					(run) => run.state === "active" || run.state === "failed",
				),
			),
			version: 1,
		};
	}

	private canStartRun(userMessageId: string) {
		const activeRuns = this.getActiveRunRecords();
		if (activeRuns.length >= this.#concurrency.maxActiveRuns) {
			this.emit("Blocked run: max active runs reached");
			return false;
		}

		const activeRunsFromMessage = activeRuns.filter(
			(run) => run.spec.userMessageId === userMessageId,
		).length;
		if (activeRunsFromMessage >= this.#concurrency.maxActiveRunsPerMessage) {
			this.emit(`Blocked run: max active runs for ${userMessageId}`);
			return false;
		}

		return true;
	}

	private createStreamChat(spec: RunSpec) {
		return new ThreadRunChat(this, spec);
	}

	private createRunForSelectedAssistant() {
		if (!this.#cursorId) {
			return undefined;
		}
		const assistantMessage = this.#messagesById.get(this.#cursorId);
		if (!assistantMessage || assistantMessage.role !== "assistant") {
			return undefined;
		}
		const userMessageId = this.#parentById.get(assistantMessage.id);
		if (!userMessageId) {
			return undefined;
		}
		const spec: RunSpec = {
			assistantMessageId: assistantMessage.id,
			follow: true,
			originCursorId: assistantMessage.id,
			parentMessageId: this.#parentById.get(userMessageId) ?? null,
			runId: `run:${assistantMessage.id}`,
			userMessageId,
		};
		const record: RunRecord<TMessage> = {
			aborted: false,
			chat: this.createStreamChat(spec),
			error: undefined,
			finished: Promise.resolve(),
			spec,
			state: "completed",
			status: "ready",
		};
		this.#runsById.set(spec.runId, record);
		this.markAssistantStarted(assistantMessage.id);
		this.indexMessageOwnership(spec.runId, assistantMessage);
		this.emit(`Restored ${spec.runId}`);
		return record;
	}

	private completeRun(runId: string) {
		const run = this.#runsById.get(runId);
		if (!run) {
			return;
		}
		run.state = run.aborted ? "aborted" : run.error ? "failed" : "completed";
		this.emit(
			run.state === "aborted"
				? `Stopped ${runId}`
				: run.state === "failed"
					? `Failed ${runId}`
					: `Finished ${runId}`,
		);
		this.emitRunEvent(
			run,
			run.state === "aborted"
				? "run-aborted"
				: run.state === "failed"
					? "run-failed"
					: "run-completed",
		);
	}

	private emit(event: string) {
		this.#lastEvent = event;
		this.#storeVersion += 1;
		this.#snapshot = this.buildSnapshot();
		for (const listener of this.#listeners) {
			listener();
		}
	}

	private getPathIds(messageId: string) {
		const ids: string[] = [];
		let currentId: string | null = messageId;

		while (currentId) {
			if (!this.#messagesById.has(currentId)) {
				break;
			}
			ids.unshift(currentId);
			currentId = this.#parentById.get(currentId) ?? null;
		}

		return ids;
	}

	private getActiveRunRecords() {
		return Array.from(this.#runsById.values()).filter(
			(run) => run.state === "active",
		);
	}

	getRun(runId: string) {
		const run = this.#runsById.get(runId);
		return run ? this.toRunSnapshot(run) : undefined;
	}

	getRunForMessage(messageId: string) {
		const runs = Array.from(this.#runsById.values()).reverse();
		const run =
			runs.find(
				(candidate) => candidate.spec.assistantMessageId === messageId,
			) ??
			runs.find(
				(candidate) =>
					candidate.spec.userMessageId === messageId &&
					candidate.state === "active",
			) ??
			runs.find((candidate) => candidate.spec.userMessageId === messageId);
		return run ? this.toRunSnapshot(run) : undefined;
	}

	private getRunRecord(runId: string) {
		const run = this.#runsById.get(runId);
		if (!run) {
			throw new Error(`Unknown run ${runId}`);
		}
		return run;
	}

	private getSelectedRunRecord() {
		if (!this.#cursorId) {
			return undefined;
		}
		const pathIds = new Set(this.getPathIds(this.#cursorId));
		return Array.from(this.#runsById.values())
			.reverse()
			.find((run) => pathIds.has(run.spec.assistantMessageId));
	}

	private getRunForToolCall(toolCallId: string) {
		const runId = this.#runIdByToolCallId.get(toolCallId);
		if (!runId) {
			throw new Error(`No run owns tool call ${toolCallId}`);
		}
		return this.getRunRecord(runId);
	}

	private getRunForApproval(approvalId: string) {
		const runId = this.#runIdByApprovalId.get(approvalId);
		if (!runId) {
			throw new Error(`No run owns tool approval ${approvalId}`);
		}
		return this.getRunRecord(runId);
	}

	indexMessageOwnership(runId: string, message: TMessage) {
		for (const part of message.parts) {
			if ("toolCallId" in part && typeof part.toolCallId === "string") {
				this.#runIdByToolCallId.set(part.toolCallId, runId);
			}
			if (
				"approval" in part &&
				part.approval &&
				typeof part.approval === "object" &&
				"id" in part.approval &&
				typeof part.approval.id === "string"
			) {
				this.#runIdByApprovalId.set(part.approval.id, runId);
			}
		}
	}

	registerToolCall(runId: string, toolCallId: string) {
		this.#runIdByToolCallId.set(toolCallId, runId);
	}

	private resolveStatus(
		runs: Array<Pick<RunRecord<TMessage>, "error" | "status">>,
		error = runs.find((run) => run.error)?.error,
	): ChatStatus {
		if (error) {
			return "error";
		}
		if (runs.some((run) => run.status === "streaming")) {
			return "streaming";
		}
		if (runs.some((run) => run.status === "submitted")) {
			return "submitted";
		}
		return "ready";
	}

	private startAssistantForUser({
		follow,
		options,
		originCursorId,
		parentMessageId,
		userMessageId,
	}: {
		follow: boolean;
		options?: TreeSendOptions;
		originCursorId: string | null;
		parentMessageId: string | null;
		userMessageId: string;
	}): ThreadRunHandle {
		if (!this.canStartRun(userMessageId)) {
			throw new Error(`Cannot start another run from ${userMessageId}`);
		}

		const assistantMessageId =
			getAssistantMessageIdFromOptions(options) ?? this.generateMessageId();
		const runId = `run:${assistantMessageId}`;
		if (
			this.#runsById.has(runId) ||
			this.#messagesById.has(assistantMessageId)
		) {
			throw new Error(`Assistant message ${assistantMessageId} already exists`);
		}
		const assistantShell = createEmptyAssistantMessage<TMessage>({
			id: assistantMessageId,
		});

		this.upsertMessage(assistantShell, userMessageId, { silent: true });
		if (follow) {
			this.#cursorId = assistantMessageId;
		}

		return this.startRunRequest({
			assistantMessageId,
			follow,
			options,
			originCursorId,
			parentMessageId,
			runId,
			userMessageId,
		});
	}

	private startRunRequest(
		specWithOptions: RunSpec & { options?: TreeSendOptions },
	): ThreadRunHandle {
		const { options, ...spec } = specWithOptions;
		const chat = this.createStreamChat(spec);
		const record: RunRecord<TMessage> = {
			aborted: false,
			chat,
			error: undefined,
			finished: Promise.resolve(),
			spec,
			state: "active",
			status: "submitted",
		};
		this.#runsById.set(spec.runId, record);
		this.emit(`Started ${spec.runId}`);
		this.emitRunEvent(record, "run-started");

		const userMessage = this.#messagesById.get(spec.userMessageId);
		const finished = chat
			.sendMessage(userMessage as CreateUIMessage<TMessage>, {
				...this.withRunRequestBody(spec, options),
			})
			.catch((error: unknown) => {
				this.setRunError(
					spec.runId,
					error instanceof Error ? error : new Error(String(error)),
				);
			})
			.finally(() => this.completeRun(spec.runId));
		record.finished = finished;

		return this.createRunHandle(record);
	}

	private createRunHandle(run: RunRecord<TMessage>): ThreadRunHandle {
		return {
			assistantMessageId: run.spec.assistantMessageId,
			finished: run.finished,
			getSnapshot: () => this.getRun(run.spec.runId),
			id: run.spec.runId,
			stop: () => run.chat.stop(),
		};
	}

	private async resumeRunRequest(
		run: RunRecord<TMessage>,
		options: ChatRequestOptions,
	) {
		run.aborted = false;
		run.error = undefined;
		run.state = "active";
		const finished = run.chat
			.resumeStream(this.withRunRequestBody(run.spec, options))
			.finally(() => this.completeRun(run.spec.runId));
		run.finished = finished;
		this.emit(`Resuming ${run.spec.runId}`);
		await finished;
	}

	private emitRunEvent(
		run: RunRecord<TMessage>,
		type: Extract<ThreadEvent, { run: ThreadRun }>["type"],
	) {
		this.onThreadEvent?.({ run: this.toRunSnapshot(run), type });
	}

	private toRunSnapshot(run: RunRecord<TMessage>): ThreadRun {
		return {
			assistantMessageId: run.spec.assistantMessageId,
			error: run.error,
			follow: run.spec.follow,
			id: run.spec.runId,
			originCursorId: run.spec.originCursorId,
			parentMessageId: run.spec.parentMessageId,
			state: run.state,
			status: run.status,
			userMessageId: run.spec.userMessageId,
		};
	}

	private withRunRequestBody(
		spec: RunSpec,
		options: ChatRequestOptions = {},
	): ChatRequestOptions {
		const treeOptions =
			"tree" in options && options.tree && typeof options.tree === "object"
				? options.tree
				: {};
		return {
			...options,
			body: {
				...options.body,
				tree: {
					...treeOptions,
					assistantMessageId: spec.assistantMessageId,
					cursorId: this.#cursorId,
					originCursorId: spec.originCursorId,
					parentMessageId: spec.parentMessageId,
					pathIds: this.getPathIds(spec.userMessageId),
					runId: spec.runId,
					userMessageId: spec.userMessageId,
				},
			},
		};
	}
}

export function createThreadRuntime<TMessage extends UIMessage = UIMessage>(
	options: ThreadRuntimeOptions<TMessage> = {},
) {
	return new ThreadRuntime(options);
}
