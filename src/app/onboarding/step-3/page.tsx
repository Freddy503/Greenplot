"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export default function Step3() {
  const router = useRouter();
  const [nickname, setNickname] = useState("");
  const [city, setCity] = useState("");

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
        <h1
          className="text-xl font-bold mb-1"
          style={{ color: "var(--on-surface)" }}
        >
          Tell us about your roots
        </h1>
        <p
          className="text-sm"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Every garden needs a keeper. Choose a name that reflects your digital presence.
        </p>
      </div>

      {/* Photo Upload */}
      <div className="flex justify-center mb-8">
        <div
          className="w-24 h-24 rounded-full flex items-center justify-center cursor-pointer"
          style={{
            background: "var(--surface-container-high)",
            border: "2px dashed var(--outline-variant)",
          }}
        >
          <span
            className="material-symbols-outlined text-3xl"
            style={{ color: "var(--on-surface-variant)" }}
          >
            photo_camera
          </span>
        </div>
      </div>

      {/* Nickname Input */}
      <div className="mb-4">
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Nickname
        </label>
        <div className="relative">
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg"
            style={{ color: "var(--on-surface-variant)" }}
          >
            face
          </span>
          <input
            type="text"
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
            placeholder="Your garden name..."
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none"
            style={{
              background: "var(--surface-container)",
              border: "1px solid var(--outline-variant)",
              color: "var(--on-surface)",
            }}
          />
        </div>
      </div>

      {/* City Input */}
      <div className="mb-8">
        <label
          className="block text-xs font-medium mb-2"
          style={{ color: "var(--on-surface-variant)" }}
        >
          City (Optional)
        </label>
        <div className="relative">
          <span
            className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-lg"
            style={{ color: "var(--on-surface-variant)" }}
          >
            location_on
          </span>
          <input
            type="text"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Where are you based?"
            className="w-full pl-10 pr-4 py-3 rounded-xl text-sm outline-none"
            style={{
              background: "var(--surface-container)",
              border: "1px solid var(--outline-variant)",
              color: "var(--on-surface)",
            }}
          />
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => router.push("/onboarding/step-4")}
        className="w-full py-3.5 rounded-2xl font-semibold text-base flex items-center justify-center gap-2 transition-opacity hover:opacity-90"
        style={{
          background: "var(--primary)",
          color: "var(--on-primary)",
        }}
      >
        Next
        <span className="material-symbols-outlined text-lg">arrow_forward</span>
      </button>

      {/* Footer */}
      <p
        className="mt-4 text-sm text-center cursor-pointer hover:underline"
        style={{ color: "var(--on-surface-variant)" }}
      >
        Already have an account?{" "}
        <span style={{ color: "var(--primary)" }}>Log in</span>
      </p>
    </div>
  );
}
