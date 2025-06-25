# syntax=docker/dockerfile:1.7-labs

# Use official Node.js LTS image
FROM node:18

# Install AWS CLI v2, x86_64 or arm64 depending on the architecture
RUN apt-get update && \
    apt-get install -y unzip curl && \
    if [ "$(uname -m)" = "x86_64" ]; then \
        curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" ; \
    else \
        curl "https://awscli.amazonaws.com/awscli-exe-linux-aarch64.zip" -o "awscliv2.zip" ; \
    fi && \
    unzip awscliv2.zip && \
    ./aws/install && \
    rm -rf awscliv2.zip aws

# Set working directory
WORKDIR /usr/src/app

# Copy package.json and package-lock.json
COPY package*.json ./

# Install dependencies
RUN npm install

# Install dev dependencies globally for hot reload (browser-sync, nodemon, concurrently)
RUN npm install -g browser-sync nodemon concurrently

# Copy the rest of the app (for build context, but will be overridden by volume mount in compose)
COPY --exclude=node_modules . .

# Expose ports for server and browser-sync
EXPOSE 3000 3001 3002

# Default command
CMD ["npm", "run", "dev"]
