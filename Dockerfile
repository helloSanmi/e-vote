# Dockerfile.frontend

# Stage 1: Build the Next.js app
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm install

# Copy only frontend-related files and directories
COPY pages/ ./pages/
COPY components/ ./components/
COPY public/ ./public/
COPY styles/ ./styles/
COPY tailwind.config.js ./
COPY postcss.config.js ./
COPY .env.local ./

# Ensure node_modules/.bin is in PATH
ENV PATH=/app/node_modules/.bin:$PATH

# Fix permissions for next binary
RUN chmod +x node_modules/.bin/next

# Build the Next.js app
ARG NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

# Build with environment variable for Tailwind CSS
RUN npm run build

# Stage 2: Serve the Next.js app
FROM node:18-alpine AS runner

# Set NODE_ENV
ENV NODE_ENV=production

# Set working directory
WORKDIR /app

# Copy package.json and package-lock.json
COPY package.json ./
COPY package-lock.json ./

# Install only production dependencies
RUN npm install --only=production

# Copy built files from builder
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/package.json ./package.json

# Ensure node_modules/.bin is in PATH
ENV PATH=/app/node_modules/.bin:$PATH

# Fix permissions for next binary
RUN chmod +x node_modules/.bin/next

# Expose port
EXPOSE 3000

# Start the Next.js app, ensure it listens on all interfaces
CMD ["next", "start", "-H", "0.0.0.0"]
