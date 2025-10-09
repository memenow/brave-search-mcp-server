FROM node:alpine@sha256:f8baf2c963e3bff767993135ae3447bb433e8d64a5e4bb65780cd29ef3a525c2 AS builder

RUN apk add --no-cache openssl=3.5.4-r0

WORKDIR /app

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm ci --ignore-scripts

COPY ./src ./src
COPY ./tsconfig.json ./tsconfig.json

RUN npm run build

FROM node:alpine@sha256:f8baf2c963e3bff767993135ae3447bb433e8d64a5e4bb65780cd29ef3a525c2 AS release

RUN apk add --no-cache openssl=3.5.4-r0

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

RUN npm ci --ignore-scripts --omit-dev

USER node

CMD ["node", "dist/index.js"]
