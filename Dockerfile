FROM node:18-alpine AS base

# Install pnpm
RUN npm install -g pnpm

# Set working directory
WORKDIR /app

# Copy package files and patches
COPY package.json pnpm-lock.yaml* ./
COPY packages ./packages
COPY patches ./patches

# Create development stage for building
FROM base AS builder

# Install all dependencies including dev dependencies
RUN pnpm install --frozen-lockfile

# Copy source files
COPY . .

# Make sure pnpm binaries are available in PATH
ENV PATH="/app/node_modules/.bin:${PATH}"

# Build the application
RUN pnpm build

# Create development stage
FROM base AS development

# Copy all source files instead of just package files
COPY . .

# Install all dependencies including dev dependencies
RUN pnpm install --frozen-lockfile

# Set environment
ENV NODE_ENV=development
ENV PATH="/app/node_modules/.bin:${PATH}"

# Create production stage
FROM base AS production

# Install production dependencies only
RUN pnpm install --prod

# Copy build artifacts from builder stage
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules

# Copy schema files
COPY mcp-method-schemas.json ./

# Set environment variables
ENV NODE_ENV=production
ENV REDIS_URL=redis://redis:6379

# Expose API port
EXPOSE 3000

# Start the application
CMD ["node", "dist/main"]
