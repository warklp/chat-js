"use client";

import { type UseChatHelpers, useChat } from "@ai-sdk/react";
import type { UIMessage } from "ai";
import { useCallback, useRef, useSyncExternalStore } from "react";
import { ThreadRuntime } from "./runtime";
import { ThreadChatFacade } from "./thread-chat-facade";
import type {
	MessageTreeSnapshot,
	ThreadRun,
	ThreadRunHandle,
	ThreadRuntimeOptions,
	ThreadStartRunOptions,
	TreeSendOptions,
} from "./types";

type ThreadHookOptions = {
	experimental_throttle?: number;
	resume?: boolean;
};

type ExternalThreadOptions<TMessage extends UIMessage> = ThreadHookOptions & {
	runtime: ThreadRuntime<TMessage>;
};

export type UseThreadOptions<TMessage extends UIMessage = UIMessage> =
	| ExternalThreadOptions<TMessage>
	| (ThreadHookOptions &
			ThreadRuntimeOptions<TMessage> & {
				runtime?: never;
			});

function hasSuppliedRuntime<TMessage extends UIMessage>(
	options: UseThreadOptions<TMessage>,
): options is ExternalThreadOptions<TMessage> {
	return "runtime" in options && options.runtime !== undefined;
}

export type TreeHelpers<TMessage extends UIMessage = UIMessage> = {
	childrenByParentId: Record<string, string[]>;
	cursorId: string | null;
	getChildren: (messageId: string | null) => TMessage[];
	getLeaves: (messageId?: string | null) => TMessage[];
	getMessage: (messageId: string) => TMessage | undefined;
	getParent: (messageId: string) => TMessage | undefined;
	getPath: (messageId?: string | null) => TMessage[];
	getSiblings: (messageId: string) => TMessage[];
	messagesById: Record<string, TMessage>;
	parentById: Record<string, string | null>;
	rootIds: string[];
	activeRuns: ThreadRun[];
	runs: ThreadRun[];
	status: ReturnType<ThreadRuntime<TMessage>["getSnapshot"]>["treeStatus"];
	getRun: (runId: string) => ThreadRun | undefined;
	getRunForMessage: (messageId: string) => ThreadRun | undefined;
	getSnapshot: () => MessageTreeSnapshot<TMessage>;
	resumeRun: (runId: string, options?: TreeSendOptions) => Promise<void>;
	setCursor: (messageId: string | null) => void;
	setCursorToParentOf: (messageId: string) => void;
	startRun: (
		options?: ThreadStartRunOptions<TMessage>,
	) => Promise<ThreadRunHandle>;
	stopAll: () => Promise<void>;
	stopRun: (runId: string) => Promise<void>;
	stopRunForMessage: (messageId: string) => Promise<void>;
};

export type UseThreadHelpers<TMessage extends UIMessage = UIMessage> =
	UseChatHelpers<TMessage> & {
		lastEvent: string;
		sendMessage: (
			message?: Parameters<UseChatHelpers<TMessage>["sendMessage"]>[0],
			options?: TreeSendOptions,
		) => Promise<void>;
		tree: TreeHelpers<TMessage>;
	};

function useRuntimeSnapshot<TMessage extends UIMessage>(
	runtime: ThreadRuntime<TMessage>,
	throttleWaitMs?: number,
) {
	const subscribe = useCallback(
		(listener: () => void) => {
			if (!throttleWaitMs) {
				return runtime.subscribe(listener);
			}

			let lastCall = 0;
			let timeout: ReturnType<typeof setTimeout> | undefined;
			const notify = () => {
				const elapsed = Date.now() - lastCall;
				if (elapsed >= throttleWaitMs) {
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
				}, throttleWaitMs - elapsed);
			};

			const unsubscribe = runtime.subscribe(notify);
			return () => {
				unsubscribe();
				if (timeout) {
					clearTimeout(timeout);
				}
			};
		},
		[runtime, throttleWaitMs],
	);

	return useSyncExternalStore(
		subscribe,
		runtime.getSnapshot,
		runtime.getSnapshot,
	);
}

export function useThread<TMessage extends UIMessage = UIMessage>(
	options: UseThreadOptions<TMessage> = {},
): UseThreadHelpers<TMessage> {
	const runtimeRef = useRef<ThreadRuntime<TMessage> | null>(null);
	const suppliedRuntime = hasSuppliedRuntime(options)
		? options.runtime
		: undefined;
	const runtimeOptions = hasSuppliedRuntime(options) ? undefined : options;
	if (suppliedRuntime) {
		runtimeRef.current = suppliedRuntime;
	} else if (
		!runtimeRef.current ||
		(runtimeOptions?.id !== undefined &&
			runtimeRef.current.chatId !== runtimeOptions.id)
	) {
		runtimeRef.current = new ThreadRuntime(runtimeOptions);
	}

	const runtime = runtimeRef.current;
	if (runtimeOptions) {
		runtime.updateOptions(runtimeOptions);
	}
	const facadeRef = useRef<{
		facade: ThreadChatFacade<TMessage>;
		runtime: ThreadRuntime<TMessage>;
	} | null>(null);
	if (!facadeRef.current || facadeRef.current.runtime !== runtime) {
		facadeRef.current = {
			facade: new ThreadChatFacade(runtime),
			runtime,
		};
	}
	const chat = useChat({
		chat: facadeRef.current.facade,
		experimental_throttle: options.experimental_throttle,
		resume: options.resume,
	});
	const snapshot = useRuntimeSnapshot(runtime, options.experimental_throttle);
	const treeStatus = useSyncExternalStore(
		runtime.subscribe,
		() => runtime.getSnapshot().treeStatus,
		() => runtime.getSnapshot().treeStatus,
	);

	return {
		...chat,
		lastEvent: snapshot.lastEvent,
		sendMessage: runtime.sendMessage,
		tree: {
			activeRuns: snapshot.activeRuns,
			childrenByParentId: snapshot.childrenByParentId,
			cursorId: snapshot.cursorId,
			getChildren: (messageId) => runtime.getChildren(messageId),
			getLeaves: (messageId) => runtime.getLeaves(messageId),
			getMessage: (messageId) => runtime.getMessage(messageId),
			getParent: (messageId) => runtime.getParent(messageId),
			getPath: (messageId) => runtime.getPath(messageId),
			getRun: (runId) => runtime.getRun(runId),
			getRunForMessage: (messageId) => runtime.getRunForMessage(messageId),
			getSnapshot: () => runtime.getTreeSnapshot(),
			getSiblings: (messageId) => runtime.getSiblings(messageId),
			messagesById: snapshot.messagesById,
			parentById: snapshot.parentById,
			rootIds: snapshot.rootIds,
			runs: snapshot.runs,
			status: treeStatus,
			resumeRun: (runId, requestOptions) =>
				runtime.resumeRun(runId, requestOptions),
			setCursor: (messageId) => runtime.setCursor(messageId),
			setCursorToParentOf: (messageId) =>
				runtime.setCursorToParentOf(messageId),
			startRun: (runOptions) => runtime.startRun(runOptions),
			stopAll: () => runtime.stopAll(),
			stopRun: (runId) => runtime.stopRun(runId),
			stopRunForMessage: (messageId) => runtime.stopRunForMessage(messageId),
		},
	};
}
