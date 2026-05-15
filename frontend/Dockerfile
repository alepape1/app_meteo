### Etapa 1: build React/Vite
FROM node:20-alpine AS build

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

### Etapa 2: servir con nginx
FROM nginx:alpine

COPY --from=build /app/dist /usr/share/nginx/html

# La configuración real viene montada desde docker-compose (nginx.conf)
EXPOSE 80 443
