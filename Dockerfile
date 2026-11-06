# The backend: the console API, the demo agent and its x402 gateway, and the services that keep credit lines
# running (sweeper, relay, bureau writer, watcher). Settings come from the host's environment, never a file.
FROM node:22-bookworm-slim AS node

FROM python:3.13-slim-bookworm
# Node runs the x402 gateway, the demo rush and the Solidity compiler used when an agent enrols.
COPY --from=node /usr/local/bin/node /usr/local/bin/node
COPY --from=node /usr/local/lib/node_modules /usr/local/lib/node_modules
RUN ln -s /usr/local/lib/node_modules/npm/bin/npm-cli.js /usr/local/bin/npm \
 && ln -s /usr/local/lib/node_modules/npm/bin/npx-cli.js /usr/local/bin/npx

WORKDIR /app
COPY python/requirements.txt python/requirements.txt
RUN python -m venv python/.venv && python/.venv/bin/pip install --no-cache-dir -r python/requirements.txt honcho
COPY gateway/package.json gateway/package-lock.json gateway/
RUN cd gateway && npm ci --no-audit --no-fund

COPY contracts contracts
COPY deployments deployments
COPY gateway gateway
COPY python python
COPY deploy deploy

ENV PYTHONUNBUFFERED=1
CMD ["sh", "deploy/start.sh"]
