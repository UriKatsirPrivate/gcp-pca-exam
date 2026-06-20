-- Geo statistics: capture each user's browser-reported country + timezone.
-- Additive and nullable, so existing rows are unaffected.
ALTER TABLE "User" ADD COLUMN "country" TEXT;
ALTER TABLE "User" ADD COLUMN "timezone" TEXT;
