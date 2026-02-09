-- =====================================================
-- IMPORTACI?N PROFESIONAL / IDEMPOTENTE (PostgreSQL)
-- =====================================================
SET client_encoding = 'UTF8';
BEGIN;

-- =====================================================
-- 1) TABLAS
-- =====================================================
CREATE TABLE IF NOT EXISTS obras (
    num_obra INTEGER PRIMARY KEY,
    promotora VARCHAR(255) NOT NULL,
    nombre_obra VARCHAR(255) NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proveedores_subcontratacion (
    id_proveedor SERIAL PRIMARY KEY,
    razon_social VARCHAR(500) NOT NULL,
    empresa VARCHAR(255) NOT NULL,
    cif VARCHAR(20) NOT NULL,
    nombre_gerente VARCHAR(255) NOT NULL,
    nif_gerente VARCHAR(20) NOT NULL,
    direccion_empresa TEXT NOT NULL,
    tipo_escritura VARCHAR(100) NOT NULL,
    fecha_escritura VARCHAR(100) NOT NULL,
    nombre_notario VARCHAR(255) NOT NULL,
    numero_protocolo NUMERIC(10,3),
    telefono_contacto VARCHAR(20),
    email_contacto VARCHAR(255),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS proveedores_suministros_servicios (
    id_proveedor SERIAL PRIMARY KEY,
    razon_social VARCHAR(500) NOT NULL,
    empresa VARCHAR(255) NOT NULL,
    cif VARCHAR(20) NOT NULL,
    nombre_gerente VARCHAR(255) NOT NULL,
    nif_gerente VARCHAR(20) NOT NULL,
    direccion_empresa TEXT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS contratos (
    id_contrato VARCHAR(50) PRIMARY KEY,
    estado VARCHAR(50) NOT NULL,
    nom_jo VARCHAR(255) NOT NULL,
    tipo_doc VARCHAR(50) NOT NULL,
    tipo_cont VARCHAR(50) NOT NULL,
    num_obra INTEGER NOT NULL,
    empresa VARCHAR(255) NOT NULL,
    cif VARCHAR(20) NOT NULL,
    nom_contacto VARCHAR(255) NOT NULL,
    telf_contacto BIGINT NOT NULL,
    email_contacto VARCHAR(255) NOT NULL,
    f_inicio DATE NOT NULL,
    f_fin DATE NOT NULL,
    f_peticion DATE NOT NULL,
    tipo_precio VARCHAR(50),
    precio_num VARCHAR(50) NOT NULL,
    precio_let TEXT NOT NULL,
    forma_pago VARCHAR(100) NOT NULL,
    seguro VARCHAR(100) NOT NULL,
    num_trab INTEGER,
    num_trab_let VARCHAR(100),
    retencion VARCHAR(20),
    portes VARCHAR(50),
    descargas VARCHAR(50),
    cat_servicio VARCHAR(100),
    hitos TEXT,
    observaciones TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- =====================================================
-- 2) CONSTRAINTS
-- =====================================================
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_contratos_obras') THEN
        ALTER TABLE contratos
        ADD CONSTRAINT fk_contratos_obras FOREIGN KEY (num_obra) REFERENCES obras(num_obra);
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

-- =====================================================
-- 3) ?NDICES
-- =====================================================
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

-- =====================================================
-- 4) COMENTARIOS
-- =====================================================
COMMENT ON TABLE obras IS 'Informaci?n de obras y proyectos';
COMMENT ON TABLE proveedores_subcontratacion IS 'Proveedores de subcontrataci?n con informaci?n legal completa';
COMMENT ON TABLE proveedores_suministros_servicios IS 'Proveedores de suministros y servicios';
COMMENT ON TABLE contratos IS 'Contratos firmados con proveedores para obras espec?ficas';

-- =====================================================
-- 5) DATOS (UPSERT)
-- =====================================================


COMMIT;
