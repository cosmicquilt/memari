-- Defaults for new journals, chosen on the account page (2026-10-08).
--
-- Additive: one nullable column, nothing existing touched. Null means "the
-- app's own defaults", which is what everyone has had until now.
ALTER TABLE "OwnerSettings" ADD COLUMN "preferences" JSONB;
