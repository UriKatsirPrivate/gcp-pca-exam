"use client";

import { useFormStatus } from "react-dom";
import { CalendarClock } from "lucide-react";
import { Button } from "@/components/ui";
import { generatePlan } from "./actions";

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return (
    <Button type="submit" disabled={pending} className="sm:self-end">
      <CalendarClock className="h-4 w-4" />
      {pending ? "Generating…" : label}
    </Button>
  );
}

export function StudyPlanControls({
  weeks = 6,
  hoursPerWeek = 6,
  label = "Generate plan",
}: {
  weeks?: number;
  hoursPerWeek?: number;
  label?: string;
}) {
  return (
    <form
      action={generatePlan}
      className="flex flex-col gap-4 sm:flex-row sm:items-end"
    >
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">Weeks until exam</span>
        <input
          type="number"
          name="weeks"
          min={1}
          max={16}
          defaultValue={weeks}
          className="h-10 w-32 rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        <span className="font-medium text-muted">Hours per week</span>
        <input
          type="number"
          name="hoursPerWeek"
          min={1}
          max={40}
          defaultValue={hoursPerWeek}
          className="h-10 w-32 rounded-lg border border-line bg-surface px-3 text-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-brand-500"
        />
      </label>
      <SubmitButton label={label} />
    </form>
  );
}
