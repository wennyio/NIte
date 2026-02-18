FROM node:20-alpine
WORKDIR /app
COPY . .
RUN npm install --prefix backend
RUN npm install --prefix frontend
RUN npm run build --prefix frontend
EXPOSE 3000
CMD ["node", "backend/server.js"]