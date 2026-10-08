FROM node:24-alpine

WORKDIR /app

# ffmpeg: web versions + poster frames for uploaded videos (utils/video.js)
RUN apk add --no-cache ffmpeg

COPY package.json ./
RUN npm install --omit=dev

COPY utils/ ./utils/
COPY scripts/ ./scripts/
COPY server.js ./

EXPOSE 3001

CMD ["node", "server.js"]
