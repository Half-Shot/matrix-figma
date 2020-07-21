# Stage 0: Build the thing
FROM node:14-alpine AS builder

COPY . /src
WORKDIR /src

RUN yarn
RUN yarn build

# Stage 1: The actual container
FROM node:14-alpine

COPY --from=builder /src/lib/ /bin/matrix-figma/
COPY --from=builder /src/package*.json /bin/matrix-figma/
COPY --from=builder /src/yarn.lock /bin/matrix-figma/
WORKDIR /bin/matrix-figma
RUN yarn --production

VOLUME /data
EXPOSE 9993
EXPOSE 7775

CMD ["node", "/bin/matrix-figma/App.js"]
