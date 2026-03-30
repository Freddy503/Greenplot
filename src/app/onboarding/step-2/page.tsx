"use client";

import { useRouter } from "next/navigation";

export default function Step2() {
  const router = useRouter();

  const features = [
    {
      icon: "hub",
      title: "Hybrid Vector Search",
      subtitle: "Powered by knowledge graphs",
      description:
        "Map the conceptual relationships between every seed you plant.",
    },
    {
      icon: "humidity_high",
      title: "Web Enrichment",
      subtitle: "Importing Outside Nutrients",
      description:
        "Leverage LLM models and high-fidelity image generation to expand your research.",
    },
    {
      icon: "favorite",
      title: "Heartbeat",
      subtitle: "The Daily Garden Pulse",
      description:
        "Morning Spark prompts and Daily Briefings ensure you never lose track of evolving thoughts.",
    },
  ];

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
          <span
            className="text-xs font-medium"
            style={{ color: "var(--on-surface-variant)" }}
          >
            Seedify
          </span>
        </div>
        <h1
          className="text-xl font-bold mb-1"
          style={{ color: "var(--on-surface)" }}
        >
          The Living Intelligence Experience
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Discover how your digital greenhouse breathes, learns, and connects.
        </p>
      </div>

      {/* Features */}
      <div className="flex-1 space-y-4">
        {features.map((f, i) => (
          <div
            key={i}
            className="rounded-2xl p-5"
            style={{
              background: "var(--surface-container)",
              border: "1px solid var(--outline-variant)",
            }}
          >
            <div className="flex items-start gap-3">
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-container-highest)" }}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ color: "var(--primary)" }}
                >
                  {f.icon}
                </span>
              </div>
              <div>
                <h3
                  className="font-semibold text-sm"
                  style={{ color: "var(--on-surface)" }}
                >
                  {f.title}
                </h3>
                <p
                  className="text-xs font-medium mb-1"
                  style={{ color: "var(--primary-dim)" }}
                >
                  {f.subtitle}
                </p>
                <p
                  className="text-xs leading-relaxed"
                  style={{ color: "var(--on-surface-variant)" }}
                >
                  {f.description}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Heartbeat Details */}
      <div
        className="rounded-2xl p-4 mt-4 mb-4"
        style={{
          background: "var(--surface-container)",
          border: "1px solid var(--outline-variant)",
        }}
      >
        <div className="flex items-center gap-2 mb-3">
          <span
            className="material-symbols-outlined text-sm"
            style={{ color: "var(--secondary)" }}
          >
            circle
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            Morning Spark: 08:00
          </span>
        </div>
        <div className="flex items-center gap-2 mb-3">
          <span
            className="material-symbols-outlined text-sm"
            style={{ color: "var(--secondary)" }}
          >
            circle
          </span>
          <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
            Daily Briefing: 20:00
          </span>
        </div>
        <p
          className="text-xs leading-relaxed"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Seeds are automatically synced between memory — both you and the system can connect the dots. No manual saving required.
        </p>
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/onboarding/step-3")}
        className="w-full py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
        style={{
          background: "var(--primary)",
          color: "var(--on-primary)",
        }}
      >
        Got it
        <span className="material-symbols-outlined text-lg">arrow_forward</span>
      </button>

      <p
        className="text-xs text-center mt-3"
        style={{ color: "var(--on-surface-variant)" }}
      >
        Final step: Initializing the Greenhouse
      </p>
    </div>
  );
}
