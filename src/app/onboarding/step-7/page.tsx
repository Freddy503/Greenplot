"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Step7() {
  const router = useRouter();
  const [contribute, setContribute] = useState<boolean | null>(null);

  return (
    <div className="flex-1 flex flex-col px-6 pb-8">
      {/* Header */}
      <div className="mb-6">
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

        <h1
          className="text-xl font-bold mb-1"
          style={{ color: "var(--on-surface)" }}
        >
          Help make Seedify smarter?
        </h1>
        <p
          className="text-sm leading-relaxed"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Your feedback (thumbs up/down) can be used to improve the system for everyone.
        </p>
      </div>

      <div className="flex-1">
        {/* Feedback Toggle */}
        <div className="flex gap-3 mb-6">
          <button
            onClick={() => setContribute(true)}
            className="flex-1 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all"
            style={{
              background:
                contribute === true
                  ? "var(--surface-container-highest)"
                  : "var(--surface-container)",
              border:
                contribute === true
                  ? "2px solid var(--primary)"
                  : "1px solid var(--outline-variant)",
            }}
          >
            <span
              className="material-symbols-outlined text-3xl"
              style={{ color: contribute === true ? "var(--primary)" : "var(--on-surface-variant)" }}
            >
              thumb_up
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--on-surface)" }}
            >
              Yes, I&apos;ll contribute
            </span>
          </button>

          <button
            onClick={() => setContribute(false)}
            className="flex-1 rounded-2xl p-4 flex flex-col items-center gap-2 transition-all"
            style={{
              background:
                contribute === false
                  ? "var(--surface-container-highest)"
                  : "var(--surface-container)",
              border:
                contribute === false
                  ? "2px solid var(--primary)"
                  : "1px solid var(--outline-variant)",
            }}
          >
            <span
              className="material-symbols-outlined text-3xl"
              style={{ color: contribute === false ? "var(--primary)" : "var(--on-surface-variant)" }}
            >
              thumb_down
            </span>
            <span
              className="text-xs font-medium"
              style={{ color: "var(--on-surface)" }}
            >
              Not right now
            </span>
          </button>
        </div>

        {/* Collaborative Intelligence */}
        <div
          className="rounded-2xl p-4 mb-4"
          style={{
            background: "var(--surface-container)",
            border: "1px solid var(--outline-variant)",
          }}
        >
          <div className="flex items-center gap-2 mb-2">
            <span
              className="material-symbols-outlined text-sm"
              style={{ color: "var(--primary)" }}
            >
              auto_awesome
            </span>
            <span className="text-xs font-medium" style={{ color: "var(--on-surface)" }}>
              Collaborative Intelligence
            </span>
          </div>
          <p
            className="text-xs leading-relaxed mb-3"
            style={{ color: "var(--on-surface-variant)" }}
          >
            Yes, contribute feedback to help our models understand context-specific nuance.
          </p>

          {/* Privacy Notice */}
          <div
            className="rounded-xl p-3 flex items-start gap-2"
            style={{
              background: "rgba(248, 160, 16, 0.1)",
              border: "1px solid rgba(248, 160, 16, 0.3)",
            }}
          >
            <span
              className="material-symbols-outlined text-sm mt-0.5"
              style={{ color: "var(--secondary)" }}
            >
              warning
            </span>
            <div>
              <p className="text-xs font-medium mb-1" style={{ color: "var(--secondary)" }}>
                Privacy Notice
              </p>
              <p className="text-xs leading-relaxed" style={{ color: "var(--on-surface-variant)" }}>
                Data may not be anonymized before processing. Don&apos;t input any sensitive information.
                Share insights about your productivity, not personal data.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/chat")}
        className="w-full py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
        style={{
          background: "var(--primary)",
          color: "var(--on-primary)",
        }}
      >
        Next
        <span className="material-symbols-outlined text-lg">arrow_forward</span>
      </button>

      <button
        onClick={() => router.push("/chat")}
        className="w-full py-3 rounded-2xl text-sm font-medium mt-2"
        style={{
          color: "var(--on-surface-variant)",
          background: "transparent",
        }}
      >
        I&apos;ll decide later
      </button>
    </div>
  );
}
