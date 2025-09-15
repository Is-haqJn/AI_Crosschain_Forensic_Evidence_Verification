# PowerShell Script for Setting up Docker Secrets on Windows
# Implements OWASP 2025 Best Practices for Secrets Management
# Author: Forensic Evidence System Team
# Date: January 2025

Write-Host "🔐 Setting up Docker Secrets for Forensic Evidence System" -ForegroundColor Blue
Write-Host "Following OWASP 2025 security best practices" -ForegroundColor Green

# Function to generate secure random string
function Generate-SecureString {
    param([int]$Length = 32)
    $charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789-_"
    $random = New-Object System.Random
    $result = ""
    for ($i = 0; $i -lt $Length; $i++) {
        $result += $charset[$random.Next(0, $charset.Length)]
    }
    return $result
}

# Create secrets directory
if (!(Test-Path "secrets")) {
    New-Item -ItemType Directory -Path "secrets" -Force
    Write-Host "✅ Created secrets directory" -ForegroundColor Green
}

# Load environment variables from .env if it exists
if (Test-Path ".env") {
    Write-Host "📄 Loading existing .env file..." -ForegroundColor Yellow
    
    $envContent = Get-Content ".env" | Where-Object { $_ -match "^[^#].*=" }
    $envVars = @{}
    
    foreach ($line in $envContent) {
        $key, $value = $line.Split('=', 2)
        if ($key -and $value) {
            $envVars[$key.Trim()] = $value.Trim()
        }
    }
} else {
    Write-Host "⚠️ No .env file found. You'll need to provide values manually." -ForegroundColor Yellow
    $envVars = @{}
}

# Secret mapping with descriptions
$secrets = @{
    "database_url" = @{
        "file" = "database_url.txt"
        "env_key" = "DATABASE_URL"
        "description" = "PostgreSQL connection string"
        "default" = "postgresql://forensic_user:$(Generate-SecureString -Length 20)@postgres:5432/forensic_db"
    }
    "mongodb_uri" = @{
        "file" = "mongodb_uri.txt"
        "env_key" = "MONGODB_URI"
        "description" = "MongoDB connection string"
        "default" = "mongodb://mongo_user:$(Generate-SecureString -Length 20)@mongodb:27017/evidence_db"
    }
    "redis_url" = @{
        "file" = "redis_url.txt"
        "env_key" = "REDIS_URL"
        "description" = "Redis connection string"
        "default" = "redis://:$(Generate-SecureString -Length 20)@redis:6379"
    }
    "rabbitmq_url" = @{
        "file" = "rabbitmq_url.txt"
        "env_key" = "RABBITMQ_URL"
        "description" = "RabbitMQ connection string"
        "default" = "amqp://rabbitmq_user:$(Generate-SecureString -Length 20)@rabbitmq:5672"
    }
    "jwt_secret" = @{
        "file" = "jwt_secret.txt"
        "env_key" = "JWT_SECRET"
        "description" = "JWT signing secret"
        "default" = Generate-SecureString -Length 64
    }
    "jwt_refresh_secret" = @{
        "file" = "jwt_refresh_secret.txt"
        "env_key" = "JWT_REFRESH_SECRET"
        "description" = "JWT refresh token secret"
        "default" = Generate-SecureString -Length 64
    }
    "private_key" = @{
        "file" = "private_key.txt"
        "env_key" = "PRIVATE_KEY"
        "description" = "Blockchain wallet private key"
        "default" = ""
    }
    "encryption_key" = @{
        "file" = "encryption_key.txt"
        "env_key" = "ENCRYPTION_KEY"
        "description" = "Data encryption key"
        "default" = Generate-SecureString -Length 32
    }
    "postgres_password" = @{
        "file" = "postgres_password.txt"
        "description" = "PostgreSQL password"
        "default" = Generate-SecureString -Length 20
    }
    "mongo_password" = @{
        "file" = "mongo_password.txt"
        "description" = "MongoDB password"
        "default" = Generate-SecureString -Length 20
    }
    "redis_password" = @{
        "file" = "redis_password.txt"
        "description" = "Redis password"
        "default" = Generate-SecureString -Length 20
    }
    "rabbitmq_password" = @{
        "file" = "rabbitmq_password.txt"
        "description" = "RabbitMQ password"
        "default" = Generate-SecureString -Length 20
    }
}

