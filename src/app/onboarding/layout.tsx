"use client";

import { usePathname, useRouter } from "next/navigation";

const TOTAL_STEPS = 7;

export default function OnboardingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const stepMatch = pathname.match(/step-(\d+)/);
  const currentStep = stepMatch ? parseInt(stepMatch[1]) : 1;

  return (
    <div className="min-h-screen flex flex-col" style={{ background: "var(--background)" }}>
      {/* Progress Bar */}
      <div className="px-6 pt-6 pb-2">
        <div className="flex items-center gap-2">
          {Array.from({ length: TOTAL_STEPS }, (_, i) => (
            <div
              key={i}
              className="h-1.5 rounded-full flex-1 transition-all duration-300"
              style={{
                background:
                  i < currentStep
                    ? "var(--primary)"
                    : "var(--outline-variant)",
              }}
            />
          ))}
        </div>
        <p
          className="mt-2 text-xs font-medium"
          style={{ color: "var(--on-surface-variant)" }}
        >
          Step {currentStep}/{TOTAL_STEPS}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col">{children}</div>
    </div>
  );
}
