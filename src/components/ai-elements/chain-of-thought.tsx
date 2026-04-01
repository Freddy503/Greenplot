"use client";

import { cn } from "@/lib/utils";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { type LucideIcon, ChevronDownIcon, Loader2Icon } from "lucide-react";
import {
  createContext,
  type ComponentProps,
  useContext,
  useState,
} from "react";

// ── Context ───────────────────────────────────────────

interface ChainOfThoughtContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
}

const ChainOfThoughtContext = createContext<ChainOfThoughtContextValue>({
  open: false,
  setOpen: () => {},
});

const useChainOfThought = () => useContext(ChainOfThoughtContext);

// ── Root ──────────────────────────────────────────────

export type ChainOfThoughtProps = ComponentProps<typeof Collapsible>;

export const ChainOfThought = ({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  className,
  ...props
}: ChainOfThoughtProps & {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}) => {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const open = controlledOpen ?? uncontrolledOpen;
  const setOpen = onOpenChange ?? setUncontrolledOpen;

  return (
    <ChainOfThoughtContext.Provider value={{ open, setOpen }}>
      <Collapsible
        open={open}
        onOpenChange={setOpen}
        className={cn("rounded-lg border", className)}
        style={{
          background: "var(--surface-container)",
          borderColor: "var(--border)",
        }}
        {...props}
      />
    </ChainOfThoughtContext.Provider>
  );
};

// ── Header ────────────────────────────────────────────

export type ChainOfThoughtHeaderProps = ComponentProps<
  typeof CollapsibleTrigger
>;

export const ChainOfThoughtHeader = ({
  className,
  children,
  ...props
}: ChainOfThoughtHeaderProps) => {
  const { open } = useChainOfThought();

  return (
    <CollapsibleTrigger
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-sm font-medium transition-colors hover:bg-white/5",
        className
      )}
      {...props}
    >
      <div className="flex items-center gap-2">
        <Loader2Icon
          className={cn(
            "size-4",
            open ? "animate-spin text-[var(--primary)]" : "text-[var(--muted-foreground)]"
          )}
          style={{ animationDuration: "3s" }}
        />
        {children ?? "Chain of Thought"}
      </div>
      <ChevronDownIcon
        className={cn(
          "size-4 transition-transform duration-200",
          open && "rotate-180"
        )}
        style={{ color: "var(--muted-foreground)" }}
      />
    </CollapsibleTrigger>
  );
};

// ── Content ───────────────────────────────────────────

export type ChainOfThoughtContentProps = ComponentProps<
  typeof CollapsibleContent
>;

export const ChainOfThoughtContent = ({
  className,
  ...props
}: ChainOfThoughtContentProps) => (
  <CollapsibleContent
    className={cn("px-4 pb-4", className)}
    {...props}
  />
);

// ── Step ──────────────────────────────────────────────

export type ChainOfThoughtStepProps = ComponentProps<"div"> & {
  icon?: LucideIcon;
  label: string;
  description?: string;
  status?: "complete" | "active" | "pending";
};

export const ChainOfThoughtStep = ({
  icon: Icon,
  label,
  description,
  status = "complete",
  className,
  ...props
}: ChainOfThoughtStepProps) => (
  <div
    className={cn("flex items-start gap-3 py-2", className)}
    style={{ opacity: status === "pending" ? 0.4 : 1 }}
    {...props}
  >
    <div className="mt-0.5 flex-shrink-0">
      {status === "active" ? (
        <Loader2Icon
          className="size-4 animate-spin"
          style={{ color: "var(--primary)", animationDuration: "2s" }}
        />
      ) : Icon ? (
        <Icon
          className="size-4"
          style={{ color: status === "complete" ? "var(--primary)" : "var(--muted-foreground)" }}
        />
      ) : (
        <div
          className="size-4 rounded-full flex items-center justify-center"
          style={{
            background: status === "complete" ? "var(--primary)" : "var(--muted)",
          }}
        >
          {status === "complete" && (
            <div className="size-1.5 rounded-full bg-white" />
          )}
        </div>
      )}
    </div>
    <div className="flex-1 min-w-0">
      <p className="text-sm font-medium" style={{ color: "var(--on-surface)" }}>
        {label}
      </p>
      {description && (
        <p className="text-xs mt-0.5" style={{ color: "var(--muted-foreground)" }}>
          {description}
        </p>
      )}
    </div>
  </div>
);

// ── Search Results ────────────────────────────────────

export type ChainOfThoughtSearchResultsProps = ComponentProps<"div">;

export const ChainOfThoughtSearchResults = ({
  className,
  ...props
}: ChainOfThoughtSearchResultsProps) => (
  <div
    className={cn("flex flex-wrap gap-1.5 mt-1", className)}
    {...props}
  />
);

export type ChainOfThoughtSearchResultProps = ComponentProps<"span">;

export const ChainOfThoughtSearchResult = ({
  className,
  children,
  ...props
}: ChainOfThoughtSearchResultProps) => (
  <span
    className={cn(
      "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-medium",
      className
    )}
    style={{
      background: "rgba(16,185,129,0.1)",
      color: "var(--primary)",
      border: "1px solid rgba(16,185,129,0.2)",
    }}
    {...props}
  >
    {children}
  </span>
);

// ── Image ─────────────────────────────────────────────

export type ChainOfThoughtImageProps = ComponentProps<"div"> & {
  caption?: string;
};

export const ChainOfThoughtImage = ({
  caption,
  className,
  children,
  ...props
}: ChainOfThoughtImageProps) => (
  <div className={cn("mt-2", className)} {...props}>
    {children}
    {caption && (
      <p className="text-xs mt-1 text-center" style={{ color: "var(--muted-foreground)" }}>
        {caption}
      </p>
    )}
  </div>
);
