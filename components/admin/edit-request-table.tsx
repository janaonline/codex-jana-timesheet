"use client";

import { useState } from "react";

import { Badge } from "@/components/common/badge";
import { Button } from "@/components/common/button";
import { Modal } from "@/components/common/modal";
import { Textarea } from "@/components/common/textarea";
import { useToast } from "@/components/common/toast-provider";
import { formatDisplayDate } from "@/lib/time";

type EditRequestRow = {
  id: string;
  requesterName: string;
  requesterEmail: string;
  monthLabel: string;
  status: string;
  reason: string;
  requestedAt: string;
  timesheetId: string;
};

async function apiAction(url: string, body?: Record<string, unknown>) {
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body ?? {}),
  });
  const payload = (await response.json()) as
    | { ok: true; data: unknown }
    | { ok: false; error: { message: string; details?: string[] } };

  if (!response.ok || !payload.ok) {
    throw new Error(
      !payload.ok && payload.error.details?.length
        ? payload.error.details.join(" ")
        : !payload.ok
          ? payload.error.message
          : "Action failed.",
    );
  }
}

export function EditRequestTable({
  initialRequests,
}: {
  initialRequests: EditRequestRow[];
}) {
  const { pushToast } = useToast();
  const [requests, setRequests] = useState(initialRequests);
  const [rejectingRequestId, setRejectingRequestId] = useState<string | null>(null);
  const [rejectionReason, setRejectionReason] = useState("");

  async function approve(requestId: string) {
    try {
      await apiAction(`/api/v1/edit-requests/${requestId}/approve`);
      setRequests((current) => current.filter((request) => request.id !== requestId));
      pushToast({ title: "Edit request approved.", tone: "success" });
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : "Approval failed.",
        tone: "error",
      });
    }
  }

  async function reject() {
    if (!rejectingRequestId) {
      return;
    }

    try {
      await apiAction(`/api/v1/edit-requests/${rejectingRequestId}/reject`, {
        reason: rejectionReason,
      });
      setRequests((current) =>
        current.filter((request) => request.id !== rejectingRequestId),
      );
      setRejectingRequestId(null);
      setRejectionReason("");
      pushToast({ title: "Edit request rejected.", tone: "success" });
    } catch (error) {
      pushToast({
        title: error instanceof Error ? error.message : "Rejection failed.",
        tone: "error",
      });
    }
  }

  return (
    <>
      <Modal
        open={Boolean(rejectingRequestId)}
        title="Reject edit request"
        onClose={() => setRejectingRequestId(null)}
      >
        <div className="space-y-4">
          <Textarea
            rows={5}
            maxLength={500}
            value={rejectionReason}
            onChange={(event) => setRejectionReason(event.target.value)}
            placeholder="Rejection reason"
          />
          <div className="grid gap-3 sm:flex sm:justify-end">
            <Button className="w-full sm:w-auto" variant="secondary" onClick={() => setRejectingRequestId(null)}>
              Cancel
            </Button>
            <Button
              className="w-full sm:w-auto"
              variant="danger"
              onClick={reject}
              disabled={!rejectionReason.trim()}
            >
              Confirm rejection
            </Button>
          </div>
        </div>
      </Modal>

      <div className="space-y-4">
        {requests.map((request) => (
          <div
            key={request.id}
            className="rounded-[24px] border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="space-y-2">
                <div className="flex items-center gap-3">
                  <h3 className="text-lg font-semibold text-stone-950">
                    {request.requesterName}
                  </h3>
                  <Badge tone={request.status}>{request.status}</Badge>
                </div>
                <p className="text-sm text-stone-600">{request.requesterEmail}</p>
                <p className="text-sm text-stone-600">{request.monthLabel}</p>
                <p className="rounded-2xl bg-stone-50 p-4 text-sm text-stone-700">
                  {request.reason}
                </p>
                <p className="text-xs uppercase tracking-[0.22em] text-stone-500">
                  Requested {formatDisplayDate(request.requestedAt)}
                </p>
              </div>
              <div className="grid w-full gap-3 sm:w-auto sm:grid-cols-2">
                <Button className="w-full" variant="secondary" onClick={() => approve(request.id)}>
                  Approve
                </Button>
                <Button
                  className="w-full"
                  variant="danger"
                  onClick={() => setRejectingRequestId(request.id)}
                >
                  Reject
                </Button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}
