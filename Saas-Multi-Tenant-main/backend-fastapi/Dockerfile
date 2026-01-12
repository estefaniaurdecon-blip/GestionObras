FROM python:3.12-slim

# Establecemos directorio de trabajo dentro del contenedor
WORKDIR /app

# Instalamos dependencias de sistema mínimas (psycopg2, etc.)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    && rm -rf /var/lib/apt/lists/*

# Copiamos ficheros de dependencias
COPY requirements.txt .

# Instalamos dependencias de Python
RUN pip install --no-cache-dir -r requirements.txt

# Copiamos el código de la aplicación
COPY app ./app
COPY .env.example ./.env

# Variables de entorno básicas
ENV PYTHONUNBUFFERED=1

# Comando por defecto: levantar API con uvicorn
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

