import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.join(__dirname, '..');

// Colors for console output
const colors = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
};

function log(message, color = 'reset') {
  console.log(`${colors[color]}${message}${colors.reset}`);
}

async function askQuestion(question) {
  const readline = await import('readline');
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  return new Promise((resolve) => {
    rl.question(question, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function generateSecureSecret() {
  return crypto.randomBytes(32).toString('hex');
}

async function updateEnvFile() {
  log('\n📝 Updating .env file with production settings...', 'cyan');
  
  const envPath = path.join(projectRoot, '.env');
  let envContent = fs.readFileSync(envPath, 'utf8');
  
  // Generate new secrets
  const jwtSecret = await generateSecureSecret();
  const dbPassword = (await generateSecureSecret()).substring(0, 16);
  
  // Ask for domain
  const domain = await askQuestion('\n🌐 What is your domain name? (Press Enter for localhost): ');
  const finalDomain = domain || 'localhost';
  
  // Update .env content
  envContent = envContent.replace(
    /JWT_SECRET=.*/,
    `JWT_SECRET=${jwtSecret}`
  );
  
  envContent = envContent.replace(
    /DB_PASSWORD=.*/,
    `DB_PASSWORD=${dbPassword}`
  );
  
  // Add production settings if not present
  if (!envContent.includes('CORS_ORIGIN')) {
    envContent += '\n# CORS Configuration\n';
    envContent += `CORS_ORIGIN=http://${finalDomain}:3001\n`;
  }
  
  if (!envContent.includes('RATE_LIMIT')) {
    envContent += '\n# Rate Limiting\n';
    envContent += 'RATE_LIMIT_WINDOW_MS=900000\n';
    envContent += 'RATE_LIMIT_MAX_REQUESTS=100\n';
  }
  
  if (!envContent.includes('ENABLE_HELMET')) {
    envContent += '\n# Security\n';
    envContent += 'ENABLE_HELMET=true\n';
  }
  
  fs.writeFileSync(envPath, envContent);
  
  log('✅ .env file updated successfully!', 'green');
  log(`   JWT Secret: ${jwtSecret.substring(0, 10)}...`, 'yellow');
  log(`   DB Password: ${dbPassword}`, 'yellow');
  log(`   Domain: http://${finalDomain}:3001`, 'yellow');
}

async function installDependencies() {
  log('\n📦 Installing production dependencies...', 'cyan');
  
  try {
    execSync('npm install express-rate-limit helmet pino', { stdio: 'inherit' });
    execSync('npm install --save-dev pino-pretty', { stdio: 'inherit' });
    log('✅ Dependencies installed!', 'green');
  } catch (error) {
    log('❌ Failed to install dependencies', 'red');
    throw error;
  }
}

async function buildApplication() {
  log('\n🔨 Building application...', 'cyan');
  
  try {
    execSync('npm run build', { stdio: 'inherit' });
    log('✅ Application built successfully!', 'green');
  } catch (error) {
    log('❌ Build failed', 'red');
    throw error;
  }
}

async function setupDocker() {
  log('\n🐳 Setting up Docker...', 'cyan');
  
  const hasDocker = await askQuestion('Do you have Docker installed? (y/n): ');
  
  if (hasDocker.toLowerCase() === 'y') {
    try {
      log('Building Docker image...', 'yellow');
      execSync('npm run docker:build', { stdio: 'inherit' });
      log('✅ Docker image built successfully!', 'green');
      
      const runDocker = await askQuestion('Do you want to run Docker now? (y/n): ');
      if (runDocker.toLowerCase() === 'y') {
        log('Starting Docker containers...', 'yellow');
        execSync('npm run docker:run', { stdio: 'inherit' });
        log('✅ Docker containers are running!', 'green');
        log('   Frontend: http://localhost:3001', 'blue');
        log('   Backend: http://localhost:3000', 'blue');
      }
    } catch (error) {
      log('❌ Docker setup failed', 'red');
      log('   Make sure Docker Desktop is running', 'yellow');
    }
  } else {
    log('⚠️  Skipping Docker setup', 'yellow');
    log('   You can deploy without Docker using: npm run build && npm start', 'blue');
  }
}

async function createProductionChecklist() {
  log('\n📋 Creating your production checklist...', 'cyan');
  
  const checklistPath = path.join(projectRoot, 'MY_PRODUCTION_CHECKLIST.md');
  const checklistContent = `# ✅ My Production Checklist

## Completed ✅
- [x] JWT secret generated and secured
- [x] Production dependencies installed
- [x] Application built successfully
- [x] Environment configured for ${new Date().toLocaleDateString()}

## Next Steps 🚀
- [ ] Deploy to cloud provider (AWS, Google Cloud, Azure, etc.)
- [ ] Set up custom domain with SSL
- [ ] Configure monitoring and alerts
- [ ] Set up database backups
- [ ] Test load at scale
- [ ] Document recovery procedures

## Important Information 🔐
- **JWT Secret**: Securely stored in .env
- **Database Password**: Securely stored in .env
- **Domain**: Configured in CORS_ORIGIN

## Quick Commands 📝
\`\`\`bash
# Start production server
npm start

# View logs
docker-compose logs -f

# Check health
curl http://localhost:3000/api/health
\`\`\`

---
Generated on: ${new Date().toISOString()}
`;
  
  fs.writeFileSync(checklistPath, checklistContent);
  log('✅ Checklist created!', 'green');
}

async function main() {
  log('\n🚀 Woke Portal Production Setup', 'bright');
  log('================================', 'bright');
  
  try {
    await updateEnvFile();
    await installDependencies();
    await buildApplication();
    await setupDocker();
    await createProductionChecklist();
    
    log('\n🎉 Setup Complete!', 'bright');
    log('Your Woke Portal is production-ready!', 'green');
    log('\nNext steps:', 'cyan');
    log('1. Check your application: http://localhost:3000', 'blue');
    log('2. Review MY_PRODUCTION_CHECKLIST.md', 'blue');
    log('3. Deploy to your cloud provider', 'blue');
    
  } catch (error) {
    log('\n❌ Setup failed!', 'red');
    log(error.message, 'red');
    process.exit(1);
  }
}

main();
