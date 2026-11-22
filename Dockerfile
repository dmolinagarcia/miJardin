# Imagen del jardín: Node 22 sin dependencias externas.
FROM node:22-alpine

ENV NODE_ENV=production \
    PUERTO=8080 \
    DATOS=/datos

WORKDIR /app
COPY package.json ./
COPY servidor ./servidor
COPY publico ./publico
COPY semillas ./semillas

RUN mkdir -p /datos && chown node:node /datos
USER node
VOLUME ["/datos"]
EXPOSE 8080

HEALTHCHECK --interval=15s --timeout=3s --start-period=10s --retries=3 CMD wget -qO- http://127.0.0.1:8080/salud || exit 1

# Versión y commit: los pone despliegue/actualizar.sh al construir.
ARG VERSION=0.0.0-dev
ARG COMMIT=desconocido
ENV JARDIN_VERSION=$VERSION \
    JARDIN_COMMIT=$COMMIT

CMD ["node", "--disable-warning=ExperimentalWarning", "servidor/index.js"]
