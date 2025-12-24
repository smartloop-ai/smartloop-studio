FROM node:18.17.0-alpine

WORKDIR /app

# Copy package files first for better layer caching
COPY package*.json ./

# Install all dependencies (including devDependencies needed for build)
# Don't set NODE_ENV=production yet, as it would skip devDependencies
RUN npm ci

# Copy application code (respects .dockerignore)
COPY . .

# Build the Next.js application
RUN npm run build

# Remove devDependencies after build to reduce image size
RUN npm prune --production

# Set NODE_ENV to production for runtime
ENV NODE_ENV=production

EXPOSE 3000

# Start the server
CMD ["npm", "run", "start"]
