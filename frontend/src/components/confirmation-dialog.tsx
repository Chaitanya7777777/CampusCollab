"use client";
import * as Dialog from "@radix-ui/react-dialog";
import type { ReactNode } from "react";
export function ConfirmationDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel,
  onConfirm,
  pending,
  error,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: ReactNode;
  confirmLabel: string;
  onConfirm: () => void;
  pending: boolean;
  error?: string;
}) {
  return (
    <Dialog.Root
      open={open}
      onOpenChange={(value) => {
        if (!pending) onOpenChange(value);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="dialog-overlay confirm-overlay" />
        <Dialog.Content className="dialog-content feedback-dialog confirm-dialog">
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description asChild>
            <div className="body-copy">{description}</div>
          </Dialog.Description>
          {error && (
            <p className="error-banner" role="alert">
              {error}
            </p>
          )}
          <div className="form-actions">
            <Dialog.Close className="button secondary" disabled={pending}>
              Cancel
            </Dialog.Close>
            <button className="button" disabled={pending} onClick={onConfirm}>
              {pending ? "Saving…" : confirmLabel}
            </button>
          </div>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
