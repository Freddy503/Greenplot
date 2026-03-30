"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const frequencies = [
  {
    icon: "schedule",
    label: "Twice a day",
    sub: "Morning & Evening",
    value: "twice",
  },
  {
    icon: "wb_sunny",
    label: "Once a day",
    sub: "Standard growth pattern",
    value: "daily",
  },
  {
    icon: "date_range",
    label: "Bi-Weekly",
    sub: "Mid-week and weekend updates",
    value: "biweekly",
  },
  {
    icon: "calendar_view_week",
    label: "Weekly",
    sub: "Batch collection every Sunday",
    value: "weekly",
  },
];

export default function Step5() {
  const router = useRouter();
  const [selected, setSelected] = useState("twice");

  return (
    <div className="flex-1 flex flex-col px-6 pb-8">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-2 mb-3">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary)" }}
          >
            potted_plant
          </span>
          <span className="text-xs font-medium" style={{ color: "var(--on-surface-variant)" }}>
            Seedify
          </span>
        </div>
        <div className="flex items-center gap-2 mb-1">
          <span
            className="material-symbols-outlined"
            style={{ color: "var(--primary)" }}
          >
            energy_savings_leaf
          </span>
          <h1
            className="text-lg font-bold"
            style={{ color: "var(--on-surface)" }}
          >
            Nurture Focus
          </h1>
        </div>
        <p
          className="text-sm mt-2"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Choose your harvest frequency
        </p>
        <p
          className="text-xs mt-1"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Adjust how often you want to collect your yields. Our smart soil sensors will monitor growth in the background.
        </p>
      </div>

      {/* Frequency Options */}
      <div className="flex-1 space-y-3">
        {frequencies.map((freq) => {
          const isSelected = selected === freq.value;
          return (
            <button
              key={freq.value}
              onClick={() => setSelected(freq.value)}
              className="w-full rounded-2xl p-4 text-left flex items-center gap-3 transition-all"
              style={{
                background: isSelected
                  ? "var(--surface-container-highest)"
                  : "var(--surface-container)",
                border: isSelected
                  ? "2px solid var(--primary)"
                  : "1px solid var(--outline-variant)",
              }}
            >
              <div
                className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0"
                style={{ background: "var(--surface-container-highest)" }}
              >
                <span
                  className="material-symbols-outlined text-xl"
                  style={{ color: isSelected ? "var(--primary)" : "var(--on-surface-variant)" }}
                >
                  {freq.icon}
                </span>
              </div>
              <div>
                <p
                  className="font-semibold text-sm"
                  style={{ color: "var(--on-surface)" }}
                >
                  {freq.label}
                </p>
                <p
                  className="text-xs"
                  style={{ color: "var(--on-surface-variant)" }}
                >
                  {freq.sub}
                </p>
              </div>
            </button>
          );
        })}

        {/* Smart Scheduling */}
        <div
          className="rounded-2xl p-4"
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
              Based on Calendar — Smart Scheduling
            </span>
          </div>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="material-symbols-outlined text-sm"
                style={{ color: "var(--on-surface-variant)" }}
              >
                access_time
              </span>
              <span className="text-xs" style={{ color: "var(--on-surface-variant)" }}>
                Time: 09:00
              </span>
            </div>
            <span
              className="text-xs cursor-pointer hover:underline"
              style={{ color: "var(--primary)" }}
            >
              Edit
            </span>
          </div>
          <p
            className="text-xs mt-2"
            style={{ color: "var(--on-surface-variant)" }}
          >
            Local time based on your current region.
          </p>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/onboarding/step-6")}
        className="w-full py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90 mt-4"
        style={{
          background: "var(--primary)",
          color: "var(--on-primary)",
        }}
      >
        Next
        <span className="material-symbols-outlined text-lg">arrow_forward</span>
      </button>

      <p
        className="text-xs text-center mt-3"
        style={{ color: "var(--on-surface-variant)" }}
      >
        You can change these settings later in Profile &gt; Vault
      </p>
    </div>
  );
}
