# syntax=docker/dockerfile:1.7@sha256:a57df69d0ea827fb7266491f2813635de6f17269be881f696fbfdf2d83dda33e

ARG NODE_IMAGE=node:22.23.2-alpine@sha256:c610fcdfb1d5b4740dd70c284ed3cb16bb857e0f7166196e36a5501df7a3aa32
ARG NGINX_IMAGE=nginxinc/nginx-unprivileged:1.30.4-alpine-slim@sha256:11f3f6249b4ae3d7a4ec2a51797060107b88ead52b33b6ed3c6c33f55ca96200

# The frontend output is architecture-independent. Build it once on the native
# runner rather than executing Node under QEMU for every target platform.
FROM --platform=$BUILDPLATFORM ${NODE_IMAGE} AS build

ARG BUILD_CREATED=unspecified
ARG BUILD_REVISION=unknown
ARG BUILD_VERSION=0.1.0-preview
ARG BUILD_LICENSE=NOASSERTION
ENV BITWAKE_BUILD_DATE=${BUILD_CREATED} \
    BITWAKE_BUILD_REVISION=${BUILD_REVISION} \
    BITWAKE_BUILD_VERSION=${BUILD_VERSION}

WORKDIR /app

COPY package.json pnpm-lock.yaml ./
RUN corepack enable \
    && corepack prepare pnpm@10.15.0+sha512.486ebc259d3e999a4e8691ce03b5cac4a71cbeca39372a9b762cb500cfdf0873e2cb16abe3d951b1ee2cf012503f027b98b6584e4df22524e0c7450d9ec7aa7b --activate \
    && pnpm install --frozen-lockfile

COPY . ./
RUN pnpm build:standalone \
    && test -f dist/standalone/index.html \
    && test ! -f dist/standalone/mockServiceWorker.js \
    && ! find dist/standalone -type f -name '*.map' -print -quit | grep -q .

FROM ${NGINX_IMAGE} AS runtime

ARG BUILD_CREATED=unspecified
ARG BUILD_REVISION=unknown
ARG BUILD_VERSION=0.1.0-preview
ARG BUILD_LICENSE=NOASSERTION

LABEL org.opencontainers.image.title="Bitwake" \
      org.opencontainers.image.description="Bitwake standalone qBittorrent WebUI reverse proxy" \
      org.opencontainers.image.source="https://github.com/dotSML/bitwake" \
      org.opencontainers.image.url="https://github.com/dotSML/bitwake" \
      org.opencontainers.image.documentation="https://github.com/dotSML/bitwake/blob/main/docs/deployment.md" \
      org.opencontainers.image.created="${BUILD_CREATED}" \
      org.opencontainers.image.revision="${BUILD_REVISION}" \
      org.opencontainers.image.version="${BUILD_VERSION}" \
      org.opencontainers.image.licenses="${BUILD_LICENSE}"

ENV LISTEN_PORT=8081 \
    MAX_UPLOAD_SIZE=100m \
    PROXY_CONNECT_TIMEOUT=10s \
    PROXY_READ_TIMEOUT=300s \
    PROXY_SEND_TIMEOUT=300s \
    PROXY_SSL_VERIFY=on

COPY --from=build --chown=101:101 /app/dist/standalone/ /usr/share/nginx/html/
COPY --chown=101:101 container/nginx.conf.template /etc/nginx/templates/bitwake.conf.template
COPY --chown=101:101 container/security-headers.conf /etc/nginx/bitwake-security-headers.conf
COPY --chown=101:101 container/entrypoint.sh /usr/local/bin/bitwake-entrypoint

USER 101:101
EXPOSE 8081
STOPSIGNAL SIGQUIT
ENTRYPOINT ["/usr/local/bin/bitwake-entrypoint"]
CMD ["nginx", "-c", "/tmp/nginx.conf", "-g", "daemon off;"]
