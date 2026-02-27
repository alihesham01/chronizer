@echo off
REM Docker build helper for memory-constrained environments (Windows)

echo 🔧 Building Docker image with optimized memory settings...

REM Set environment variables for Node.js memory
set NODE_OPTIONS=--max-old-space-size=4096

REM Clean up any previous builds
echo 🧹 Cleaning up previous builds...
docker system prune -f

REM Build with increased memory
echo 🏗️ Building Docker image...
docker build ^
  --build-arg NODE_OPTIONS="--max-old-space-size=4096" ^
  --no-cache ^
  --memory=2g ^
  -t woke-backend ^
  .

if %ERRORLEVEL% EQU 0 (
  echo ✅ Build successful!
  
  REM Run the container
  echo 🚀 Starting container...
  docker-compose up -d
  
  REM Show logs
  echo 📋 Showing logs...
  docker-compose logs -f
) else (
  echo ❌ Build failed!
  echo 💡 Try increasing Docker memory allocation in Docker Desktop settings
  exit /b 1
)
