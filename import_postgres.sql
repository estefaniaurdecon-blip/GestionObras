-- PostgreSQL import script (psql)
-- 1) Create tables
CREATE TABLE IF NOT EXISTS obras (
  num_obra        INTEGER PRIMARY KEY,
  promotora       TEXT,
  nombre_obra     TEXT
);

CREATE TABLE IF NOT EXISTS providers (
  id              BIGSERIAL PRIMARY KEY,
  cif             TEXT UNIQUE NOT NULL,
  razon_social    TEXT,
  empresa         TEXT,
  provider_type   TEXT CHECK (provider_type IN ('SUBCONTRATACION','SUMINISTRO_SERVICIO','BOTH','UNKNOWN')) DEFAULT 'UNKNOWN',
  nombre_gerente  TEXT,
  nif_gerente     TEXT,
  direccion_empresa TEXT,
  tipo_escritura  TEXT,
  fecha_escritura DATE,
  nombre_notario  TEXT,
  numero_protocolo TEXT,
  telefono_contacto TEXT,
  email_contacto  TEXT
);

CREATE TABLE IF NOT EXISTS contratos (
  id_contrato     TEXT PRIMARY KEY,
  estado          TEXT,
  nom_jo          TEXT,
  tipo_doc        TEXT,
  tipo_cont       TEXT,
  num_obra        INTEGER REFERENCES obras(num_obra),
  empresa         TEXT,
  cif             TEXT REFERENCES providers(cif),
  nom_contacto    TEXT,
  telf_contacto   TEXT,
  email_contacto  TEXT,
  f_inicio        DATE,
  f_fin           DATE,
  f_peticion      DATE,
  tipo_precio     TEXT,
  precio_num      DOUBLE PRECISION,
  precio_let      TEXT,
  forma_pago      TEXT,
  seguro          DOUBLE PRECISION,
  num_trab        INTEGER,
  num_trab_let    TEXT,
  retencion       BOOLEAN,
  portes          TEXT,
  descargas       TEXT,
  cat_servicio    TEXT,
  hitos           TEXT,
  observaciones   TEXT
);

-- 2) Load data
-- Adjust file paths to where you place the CSVs.
-- In psql you can use \copy to load from your local machine.

\copy obras(num_obra,promotora,nombre_obra) FROM 'obras_clean.csv' CSV HEADER;
\copy providers(razon_social,empresa,cif,nombre_gerente,nif_gerente,direccion_empresa,tipo_escritura,fecha_escritura,nombre_notario,numero_protocolo,telefono_contacto,email_contacto,provider_type) FROM 'providers_clean.csv' CSV HEADER;
\copy contratos(id_contrato,estado,nom_jo,tipo_doc,tipo_cont,num_obra,empresa,cif,nom_contacto,telf_contacto,email_contacto,f_inicio,f_fin,f_peticion,tipo_precio,precio_num,precio_let,forma_pago,seguro,num_trab,num_trab_let,retencion,portes,descargas,cat_servicio,hitos,observaciones) FROM 'contratos_clean.csv' CSV HEADER;

-- 3) Optional: update/merge on re-import (UPSERT pattern)
-- If you need UPSERT instead of COPY, tell me your DB (Postgres/MySQL/SQLite) and I generate it.
