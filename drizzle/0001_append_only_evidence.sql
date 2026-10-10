-- Evidence is append-only. These triggers make UPDATE, DELETE and TRUNCATE on
-- ledger rows and stored evidence files fail at the database level.
--
-- The single way past them is the demo reset, which sets the transaction-local
-- flag `proofshield.allow_evidence_delete` before deleting whole orders.
-- Updates are never allowed, with or without the flag.

CREATE OR REPLACE FUNCTION ps_protect_evidence() RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE'
     AND current_setting('proofshield.allow_evidence_delete', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'ProofShield evidence is append-only: % on % is not allowed', TG_OP, TG_TABLE_NAME
    USING ERRCODE = '23001';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE OR REPLACE FUNCTION ps_protect_evidence_truncate() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'ProofShield evidence is append-only: TRUNCATE on % is not allowed', TG_TABLE_NAME
    USING ERRCODE = '23001';
END;
$$ LANGUAGE plpgsql;
--> statement-breakpoint
CREATE TRIGGER ledger_events_append_only
  BEFORE UPDATE OR DELETE ON "ledger_events"
  FOR EACH ROW EXECUTE FUNCTION ps_protect_evidence();
--> statement-breakpoint
CREATE TRIGGER ledger_events_no_truncate
  BEFORE TRUNCATE ON "ledger_events"
  FOR EACH STATEMENT EXECUTE FUNCTION ps_protect_evidence_truncate();
--> statement-breakpoint
CREATE TRIGGER evidence_files_append_only
  BEFORE UPDATE OR DELETE ON "evidence_files"
  FOR EACH ROW EXECUTE FUNCTION ps_protect_evidence();
--> statement-breakpoint
CREATE TRIGGER evidence_files_no_truncate
  BEFORE TRUNCATE ON "evidence_files"
  FOR EACH STATEMENT EXECUTE FUNCTION ps_protect_evidence_truncate();
--> statement-breakpoint
CREATE TRIGGER evidence_blobs_append_only
  BEFORE UPDATE OR DELETE ON "evidence_blobs"
  FOR EACH ROW EXECUTE FUNCTION ps_protect_evidence();
--> statement-breakpoint
CREATE TRIGGER evidence_blobs_no_truncate
  BEFORE TRUNCATE ON "evidence_blobs"
  FOR EACH STATEMENT EXECUTE FUNCTION ps_protect_evidence_truncate();
