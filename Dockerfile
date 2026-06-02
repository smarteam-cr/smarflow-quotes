# Backend de generación de cotizaciones PDF (Fastify + Puppeteer)
FROM node:24-slim

# Chromium del sistema (apt resuelve TODAS sus librerías, incl. el cambio t64 de
# Debian) + fuentes para que el PDF se vea idéntico (Arial-compatibles y glifos
# Unicode como Δ y ≤). No descargamos el Chromium de Puppeteer; usamos el del sistema.
ENV PUPPETEER_SKIP_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium \
    NODE_ENV=production

RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      chromium \
      fonts-liberation \
      fonts-noto-core \
      ca-certificates \
 && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencias de producción, reproducibles con el lockfile.
COPY package.json package-lock.json ./
RUN npm ci --omit=dev

# Solo el backend (el frontend src/app se excluye en .dockerignore).
COPY src ./src

# Ejecutar como usuario sin privilegios (el usuario "node" ya existe en la imagen).
RUN chown -R node:node /app
USER node

EXPOSE 3000
CMD ["node", "src/server.js"]
