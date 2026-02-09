-- 002_constraints.sql
-- Constraints e índices
DO $$
BEGIN
    -- Asegurar tamaño suficiente para descripciones largas
    IF EXISTS (
        SELECT 1
        FROM information_schema.columns
        WHERE table_name = 'proveedores_subcontratacion'
          AND column_name = 'tipo_escritura'
          AND data_type <> 'text'
    ) THEN
        ALTER TABLE proveedores_subcontratacion
        ALTER COLUMN tipo_escritura TYPE TEXT;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contratos_obras') THEN
        ALTER TABLE contratos
        ADD CONSTRAINT fk_contratos_obras FOREIGN KEY (num_obra) REFERENCES obras(num_obra);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'chk_contratos_fechas') THEN
        ALTER TABLE contratos
        ADD CONSTRAINT chk_contratos_fechas CHECK (f_fin >= f_inicio);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_sub_empresa') THEN
        ALTER TABLE proveedores_subcontratacion ADD CONSTRAINT uq_prov_sub_empresa UNIQUE (empresa);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_sub_cif') THEN
        ALTER TABLE proveedores_subcontratacion ADD CONSTRAINT uq_prov_sub_cif UNIQUE (cif);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_sum_empresa') THEN
        ALTER TABLE proveedores_suministros_servicios ADD CONSTRAINT uq_prov_sum_empresa UNIQUE (empresa);
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'uq_prov_sum_cif') THEN
        ALTER TABLE proveedores_suministros_servicios ADD CONSTRAINT uq_prov_sum_cif UNIQUE (cif);
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_contratos_num_obra ON contratos(num_obra);
CREATE INDEX IF NOT EXISTS idx_contratos_empresa ON contratos(empresa);
CREATE INDEX IF NOT EXISTS idx_contratos_cif ON contratos(cif);
CREATE INDEX IF NOT EXISTS idx_contratos_estado ON contratos(estado);
CREATE INDEX IF NOT EXISTS idx_contratos_tipo_cont ON contratos(tipo_cont);
CREATE INDEX IF NOT EXISTS idx_contratos_f_inicio ON contratos(f_inicio);
CREATE INDEX IF NOT EXISTS idx_contratos_f_fin ON contratos(f_fin);

CREATE INDEX IF NOT EXISTS idx_prov_sub_empresa ON proveedores_subcontratacion(empresa);
CREATE INDEX IF NOT EXISTS idx_prov_sub_cif ON proveedores_subcontratacion(cif);

CREATE INDEX IF NOT EXISTS idx_prov_sum_empresa ON proveedores_suministros_servicios(empresa);
CREATE INDEX IF NOT EXISTS idx_prov_sum_cif ON proveedores_suministros_servicios(cif);

COMMENT ON TABLE obras IS 'Información de obras y proyectos';
COMMENT ON TABLE proveedores_subcontratacion IS 'Proveedores de subcontratación con información legal completa';
COMMENT ON TABLE proveedores_suministros_servicios IS 'Proveedores de suministros y servicios';
COMMENT ON TABLE contratos IS 'Contratos firmados con proveedores para obras específicas';
