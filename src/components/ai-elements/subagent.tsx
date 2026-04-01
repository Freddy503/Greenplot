"use client";

import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import {
  BotIcon,
  CompassIcon,
  LightbulbIcon,
  LinkIcon,
  SearchIcon,
  CheckCircleIcon,
  ClockIcon,
  XCircleIcon,
} from "lucide-react";
import type { ReactNode } from "react";

// ── Types ────────────────────────────────────────────────────────────────────

export interface SubagentData {
  agent_id?: string;
  name?: string;
  subagent_type?: string;
  status?: string; // "running" | "completed" | "failed"
  message?: string;
  description?: string;
}

// ── Type Config ──────────────────────────────────────────────────────────────

const typeConfig: Record<
  string,
  { icon: ReactNode; color: string; label: string }
> = {
  Explore: {
    icon: <CompassIcon className="size-3.5" />,
    color: "bg-blue-500/10 text-blue-600 border-blue-200",
    label: "Explore",
  },
  Synthesis: {
    icon: <LightbulbIcon className="size-3.5" />,
    color: "bg-purple-500/10 text-purple-600 border-purple-200",
    label: "Synthesis",
  },
  Research: {
    icon: <SearchIcon className="size-3.5" />,
    color: "bg-green-500/10 text-green-600 border-green-200",
    label: "Research",
  },
  Connection: {
    icon: <LinkIcon className="size-3.5" />,
    color: "bg-orange-500/10 text-orange-600 border-orange-200",
    label: "Connection",
  },
};

const statusConfig: Record<
  string,
  { icon: ReactNode; color: string; label: string }
> = {
  running: {
    icon: <ClockIcon className="size-3.5 animate-pulse" />,
    color: "bg-yellow-500/10 text-yellow-700",
    label: "Running",
  },
  completed: {
    icon: <CheckCircleIcon className="size-3.5" />,
    color: "bg-green-500/10 text-green-700",
    label: "Completed",
  },
  failed: {
    icon: <XCircleIcon className="size-3.5" />,
    color: "bg-red-500/10 text-red-700",
    label: "Failed",
  },
};

// ── Component ────────────────────────────────────────────────────────────────

export interface SubagentStatusProps {
  data: SubagentData;
  className?: string;
}

export const SubagentStatus = ({ data, className }: SubagentStatusProps) => {
  const type = typeConfig[data.subagent_type || ""] || {
    icon: <BotIcon className="size-3.5" />,
    color: "bg-muted text-muted-foreground",
    label: data.subagent_type || "Agent",
  };

  const status = statusConfig[data.status || "running"] || statusConfig.running;

  return (
    <div
      className={cn(
        "flex items-center gap-2 p-2.5 rounded-md border",
        "bg-gradient-to-r from-background to-muted/30",
        className
      )}
    >
      <div className="flex items-center gap-1.5">
        <BotIcon className="size-4 text-muted-foreground" />
        <span className="text-sm font-medium">Sub-Agent</span>
      </div>

      <Badge
        variant="outline"
        className={cn("gap-1 text-xs font-normal", type.color)}
      >
        {type.icon}
        {type.label}
      </Badge>

      <Badge
        variant="secondary"
        className={cn("gap-1 text-xs", status.color)}
      >
        {status.icon}
        {status.label}
      </Badge>

      {data.agent_id && (
        <span className="text-xs text-muted-foreground ml-auto font-mono">
          #{data.agent_id}
        </span>
      )}
    </div>
  );
};
