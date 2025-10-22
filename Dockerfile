FROM node:alpine@sha256:08e94d88b58859f44d89e0597b416385840e69a1ec56c800c810dfb8c8d0c1bf AS builder

RUN apk add --no-cache openssl=3.5.4-r0

WORKDIR /app

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm ci --ignore-scripts

COPY ./src ./src
COPY ./tsconfig.json ./tsconfig.json

RUN npm run build

FROM node:alpine@sha256:08e94d88b58859f44d89e0597b416385840e69a1ec56c800c810dfb8c8d0c1bf AS release

RUN apk add --no-cache openssl=3.5.4-r0

WORKDIR /app

COPY --from=builder /app/dist /app/dist
COPY --from=builder /app/package.json /app/package.json
COPY --from=builder /app/package-lock.json /app/package-lock.json

ENV NODE_ENV=production

RUN npm ci --ignore-scripts --omit-dev

USER node

CMD ["node", "dist/index.js"]
