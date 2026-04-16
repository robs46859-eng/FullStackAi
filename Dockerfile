# Stage 1: Base image for building
FROM node:24-slim AS base
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
RUN corepack enable
COPY . /app
WORKDIR /app

# Stage 2: Install dependencies
FROM base AS build
RUN --mount=type=cache,id=pnpm,target=/pnpm/store pnpm install --frozen-lockfile
RUN pnpm run build

# Stage 3: Production image
FROM node:24-slim AS runner
WORKDIR /app

# Copy necessary files for production
COPY --from=build /app/package.json /app/pnpm-lock.yaml /app/pnpm-workspace.yaml ./
COPY --from=build /app/node_modules /app/node_modules
COPY --from=build /app/artifacts/api-server/package.json ./artifacts/api-server/
COPY --from=build /app/artifacts/api-server/dist ./artifacts/api-server/dist
COPY --from=build /app/artifacts/api-server/config ./artifacts/api-server/config
COPY --from=build /app/lib/db/package.json ./lib/db/
COPY --from=build /app/lib/db/dist ./lib/db/dist

# The api-server build externalizes many things, so we still need node_modules
# But we can try to install only production dependencies if we want it smaller.
# For now, let's keep it simple.

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the server
CMD ["node", "--enable-source-maps", "artifacts/api-server/dist/index.mjs"]
