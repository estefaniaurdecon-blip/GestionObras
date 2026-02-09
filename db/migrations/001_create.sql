-- 001_create.sql
-- Tablas base
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
    tipo_escritura TEXT NOT NULL,
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
