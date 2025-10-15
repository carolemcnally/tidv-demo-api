# -------- Base --------
FROM node:20-alpine AS base
WORKDIR /app
ENV NODE_ENV=production
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp

# -------- Dependencies for dth --------
FROM base AS deps-dth
WORKDIR /app/apps/dth
COPY apps/dth/package.json .
RUN npm ci --omit=dev || npm i --omit=dev

# -------- Dependencies for guid --------
FROM base AS deps-guid
WORKDIR /app/apps/guid
COPY apps/guid/package.json .
RUN npm ci --omit=dev || npm i --omit=dev

# -------- Runtime image --------
FROM base AS runner
WORKDIR /app

COPY --chown=nodeusr:nodegrp apps ./apps
COPY --from=deps-dth  /app/apps/dth/node_modules  /app/apps/dth/node_modules
COPY --from=deps-guid /app/apps/guid/node_modules /app/apps/guid/node_modules

USER nodeusr
EXPOSE 10000 10001
CMD ["node", "apps/dth/server.js"]