# syntax=docker/dockerfile:1.7
# MyMA Moodle image — FrankenPHP classic mode (per-request SAPI).
# Moodle application code is NOT baked into this image; it is mounted at runtime
# from /opt/myma/instances/<project>/moodle so container replacement never
# destroys user data. The image ships only the PHP runtime, extensions, and
# helpers needed to serve and install Moodle.
FROM dunglas/frankenphp:1.3.6-php8.3-alpine

LABEL maintainer="MyMA" \
      description="FrankenPHP classic mode runtime for MyMA-managed Moodle"

ENV MOODLE_CODE_PATH=/var/www/moodle \
    MOODLE_DATA_PATH=/var/www/moodledata \
    # Classic mode: no worker directive; FrankenPHP serves PHP files per request.
    SERVER_NAME=:80 \
    # Ensure our custom INI directory is scanned in addition to the image defaults.
    PHP_INI_SCAN_DIR=/usr/local/etc/php/conf.d:/usr/local/etc/php/myma.d

# Runtime user/group. The moodledata volume is owned by this user; the Moodle
# code bind mount is expected to be readable by www-data / myma.
RUN addgroup -g 1000 myma && \
    adduser -u 1000 -G myma -h /var/www -s /bin/sh -D myma

# System libraries required by Moodle's PHP extensions and tooling.
RUN apk add --no-cache \
        freetype-dev \
        libjpeg-turbo-dev \
        libpng-dev \
        libwebp-dev \
        libxml2-dev \
        libzip-dev \
        icu-dev \
        icu-data-full \
        openldap-dev \
        oniguruma-dev \
        gettext-dev \
        coreutils \
        git \
        unzip \
        rsync \
        curl \
        bash

# Install the PHP extensions Moodle requires. install-php-extensions is bundled
# with the official php / FrankenPHP images and handles the system deps above.
RUN install-php-extensions \
    mysqli \
    gd \
    intl \
    xmlrpc \
    soap \
    opcache \
    zip \
    curl \
    mbstring \
    exif \
    pcntl \
    sodium \
    ldap

# Custom PHP overrides for Moodle (memory, uploads, opcache, security).
COPY --chown=myma:myma config/myma.php.ini /usr/local/etc/php/myma.d/99-myma.ini

# Container helpers: entrypoint (permissions / validation) and one-shot Moodle
# installer that the MyMA agent can invoke.
COPY --chown=root:root scripts/docker-entrypoint.sh /usr/local/bin/docker-entrypoint.sh
COPY --chown=root:root scripts/install-moodle.sh /usr/local/bin/install-moodle.sh
RUN chmod 755 /usr/local/bin/docker-entrypoint.sh /usr/local/bin/install-moodle.sh

# Prepare moodledata landing zone. The named volume is mounted over this path
# at runtime, but creating it now lets the entrypoint set base permissions.
# We leave the container as root so the entrypoint can fix volume ownership;
# the PHP worker runs as the distribution's www-data user.
RUN mkdir -p /var/www/moodledata /var/log

WORKDIR /var/www/moodle

EXPOSE 80 443

ENTRYPOINT ["/usr/local/bin/docker-entrypoint.sh"]
# Classic mode: use FrankenPHP's default Caddyfile (no worker directive).
CMD ["frankenphp", "run", "--config", "/etc/caddy/Caddyfile"]
