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

HEALTHCHECK --interval=30s --timeout=3s CMD wget -qO- http://127.0.0.1:8080/salud || exit 1
CMD ["node", "--disable-warning=ExperimentalWarning", "servidor/index.js"]
