FROM node:24.12.0 AS buildtime

# Install envsubst
RUN apt update && apt-get install -y gettext-base

ARG BUILD_NUMBER
ARG GIT_COMMIT
ARG BUILD_TIME

WORKDIR /usr/src/app

COPY . .

RUN envsubst < /usr/src/app/src/assets/buildtime-env-vars.js.template > /usr/src/app/src/assets/buildtime-env-vars.js

RUN npm install
ENV NODE_OPTIONS="--max-old-space-size=8192"
RUN npm install -g @angular/cli

RUN ng build
# RUN npm run prerender

FROM nginx:stable-alpine AS runtime

# Update all OS packages and install envsubst for runtime environment variable substitution
RUN apk update && apk upgrade --no-cache && apk add --no-cache gettext

# Create a non-root user
RUN addgroup -g 1001 -S appgroup && \
    adduser -u 1001 -S appuser -G appgroup

RUN rm -rf /usr/share/nginx/html/*

COPY --from=buildtime /usr/src/app/dist/cover-printer-app/browser /usr/share/nginx/html
COPY --from=buildtime /usr/src/app/src/assets/runtime-env-vars.js.template /usr/share/nginx/html/assets/runtime-env-vars.js.template
COPY nginx_conf/nginx.conf /etc/nginx/conf.d/default.conf

# Create required directories and set permissions for non-root user
RUN mkdir -p /var/cache/nginx /var/log/nginx /var/run && \
    chown -R appuser:appgroup /var/cache/nginx /var/log/nginx /var/run /usr/share/nginx/html && \
    chmod -R 755 /var/cache/nginx /var/log/nginx /var/run /usr/share/nginx/html && \
    touch /var/run/nginx.pid && \
    chown appuser:appgroup /var/run/nginx.pid

# Switch to non-root user
USER appuser

CMD ["/bin/sh",  "-c",  "envsubst < /usr/share/nginx/html/assets/runtime-env-vars.js.template > /usr/share/nginx/html/assets/runtime-env-vars.js && exec nginx -g 'daemon off;'"]
