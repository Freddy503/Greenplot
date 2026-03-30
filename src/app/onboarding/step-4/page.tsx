"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const interests = [
  { icon: "rocket_launch", label: "Technology" },
  { icon: "trending_up", label: "Business Trends" },
  { icon: "lightbulb", label: "Entrepreneurship" },
  { icon: "memory", label: "Memory" },
  { icon: "palette", label: "Design" },
  { icon: "bolt", label: "Productivity" },
  { icon: "menu_book", label: "Learning" },
  { icon: "auto_awesome", label: "Creativity" },
];

export default function Step4() {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>([]);

  const toggle = (label: string) => {
    setSelected((prev) =>
      prev.includes(label) ? prev.filter((l) => l !== label) : [...prev, label]
    );
  };

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
          Cultivating Interests
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--on-surface-variant)" }}
        >
          What seeds should we plant? Select topics that excite you to curate your digital garden.
        </p>
      </div>

      {/* Interest Grid */}
      <div className="flex-1">
        <div className="grid grid-cols-2 gap-3">
          {interests.map((item) => {
            const isSelected = selected.includes(item.label);
            return (
              <button
                key={item.label}
                onClick={() => toggle(item.label)}
                className="rounded-2xl p-4 text-left transition-all"
                style={{
                  background: isSelected
                    ? "var(--surface-container-highest)"
                    : "var(--surface-container)",
                  border: isSelected
                    ? "2px solid var(--primary)"
                    : "1px solid var(--outline-variant)",
                }}
              >
                <span
                  className="material-symbols-outlined text-2xl mb-2 block"
                  style={{ color: isSelected ? "var(--primary)" : "var(--on-surface-variant)" }}
                >
                  {item.icon}
                </span>
                <span
                  className="text-sm font-medium block"
                  style={{ color: "var(--on-surface)" }}
                >
                  {item.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Add custom interest */}
        <button
          className="w-full mt-3 rounded-2xl p-4 flex items-center gap-3"
          style={{
            background: "var(--surface-container)",
            border: "1px dashed var(--outline-variant)",
          }}
        >
          <span
            className="material-symbols-outlined text-xl"
            style={{ color: "var(--on-surface-variant)" }}
          >
            add_circle
          </span>
          <span className="text-sm" style={{ color: "var(--on-surface-variant)" }}>
            Add custom interest
          </span>
        </button>
      </div>

      {/* Navigation */}
      <div className="flex gap-3 mt-4">
        <button
          onClick={() => router.push("/onboarding/step-3")}
          className="flex-1 py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{
            background: "var(--surface-container)",
            border: "1px solid var(--outline-variant)",
            color: "var(--on-surface)",
          }}
        >
          <span className="material-symbols-outlined text-lg">arrow_back</span>
          Back
        </button>
        <button
          onClick={() => router.push("/onboarding/step-5")}
          className="flex-1 py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
          style={{
            background: "var(--primary)",
            color: "var(--on-primary)",
          }}
        >
          Continue
          <span className="material-symbols-outlined text-lg">arrow_forward</span>
        </button>
      </div>
    </div>
  );
}
