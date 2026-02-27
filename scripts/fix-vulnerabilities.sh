#!/bin/bash

echo "🔒 Fixing npm vulnerabilities..."

# Backend vulnerabilities
echo "Checking backend vulnerabilities..."
cd "$(dirname "$0")/.."
npm audit --audit-level high

echo "Fixing backend vulnerabilities..."
npm audit fix --force

# Frontend vulnerabilities
echo "Checking frontend vulnerabilities..."
cd frontend
npm audit --audit-level high

echo "Fixing frontend vulnerabilities..."
npm audit fix --force

echo "✅ Vulnerability fix complete!"
echo "Run 'npm audit' again to verify all issues are resolved"
