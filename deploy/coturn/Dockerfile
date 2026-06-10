FROM debian:stable-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends coturn \
    && rm -rf /var/lib/apt/lists/*

COPY turnserver.conf /etc/turnserver.conf

EXPOSE 3478/tcp 3478/udp 5349/tcp

CMD ["turnserver", "-c", "/etc/turnserver.conf", "--no-cli", "--no-stdout-log"]
