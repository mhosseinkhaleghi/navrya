# syntax=docker/dockerfile:1.7

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM dependencies AS build
COPY . .
ARG NAVRYA_BUILD_COMMIT
ARG NAVRYA_BUILD_COMMIT_COUNT
RUN npm run build

FROM caddy:2.10-alpine AS web
COPY deploy/Caddyfile /etc/caddy/Caddyfile
COPY --from=build /app/dist /srv
COPY --from=build /app/vendor /srv/vendor
COPY --from=build /app/src/release.js /srv/src/release.js

FROM node:22-alpine AS app
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY server ./server
# Journey H2, Gate 2: server/community/conversation-matcher-bridge.mjs loads this ONE
# browser-authored file at runtime via vm.runInNewContext, so the deterministic conversation
# matching algorithm is never duplicated server-side (see that file's own comment). This is the
# app image's only dependency on anything under public/ - the `web` stage above already ships the
# full built browser tree, so copying just this single file here (rather than all of public/,
# which would needlessly bloat a stateless API image with four ~2MB character bundles and every
# other browser-only asset) keeps that boundary explicit. Found missing via a real production
# incident: every route that calls getConversationMatcher() (publish, Trigger Lab test/test-batch/
# collisions, and Conversation Studio audio generation) threw ENOENT reading a file that simply
# did not exist in this image, surfacing to the admin only as a generic COMMUNITY_API_FAILED 500 -
# never caught before this because no automated test runs against the actual built Docker image,
# and no real deploy had exercised any of those specific routes until now. See
# tests/dockerfile-app-image-contract.test.mjs for the regression guard.
COPY public/pages/shared/ai-conversation-matcher.js ./public/pages/shared/ai-conversation-matcher.js
RUN mkdir -p /app/uploads && chown -R node:node /app
USER node
