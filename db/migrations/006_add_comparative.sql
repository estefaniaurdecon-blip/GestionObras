BEGIN;

ALTER TABLE contract
    ADD COLUMN IF NOT EXISTS comparative_status VARCHAR(32) NOT NULL DEFAULT 'DRAFT';

ALTER TABLE contract_approval
    ADD COLUMN IF NOT EXISTS scope VARCHAR(32) NOT NULL DEFAULT 'CONTRACT';

DO $$
BEGIN
    IF EXISTS (
        SELECT 1
        FROM pg_indexes
        WHERE indexname = 'uq_contract_approval'
    ) THEN
        EXECUTE 'DROP INDEX uq_contract_approval';
    END IF;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS uq_contract_approval
    ON contract_approval (tenant_id, contract_id, department, scope);

COMMIT;
