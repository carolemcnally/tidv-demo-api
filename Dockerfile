# Simple, reliable Dockerfile
FROM node:20-alpine

# Workdir inside the container
WORKDIR /app

# Copy only what we need
COPY apps ./apps

# Install deps for both apps
RUN cd ./apps/dth  && (npm ci --omit=dev || npm install --omit=dev) \
 && cd ../guid     && (npm ci --omit=dev || npm install --omit=dev)

# Non-root user for safety
RUN addgroup -S nodegrp && adduser -S nodeusr -G nodegrp
USER nodeusr

# Expose (optional, Render doesn’t require)
EXPOSE 10000 10001

# Default command (DTH). The GUID service will override via dockerCommand in render.yaml.
CMD ["node", "apps/dth/server.js"]
