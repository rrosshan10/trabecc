# Minimal image for running Trabecc as a long-lived gateway.
# Use case: you want to run the admin server in a container alongside an
# MCP-aware agent. Stdio mode (`trabecc run`) is meant to be spawned by
# the host MCP client, so it is normally not what you'd run in a container.

FROM node:24-alpine

# Install only the runtime deps needed to launch upstream MCP servers via npx.
# Most upstream servers ship as Node packages; some require Python or git.
RUN apk add --no-cache python3 git ca-certificates

WORKDIR /app

# Production install of just the Trabecc CLI from npm. This produces a
# small image (no source tree, no devDependencies). Override at build time
# with --build-arg TRABECC_VERSION=x.y.z.
ARG TRABECC_VERSION=latest
RUN npm install -g trabecc@${TRABECC_VERSION}

# Audit DB lives here by default (~/.trabecc). Mount this for persistence.
ENV HOME=/data
RUN mkdir -p /data && chown -R node:node /data
USER node
VOLUME ["/data"]

# Admin server port. Override with --bind 0.0.0.0 + admin auth in front.
EXPOSE 4577

# Default to running the admin server. To run the proxy itself, override CMD
# with `trabecc run`.
CMD ["trabecc", "admin", "--config", "/data/config.yaml"]
