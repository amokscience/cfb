## Multi-stage Dockerfile
# Stage 1: build frontend using node
FROM node:18-alpine AS frontend-builder
WORKDIR /src/frontend
COPY frontend/package*.json ./
COPY frontend/ ./
RUN npm install --no-audit --no-fund
RUN npm run build

# Stage 2: build Go backend
FROM golang:1.20-alpine AS go-builder
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux GOARCH=amd64 go build -o /out/cfb

# Final image
FROM alpine:3.18
RUN apk add --no-cache ca-certificates
COPY --from=go-builder /out/cfb /usr/local/bin/cfb
COPY --from=frontend-builder /src/frontend/dist /app/frontend/dist
WORKDIR /app
ENV HTTP_PORT=8080
EXPOSE 8080
RUN addgroup -S appgroup && adduser -S appuser -G appgroup
USER appuser
CMD ["/usr/local/bin/cfb"]
