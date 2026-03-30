"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Step6() {
  const router = useRouter();
  const [connected, setConnected] = useState(false);

  return (
    <div className="flex-1 flex flex-col px-6 pb-8">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary)" }}
          >
            eco
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--on-surface-variant)" }}>
            Seedify Onboarding
          </span>
        </div>

        {/* Title with icon */}
        <div className="flex items-center gap-2 mb-2">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary)" }}
          >
            bolt
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            psychology
          </span>
        </div>

        <h1
          className="text-xl font-bold mb-1"
          style={{ color: "var(--on-surface)" }}
        >
          Sync your garden rhythm
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Let us know when you&apos;re busy to schedule digests at the right time.
        </p>
      </div>

      {/* Features */}
      <div className="flex-1">
        <div
          className="rounded-2xl p-5 mb-4"
          style={{
            background: "var(--surface-container)",
            border: "1px solid var(--outline-variant)",
          }}
        >
          <div className="flex items-start gap-3 mb-4">
            <span
              className="material-symbols-outlined text-xl mt-0.5"
              style={{ color: "var(--primary)" }}
            >
              update
            </span>
            <div>
              <h3
                className="font-semibold text-sm mb-1"
                style={{ color: "var(--on-surface)" }}
              >
                Intelligent Scheduling
              </h3>
              <p
                className="text-xs leading-relaxed"
                style={{ color: "var(--on-surface-variant)" }}
              >
                We&apos;ll find the quiet moments in your day and deliver insights without distraction.
              </p>
            </div>
          </div>

          {/* Feature checks */}
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-sm"
                style={{ color: "var(--primary)" }}
              >
                check
              </span>
              <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
                Smart timing
              </span>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-sm"
                style={{ color: "var(--primary)" }}
              >
                check
              </span>
              <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
                No interruptions during meetings
              </span>
            </div>
          </div>
        </div>

        {/* Connect Button */}
        <button
          onClick={() => setConnected(!connected)}
          className="w-full rounded-2xl p-4 flex items-center justify-center gap-3 mb-3 transition-all"
          style={{
            background: connected ? "var(--surface-container-highest)" : "var(--surface-container)",
            border: connected
              ? "2px solid var(--primary)"
              : "1px solid var(--outline-variant)",
          }}
        >
          <span
            className="material-symbols-outlined text-xl"
            style={{ color: connected ? "var(--primary)" : "var(--on-surface-variant)" }}
          >
            event_available
          </span>
          <span
            className="text-sm font-semibold"
            style={{ color: connected ? "var(--primary)" : "var(--on-surface)" }}
          >
            {connected ? "Calendar Connected!" : "Connect Google Calendar"}
          </span>
        </button>

        {/* Skip */}
        <button
          onClick={() => router.push("/onboarding/step-7")}
          className="w-full py-3 rounded-2xl text-sm font-medium mb-4"
          style={{
            color: "var(--on-surface-variant)",
            background: "transparent",
            border: "1px solid var(--outline-variant)",
          }}
        >
          Skip for now
        </button>

        {/* Privacy note */}
        <div className="flex items-center justify-center gap-2">
          <span
            className="material-symbols-outlined text-sm"
            style={{ color: "var(--on-surface-variant)" }}
          >
            lock
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            End-to-end encrypted privacy
          </span>
        </div>
      </div>

      {/* CTA */}
      {connected && (
        <button
          onClick={() => router.push("/onboarding/step-7")}
          className="w-full py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 mt-4"
          style={{
            background: "var(--primary)",
            color: "var(--on-primary)",
          }}
        >
          Continue
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
        </button>
      )}
    </div>
  );
}
