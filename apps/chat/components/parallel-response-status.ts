export type ParallelResponseLifecycle = "queued" | "generating" | "complete";

interface ParallelResponseStatusMessage {
  metadata: {
    activeStreamId: string | null;
  };
}

export function getParallelResponseLifecycle(
  message: ParallelResponseStatusMessage | null
): ParallelResponseLifecycle {
  if (!message || message.metadata.activeStreamId?.startsWith("pending:")) {
    return "queued";
  }
  if (message.metadata.activeStreamId !== null) {
    return "generating";
  }
  return "complete";
}

export function getStatusLabel(
  isSelected: boolean,
  lifecycle: ParallelResponseLifecycle
): string {
  if (lifecycle !== "complete") {
    return "Generating...";
  }
  return isSelected ? "Selected" : "Task completed";
}
