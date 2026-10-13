FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY server.js ./

EXPOSE 7860

ENV PORT=7860
ENV NODE_ENV=production

CMD ["node", "server.js"]
