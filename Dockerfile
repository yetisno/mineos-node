FROM ubuntu:26.04
LABEL MAINTAINER='William Dizon <wdchromium@gmail.com>'

#update and accept all prompts
ENV DEBIAN_FRONTEND=noninteractive
ENV NODE_VERSION=14.21.3
RUN apt-get update && apt-get install -y \
  supervisor \
  rdiff-backup \
  screen \
  rsync \
  git \
  curl \
  rlwrap \
  unzip \
  xz-utils \
  ca-certificates \
  openjdk-26-jre-headless \
  openjdk-8-jre-headless \
  ca-certificates-java \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#install Node.js 14 for MineOS native dependencies
RUN node_arch="$(dpkg --print-architecture)" \
  && case "$node_arch" in amd64) node_arch=x64 ;; arm64) node_arch=arm64 ;; armhf) node_arch=armv7l ;; *) echo "Unsupported architecture: $node_arch" >&2; exit 1 ;; esac \
  && curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${node_arch}.tar.xz \
  | tar -xJ -C /usr/local --strip-components=1 \
  && ln -sf /usr/local/bin/node /usr/bin/node \
  && npm install -g npm@8.19.4

WORKDIR /usr/games/minecraft

#build npm deps and clean up apt for image minimalization
COPY package.json package-lock.json ./
RUN apt-get update \
  && apt-get install -y build-essential python3 python3-setuptools \
  && npm ci --only=production \
  && apt-get remove --purge -y build-essential \
  && apt-get autoremove -y \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

#copy mineos from this build context
COPY . .
RUN cp mineos.conf /etc/mineos.conf \
  && chmod +x webui.js mineos_console.js service.js

#configure and run supervisor
RUN cp /usr/games/minecraft/init/supervisor_conf /etc/supervisor/conf.d/mineos.conf
CMD ["/usr/bin/supervisord", "-n", "-c", "/etc/supervisor/supervisord.conf"]

#entrypoint allowing for setting of mc password
COPY entrypoint.sh /entrypoint.sh
ENTRYPOINT ["/entrypoint.sh"]

EXPOSE 8443 25565-25570
VOLUME /var/games/minecraft

ENV USER_PASSWORD=random_see_log USER_NAME=mc USER_UID=1000 USE_HTTPS=true SERVER_PORT=8443
