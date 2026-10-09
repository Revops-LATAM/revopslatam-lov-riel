ALTER TABLE public.contracts DROP CONSTRAINT IF EXISTS contracts_sprint_duration_chk;

ALTER TYPE public.contract_type RENAME TO contract_type_old;
CREATE TYPE public.contract_type AS ENUM ('implementation','recurrente');
ALTER TABLE public.contracts
  ALTER COLUMN type TYPE public.contract_type USING type::text::public.contract_type;
DROP TYPE public.contract_type_old;

ALTER TABLE public.contracts ADD CONSTRAINT contracts_sprint_duration_chk
  CHECK (
    (type = 'implementation' AND sprint_duration_days IS NULL)
    OR (type = 'recurrente' AND sprint_duration_days IS NOT NULL AND sprint_duration_days > 0)
  );