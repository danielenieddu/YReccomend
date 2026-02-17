FROM node:20-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm install --production
COPY server/ ./server/
COPY public/ ./public/
EXPOSE 5173
CMD ["node", "server/server.js"]