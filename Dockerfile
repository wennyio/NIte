FROM node:20-alpine
WORKDIR /app

COPY backend/package.json ./backend/
RUN npm install --prefix backend

COPY frontend/package.json ./frontend/
RUN npm install --prefix frontend

COPY . .
ARG CACHE_BUST=1
RUN npm run build --prefix frontend

EXPOSE 3000
CMD ["node", "backend/server.js"]
