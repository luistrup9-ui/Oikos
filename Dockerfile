FROM node:24-slim

# Datos fuera de la imagen: se montan como volúmenes (ver docker-compose.yml)
ENV NODE_ENV=production \
    PORT=3100 \
    DATA_DIR=/data \
    BACKUP_DIR=/backups \
    TRUST_PROXY=1

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY . .
RUN mkdir -p /data /backups && chown node:node /data /backups

USER node
EXPOSE 3100
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s \
  CMD node -e "fetch('http://127.0.0.1:'+process.env.PORT+'/healthz').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
