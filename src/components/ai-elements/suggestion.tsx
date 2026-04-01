"use client";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { type ComponentProps } from "react";

export type SuggestionsProps = ComponentProps<"div">;

export const Suggestions = ({ className, children, ...props }: SuggestionsProps) => (
  <div
    className={cn("flex flex-wrap gap-2", className)}
    {...props}
  >
    {children}
  </div>
);

export type SuggestionProps = Omit<ComponentProps<typeof Button>, 'onClick'> & {
  suggestion: string;
  onClick?: (suggestion: string) => void;
};

export const Suggestion = ({
  suggestion,
  onClick,
  className,
  children,
  ...props
}: SuggestionProps) => (
  <Button
    className={cn(
      "rounded-full px-4 py-2 text-sm font-medium transition-all hover:scale-[1.02] active:scale-[0.98]",
      className
    )}
    onClick={() => onClick?.(suggestion)}
    type="button"
    variant="outline"
    {...props}
  >
    {children ?? suggestion}
  </Button>
);
