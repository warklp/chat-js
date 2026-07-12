"use client";

import { CopyIcon, DownloadIcon, XIcon } from "lucide-react";
import { type MouseEvent, useEffect, useRef, useState } from "react";

interface ImageModalProps {
  imageName?: string;
  imageUrl: string;
  isOpen: boolean;
  onClose: () => void;
  showActions?: boolean;
}

async function copyImage(imageUrl: string): Promise<void> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch image");
  }
  const blob = await response.blob();
  await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]);
}

async function downloadImage(imageUrl: string): Promise<void> {
  const response = await fetch(imageUrl);
  if (!response.ok) {
    throw new Error("Failed to fetch image");
  }
  const blob = await response.blob();
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = `image-${Date.now()}.png`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(objectUrl);
}

function getCopyLabel(status: "copied" | "error" | "idle"): string {
  if (status === "copied") {
    return "Image copied";
  }
  if (status === "error") {
    return "Image copy failed";
  }
  return "Copy image";
}

export function ImageActions({
  className,
  imageUrl,
}: {
  className?: string;
  imageUrl: string;
}) {
  const [copyStatus, setCopyStatus] = useState<"copied" | "error" | "idle">(
    "idle"
  );
  const [downloadFailed, setDownloadFailed] = useState(false);

  const handleCopy = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      await copyImage(imageUrl);
      setCopyStatus("copied");
    } catch {
      setCopyStatus("error");
    }
  };

  const handleDownload = async (event: MouseEvent<HTMLButtonElement>) => {
    event.stopPropagation();
    try {
      setDownloadFailed(false);
      await downloadImage(imageUrl);
    } catch {
      setDownloadFailed(true);
    }
  };

  const actionClassName =
    "inline-flex size-8 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white";

  return (
    <div
      className={["flex items-center gap-1", className]
        .filter(Boolean)
        .join(" ")}
    >
      <button
        className={actionClassName}
        onClick={handleCopy}
        title={copyStatus === "copied" ? "Copied" : "Copy image"}
        type="button"
      >
        <CopyIcon aria-hidden="true" size={16} />
        <span aria-live="polite" className="sr-only">
          {getCopyLabel(copyStatus)}
        </span>
      </button>
      <button
        className={actionClassName}
        onClick={handleDownload}
        title={downloadFailed ? "Download failed" : "Download image"}
        type="button"
      >
        <DownloadIcon aria-hidden="true" size={16} />
        <span aria-live="polite" className="sr-only">
          {downloadFailed ? "Image download failed" : "Download image"}
        </span>
      </button>
    </div>
  );
}

export function ImageModal({
  isOpen,
  onClose,
  imageUrl,
  imageName,
  showActions = true,
}: ImageModalProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || dialog.open === isOpen) {
      return;
    }
    if (isOpen) {
      dialog.showModal();
    } else {
      dialog.close();
    }
  }, [isOpen]);

  return (
    <dialog
      aria-label={imageName ?? "Image preview"}
      className="fixed inset-0 m-0 h-dvh max-h-none w-screen max-w-none border-0 bg-transparent p-0 backdrop:bg-black/70"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
      ref={dialogRef}
    >
      <div className="relative flex h-full w-full items-center justify-center bg-black/30 p-6">
        <button
          aria-label="Close image preview"
          className="absolute inset-0 cursor-default"
          onClick={onClose}
          type="button"
        />
        <button
          aria-label="Close"
          className="absolute top-4 left-4 z-10 inline-flex size-9 items-center justify-center rounded-md bg-black/60 text-white transition-colors hover:bg-black/80 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          onClick={onClose}
          type="button"
        >
          <XIcon aria-hidden="true" size={20} />
        </button>
        {showActions && (
          <ImageActions
            className="absolute top-4 right-4 z-10"
            imageUrl={imageUrl}
          />
        )}
        {/* biome-ignore lint/performance/noImgElement: Dynamic external images are not compatible with a reusable Next Image configuration. */}
        <img
          alt={imageName ?? "Expanded image"}
          className="relative z-10 max-h-[90vh] max-w-[90vw] object-contain"
          height={900}
          src={imageUrl}
          width={1600}
        />
      </div>
    </dialog>
  );
}
