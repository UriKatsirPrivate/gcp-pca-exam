-- In-progress exam autosave: selections/flags/timing persisted server-side so a
-- reload or crash mid-exam restores state. Cleared (ignored) once submitted.
ALTER TABLE "ExamRun" ADD COLUMN "draft" JSONB;
