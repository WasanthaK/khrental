FROM node:22-alpine3.22

WORKDIR /app

ARG APP_BUILD_SHA=unknown

ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PORT=5174
ENV HOST=0.0.0.0

COPY package.json ./
RUN npm config set fetch-retries 5 \
  && npm config set fetch-retry-mintimeout 20000 \
  && npm config set fetch-retry-maxtimeout 120000 \
  && npm install --include=dev --no-audit --no-fund

COPY . .

RUN printf '{"buildSha":"%s"}\n' "$APP_BUILD_SHA" > public/build-info.json \
  && npm run build

ENV NODE_ENV=production

RUN mkdir -p /app/public/storage

EXPOSE 5174

HEALTHCHECK --interval=30s --timeout=5s --start-period=40s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:' + (process.env.PORT || 5174) + '/api/health').then((res) => process.exit(res.ok ? 0 : 1)).catch(() => process.exit(1))"

# Production runs with a restricted database identity that intentionally cannot
# create or alter schema. DDL migrations belong in a separate privileged
# deployment step, not in the web container startup path.
CMD ["sh", "-c", "npm run generate-env-config && node server.js"]
