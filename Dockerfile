FROM node:lts AS build

RUN mkdir -p /work
WORKDIR /work
ADD package.json /work
ADD package-lock.json /work
RUN npm ci

ADD . /work

RUN npm run build
RUN npm prune --include prod

FROM node:lts

RUN mkdir /app
WORKDIR /app

USER 999
VOLUME /config
VOLUME /logs
CMD ["node", "dist/index.js"]

ENV FRIGATE_CONFIG=/config/config.yaml
ENV EVENT_LOG=/logs/event

COPY --from=build /work /app
