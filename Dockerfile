# Imagen portable: sirve para Render, Fly.io, Koyeb, Railway, etc.
FROM node:22-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
ENV PORT=4000
EXPOSE 4000
CMD ["npm", "start"]
