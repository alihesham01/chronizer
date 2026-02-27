#!/bin/bash

# Docker build helper for memory-constrained environments

echo "🔧 Building Docker image with optimized memory settings..."

# Set environment variables for Node.js memory
export NODE_OPTIONS="--max-old-space-size=4096"

# Clean up any previous builds
echo "🧹 Cleaning up previous builds..."
docker system prune -f

# Build with increased memory
echo "🏗️ Building Docker image..."
docker build \
  --build-arg NODE_OPTIONS="--max-old-space-size=4096" \
  --no-cache \
  --memory=2g \
  -t woke-backend \
  .

if [ $? -eq 0 ]; then
  echo "✅ Build successful!"
  
  # Run the container
  echo "🚀 Starting container..."
  docker-compose up -d
  
  # Show logs
  echo "📋 Showing logs..."
  docker-compose logs -f
else
  echo "❌ Build failed!"
  echo "💡 Try increasing Docker memory allocation in Docker Desktop settings"
  exit 1
fi
