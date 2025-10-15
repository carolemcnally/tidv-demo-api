# TIDV Demo API (Docker + Render)

Two services from one repo:
- dth-guid-demo-v2-bearer-dth — TIDV flow demo
- dth-guid-demo-v2-bearer-guid — GUID → NINO resolver

## Quick start (local, no Docker)
cd apps/dth && npm install && node server.js
# in another terminal
cd apps/guid && npm install && node server.js

## Docker build & run
docker build -t tidv-demo:latest .
docker run --rm -p 10000:10000 -e PORT=10000 -e APP_KIND=dth -e DEMO_BEARER_TOKEN=demo_token -e REDIRECT_MODE=true tidv-demo:latest node apps/dth/server.js
docker run --rm -p 10001:10001 -e PORT=10001 -e APP_KIND=guid tidv-demo:latest node apps/guid/server.js

## Render (Blueprint)
Push to GitHub, then create Blueprint from render.yaml.
