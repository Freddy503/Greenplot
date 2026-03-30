"use client";

import { useRouter } from "next/navigation";

export default function Step1() {
  const router = useRouter();

  return (
    <div className="flex-1 flex flex-col items-center justify-center px-6 pb-8 text-center">
      {/* Hero Icon */}
      <div className="mb-6">
        <span
          className="material-symbols-outlined filled text-6xl"
          style={{ color: "var(--primary)" }}
        >
          psychology
        </span>
      </div>

      {/* Title */}
      <h1
        className="text-2xl font-bold mb-2"
        style={{ color: "var(--on-surface)" }}
      >
        Welcome to your
      </h1>
      <h1
        className="text-3xl font-extrabold mb-6"
        style={{ color: "var(--primary)" }}
      >
        Creativity Brain
      </h1>

      {/* Subtitle */}
      <p
        className="text-sm max-w-xs mb-10"
        style={{ color: "var(--on-surface-variant)" }}
      >
        Your personal, self-improving system for creative thinking.
      </p>

      {/* Stats Row */}
      <div className="flex gap-6 mb-10">
        <div className="flex flex-col items-center">
          <span
            className="material-symbols-outlined text-xl mb-1"
            style={{ color: "var(--primary)" }}
          >
            eco
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            Growth
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span
            className="material-symbols-outlined text-xl mb-1"
            style={{ color: "var(--primary)" }}
          >
            bolt
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            Active
          </span>
        </div>
        <div className="flex flex-col items-center">
          <span
            className="material-symbols-outlined text-xl mb-1"
            style={{ color: "var(--primary)" }}
          >
            sync
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            Synced
          </span>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/onboarding/step-2")}
        className="w-full max-w-xs py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
        style={{
          background: "var(--primary)",
          color: "var(--on-primary)",
        }}
      >
        Get Started
        <span className="material-symbols-outlined text-lg">arrow_forward</span>
      </button>

      {/* Footer Link */}
      <p
        className="mt-4 text-sm cursor-pointer hover:underline"
        style={{ color: "var(--on-surface-variant)" }}
      >
        Already a grower?{" "}
        <span style={{ color: "var(--primary)" }}>Sign In</span>
      </p>

      {/* Bottom Badge */}
      <div className="mt-10 flex items-center gap-1">
        <span
          className="material-symbols-outlined text-sm"
          style={{ color: "var(--on-surface-variant)" }}
        >
          info
        </span>
        <span
          className="text-xs"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Step 1/7 • Secure encrypted neural architecture
        </span>
      </div>
    </div>
  );
}