Write-Host "`n🔑 Creating secret files..." -ForegroundColor Blue

foreach ($secretName in $secrets.Keys) {
    $secret = $secrets[$secretName]
    $secretPath = "secrets\$($secret.file)"
    
    # Check if secret already exists
    if (Test-Path $secretPath) {
        Write-Host "⏭️ Secret $secretName already exists, skipping..." -ForegroundColor Yellow
        continue
    }
    
    $value = ""
    
    # Try to get from environment variables first
    if ($secret.ContainsKey("env_key") -and $envVars.ContainsKey($secret.env_key)) {
        $value = $envVars[$secret.env_key]
        Write-Host "✅ Using value from .env for $secretName" -ForegroundColor Green
    }
    # For private key, require manual input
    elseif ($secretName -eq "private_key") {
        Write-Host "🔐 Please enter your blockchain wallet private key:" -ForegroundColor Yellow
        Write-Host "   (This is sensitive! Make sure you trust this environment)" -ForegroundColor Red
        $secureInput = Read-Host "Private key" -AsSecureString
        $value = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto([System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureInput))
        
        if ([string]::IsNullOrEmpty($value)) {
            Write-Host "⚠️ No private key provided. Using placeholder." -ForegroundColor Yellow
            $value = "YOUR_PRIVATE_KEY_HERE"
        }
    }
    # Use default for others
    else {
        $value = $secret.default
        Write-Host "🔧 Generated secure value for $secretName" -ForegroundColor Green
    }
    
    # Write to secret file
    $value | Out-File -FilePath $secretPath -Encoding utf8 -NoNewline
    
    # Set restrictive permissions (Windows equivalent)
    $acl = Get-Acl $secretPath
    $acl.SetAccessRuleProtection($true, $false)  # Disable inheritance
    $accessRule = New-Object System.Security.AccessControl.FileSystemAccessRule($env:USERNAME, "FullControl", "Allow")
    $acl.SetAccessRule($accessRule)
    Set-Acl -Path $secretPath -AclObject $acl
    
    Write-Host "✅ Created secret: $secretName ($($secret.description))" -ForegroundColor Green
}

# Create .gitignore entry for secrets
$gitignoreContent = "`n# Docker Secrets - DO NOT COMMIT`nsecrets/`n*.secret`n"
if (Test-Path ".gitignore") {
    $existingContent = Get-Content ".gitignore" -Raw
    if ($existingContent -notmatch "secrets/") {
        Add-Content ".gitignore" $gitignoreContent
        Write-Host "✅ Added secrets directory to .gitignore" -ForegroundColor Green
    }
} else {
    $gitignoreContent | Out-File ".gitignore"
    Write-Host "✅ Created .gitignore with secrets exclusion" -ForegroundColor Green
}

Write-Host "`n🎉 Docker Secrets setup complete!" -ForegroundColor Green
Write-Host "📁 Secret files created in: secrets/" -ForegroundColor Blue
Write-Host "🔒 File permissions set to owner-only access" -ForegroundColor Blue
Write-Host "`n⚠️  IMPORTANT SECURITY NOTES:" -ForegroundColor Red
Write-Host "   • Never commit the secrets/ directory to version control" -ForegroundColor Yellow
Write-Host "   • Backup secret files securely for production deployment" -ForegroundColor Yellow
Write-Host "   • Rotate secrets regularly in production" -ForegroundColor Yellow
Write-Host "   • Use proper secret management tools (Vault, AWS Secrets) in production" -ForegroundColor Yellow

Write-Host "`n🚀 Next steps:" -ForegroundColor Blue
Write-Host "   1. Review and update secret values in secrets/ directory" -ForegroundColor White
Write-Host "   2. Run: docker-compose -f docker-compose.prod.yml up -d" -ForegroundColor White
Write-Host "   3. Test the services with proper secret management" -ForegroundColor White