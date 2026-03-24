"use client";

import { useState } from "react";

import { Button } from "@/components/common/button";
import { Modal } from "@/components/common/modal";
import { Textarea } from "@/components/common/textarea";

export function RequestEditModal({
  open,
  onClose,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (reason: string) => Promise<void>;
}) {
  const [reason, setReason] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await onSubmit(reason);
      setReason("");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <Modal open={open} title="Request edit / unfreeze" onClose={onClose}>
      <div className="space-y-4">
        <p className="text-sm text-stone-600">
          This workflow reopens the previous month&apos;s timesheet for up to 3 working
          days after approval. Please explain why the sheet needs to be unlocked.
        </p>
        <Textarea
          rows={6}
          maxLength={500}
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Reason for reopening the timesheet"
        />
        <div className="flex items-center justify-between">
          <p className="text-xs text-stone-500">{reason.length}/500 characters</p>
          <div className="grid gap-3 sm:flex">
            <Button className="w-full sm:w-auto" variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              onClick={handleSubmit}
              disabled={submitting || !reason.trim()}
            >
              {submitting ? "Submitting..." : "Submit request"}
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}
