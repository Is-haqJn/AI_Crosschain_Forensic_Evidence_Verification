# Forensic Evidence System - Development Guide

## 📋 Overview

This guide provides comprehensive instructions for setting up a development environment, understanding the codebase architecture, and contributing to the Forensic Evidence System.

## 🛠️ Development Environment Setup

### Prerequisites
- **Node.js**: 22.0.0 or higher
- **Python**: 3.13 or higher
- **Docker**: 24.0 or higher
- **Docker Compose**: 2.20 or higher
- **Git**: 2.40 or higher
- **IDE**: VS Code (recommended) with extensions:
  - TypeScript and JavaScript Language Features
  - Python
  - Docker
  - Kubernetes

### Step 1: Clone Repository
```bash
git clone <repository-url>
cd forensic-evidence-system
```

### Step 2: Install Dependencies

#### Evidence Service (Node.js/TypeScript)
```bash
cd microservices/evidence-service
npm install
```

#### AI Analysis Service (Python)
```bash
cd microservices/ai-analysis-service
pip install -r requirements.txt
# For OCR locally, install Tesseract on host (optional):
#   - macOS: brew install tesseract
#   - Ubuntu/Debian: sudo apt-get install tesseract-ocr tesseract-ocr-eng
```

### Step 3: Environment Configuration

#### Create Environment Files
```bash
# Evidence Service
cp microservices/evidence-service/.env.example microservices/evidence-service/.env

# AI Analysis Service
cp microservices/ai-analysis-service/.env.example microservices/ai-analysis-service/.env
```

#### Environment Variables
```bash
# Evidence Service (.env)
NODE_ENV=development
PORT=3001
DATABASE_URL=postgresql://forensic_user:forensic_pass@localhost:5432/forensic_db
MONGODB_URI=mongodb://mongo_user:mongo_pass@localhost:27017/evidence_db
REDIS_URL=redis://:redis_pass@localhost:6379
RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@localhost:5672
JWT_SECRET=your-development-jwt-secret
AI_SERVICE_URL=http://localhost:8001

# AI Analysis Service (.env)
DATABASE_URL=postgresql://forensic_user:forensic_pass@localhost:5432/forensic_db
MONGODB_URI=mongodb://mongo_user:mongo_pass@localhost:27017/evidence_db
REDIS_URL=redis://:redis_pass@localhost:6379
RABBITMQ_URL=amqp://rabbitmq_user:rabbitmq_pass@localhost:5672
JWT_SECRET=your-development-jwt-secret
TF_ENABLE_ONEDNN_OPTS=0
# OCR
IMAGE_ENABLE_OCR=true
OCR_LANGUAGE=eng
# Optional object detection (requires model weights under MODEL_PATH)
IMAGE_ENABLE_OBJECT_DETECTION=false
```

### Step 4: Start Infrastructure Services
```bash
# Start databases and message queues
docker-compose -f docker-compose.infrastructure.yml up -d

# Verify services
docker-compose -f docker-compose.infrastructure.yml ps
```

### Step 5: Start Development Servers

#### Terminal 1: AI Analysis Service
```bash
cd microservices/ai-analysis-service
python main.py
```

#### Terminal 2: Evidence Service
```bash
cd microservices/evidence-service
npm run dev
```

### Step 6: Verify Setup
```bash
# Check Evidence Service
curl http://localhost:3001/health

# Check AI Analysis Service
curl http://localhost:8001/health

# Check AI Analysis Types
curl http://localhost:8001/api/v1/types
```

---

## 🏗️ Codebase Architecture

### Project Structure
```
forensic-evidence-system/
├── docs/                          # Documentation
├── microservices/
│   ├── evidence-service/          # Evidence Management Service
│   │   ├── src/
│   │   │   ├── controllers/       # HTTP request handlers
│   │   │   ├── services/          # Business logic
│   │   │   ├── models/            # Data models
│   │   │   ├── routes/            # API routes
│   │   │   ├── middleware/        # Custom middleware
│   │   │   ├── config/            # Configuration
│   │   │   └── utils/             # Utility functions
│   │   ├── k8s/                   # Kubernetes manifests
│   │   ├── Dockerfile             # Container configuration
│   │   └── package.json           # Dependencies
│   └── ai-analysis-service/       # AI Analysis Service
│       ├── src/
│       │   ├── api/               # FastAPI routers
│       │   ├── services/          # Business logic
│       │   ├── models/            # Pydantic models
│       │   ├── processors/        # AI processors
│       │   ├── middleware/        # Custom middleware
│       │   └── utils/             # Utility functions
│       ├── k8s/                   # Kubernetes manifests
│       ├── Dockerfile             # Container configuration
│       └── requirements.txt       # Dependencies
├── docker-compose.infrastructure.yml
└── README.md
```

### Evidence Service Architecture

#### Controllers Layer
```typescript
// src/controllers/EvidenceController.ts
export class EvidenceController {
  private evidenceService: EvidenceService;
  private blockchainService: BlockchainService;
  
  public async uploadEvidence(req: AuthRequest, res: Response): Promise<void> {
    // Handle file upload requests
  }
  
  public async getEvidence(req: AuthRequest, res: Response): Promise<void> {
    // Handle evidence retrieval requests
  }
}
```

#### Services Layer
```typescript
// src/services/EvidenceService.ts
export class EvidenceService {
  private ipfsManager: IPFSManager;
  private aiAnalysisService: AIAnalysisIntegrationService;
  
  public async createEvidence(data: any): Promise<IEvidence> {
    // Business logic for evidence creation
  }
  
  public async triggerAIAnalysis(evidence: IEvidence, file: any): Promise<void> {
    // AI analysis integration
  }
}
```

#### Models Layer
```typescript
// src/models/Evidence.model.ts
export interface IEvidence extends Document {
  evidenceId: string;
  ipfsHash: string;
  dataHash: string;
  metadata: EvidenceMetadata;
  type: EvidenceType;
  status: EvidenceStatus;
  submitter: SubmitterInfo;
  chainOfCustody: CustodyEntry[];
  aiAnalysis?: AIAnalysisResult;
  blockchainData?: BlockchainData;
  // ... other fields
}
```

### AI Analysis Service Architecture

#### API Layer
```python
# src/api/analysis_router.py
@analysis_router.post("/submit")
async def submit_analysis(
    evidence_id: str = Form(...),
    analysis_type: str = Form(...),
    file: UploadFile = File(...),
    priority: int = Form(5),
    metadata: Optional[str] = Form(None),
    user_token: str = Depends(get_current_user)
):
    # Handle analysis submission
```

#### Services Layer
```python
# src/services/analysis_service.py
class AnalysisService:
    def __init__(self):
        self.model_manager = get_model_manager()
        self.queue_manager = MessageQueueManager()
    
    async def submit_analysis(self, request: AnalysisRequest) -> AnalysisResponse:
        # Business logic for analysis submission
```

#### Processors Layer
```python
# src/processors/image_processor.py
class ImageProcessor:
    def __init__(self):
        self.manipulation_detector = load_manipulation_model()
        self.face_detector = load_face_detection_model()
    
    async def analyze(self, image_data: bytes) -> ImageAnalysisResult:
        # AI analysis logic
```

---

## 🔧 Development Workflow

### Git Workflow
```bash
# Create feature branch
git checkout -b feature/your-feature-name

# Make changes and commit
git add .
git commit -m "feat: add new feature"

# Push branch
git push origin feature/your-feature-name

# Create pull request
# Merge after review
```

### Code Standards

#### TypeScript/Node.js
```typescript
// Use strict typing
interface EvidenceRequest {
  evidenceId: string;
  type: EvidenceType;
  metadata: EvidenceMetadata;
}

// Use async/await
public async createEvidence(data: EvidenceRequest): Promise<IEvidence> {
  try {
    const evidence = await this.evidenceService.create(data);
    return evidence;
  } catch (error) {
    this.logger.error('Failed to create evidence', error);
    throw error;
  }
}

// Use proper error handling
if (!evidence) {
  throw new AppError('Evidence not found', 404);
}
```

#### Python
```python
# Use type hints
from typing import Optional, List, Dict, Any

async def submit_analysis(
    evidence_id: str,
    analysis_type: str,
    file_data: bytes
) -> AnalysisResponse:
    """Submit evidence for AI analysis."""
    try:
        result = await analysis_service.process(evidence_id, analysis_type, file_data)
        return result
    except Exception as e:
        logger.error(f"Analysis failed: {e}")
        raise AnalysisError(f"Analysis failed: {e}")

# Use Pydantic models
class AnalysisRequest(BaseModel):
    evidence_id: str
    analysis_type: str
    priority: int = 5
    metadata: Optional[Dict[str, Any]] = None
```

### Testing

#### Unit Tests
```typescript
// Evidence Service Tests
describe('EvidenceService', () => {
  let evidenceService: EvidenceService;
  
  beforeEach(() => {
    evidenceService = new EvidenceService();
  });
  
  it('should create evidence successfully', async () => {
    const evidenceData = {
      file: mockFile,
      type: EvidenceType.IMAGE,
      submitter: mockSubmitter
    };
    
    const result = await evidenceService.createEvidence(evidenceData);
    
    expect(result.evidenceId).toBeDefined();
    expect(result.status).toBe(EvidenceStatus.UPLOADED);
  });
});
```

```python
# AI Analysis Service Tests
import pytest
from src.services.analysis_service import AnalysisService

class TestAnalysisService:
    @pytest.fixture
    def analysis_service(self):
        return AnalysisService()
    
    @pytest.mark.asyncio
    async def test_submit_analysis(self, analysis_service):
        request = AnalysisRequest(
            evidence_id="test-id",
            analysis_type="image",
            file_data=b"test-image-data"
        )
        
        result = await analysis_service.submit_analysis(request)
        
        assert result.analysis_id is not None
        assert result.status == "pending"
```

#### Integration Tests
```typescript
// API Integration Tests
describe('Evidence API', () => {
  it('should upload evidence and trigger AI analysis', async () => {
    const response = await request(app)
      .post('/api/v1/evidence/upload')
      .set('Authorization', `Bearer ${validToken}`)
      .attach('evidence', 'test-files/sample-image.jpg')
      .field('type', 'IMAGE')
      .field('description', 'Test evidence');
    
    expect(response.status).toBe(200);
    expect(response.body.data.evidenceId).toBeDefined();
    expect(response.body.data.status).toBe('UPLOADED');
  });
});
```

### Running Tests
```bash
# Evidence Service Tests
cd microservices/evidence-service
npm test
npm run test:watch
npm run test:coverage

# AI Analysis Service Tests
cd microservices/ai-analysis-service
pytest
pytest --cov=src
pytest -v
```

---

## 🔍 Debugging

### VS Code Configuration

#### Launch Configuration
```json
// .vscode/launch.json
{
  "version": "0.2.0",
  "configurations": [
    {
      "name": "Debug Evidence Service",
      "type": "node",
      "request": "launch",
      "program": "${workspaceFolder}/microservices/evidence-service/dist/index.js",
      "env": {
        "NODE_ENV": "development"
      },
      "console": "integratedTerminal",
      "restart": true,
      "protocol": "inspector"
    },
    {
      "name": "Debug AI Analysis Service",
      "type": "python",
      "request": "launch",
      "program": "${workspaceFolder}/microservices/ai-analysis-service/src/main.py",
      "env": {
        "PYTHONPATH": "${workspaceFolder}/microservices/ai-analysis-service/src"
      },
      "console": "integratedTerminal"
    }
  ]
}
```

#### Debugging Tips
```typescript
// Use structured logging
this.logger.debug('Processing evidence', {
  evidenceId,
  type: evidence.type,
  submitter: evidence.submitter.userId
});

// Use breakpoints in VS Code
// Set breakpoints by clicking in the gutter
// Use debug console for variable inspection
```

### Logging

#### Evidence Service Logging
```typescript
// src/utils/Logger.ts
export class Logger {
  private static instance: Logger;
  private winston: winston.Logger;
  
  public info(message: string, meta?: any): void {
    this.winston.info(message, meta);
  }
  
  public error(message: string, error?: any): void {
    this.winston.error(message, { error: error?.message, stack: error?.stack });
  }
}
```

#### AI Analysis Service Logging
```python
# src/utils/logger.py
import logging
import json
from typing import Any, Dict

class StructuredLogger:
    def __init__(self, name: str):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(logging.INFO)
    
    def info(self, message: str, **kwargs: Any) -> None:
        self.logger.info(json.dumps({
            "message": message,
            "level": "info",
            **kwargs
        }))
    
    def error(self, message: str, **kwargs: Any) -> None:
        self.logger.error(json.dumps({
            "message": message,
            "level": "error",
            **kwargs
        }))
```

---

## 🚀 Performance Optimization

### Database Optimization

#### Connection Pooling
```typescript
// Evidence Service
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
});
```

```python
# AI Analysis Service
from sqlalchemy import create_engine
from sqlalchemy.pool import QueuePool

engine = create_engine(
    DATABASE_URL,
    poolclass=QueuePool,
    pool_size=20,
    max_overflow=30,
    pool_pre_ping=True
)
```

#### Query Optimization
```typescript
// Use indexes
EvidenceSchema.index({ 'submitter.userId': 1, createdAt: -1 });
EvidenceSchema.index({ status: 1, type: 1 });
EvidenceSchema.index({ tags: 1 });

// Use projections
const evidence = await Evidence.findOne(
  { evidenceId },
  'evidenceId status metadata submitter createdAt'
);
```

### Caching Strategy

#### Redis Caching
```typescript
// Evidence Service
export class RedisCache {
  public async get<T>(key: string): Promise<T | null> {
    const value = await this.redis.get(key);
    return value ? JSON.parse(value) : null;
  }
  
  public async set(key: string, value: any, ttl: number = 3600): Promise<void> {
    await this.redis.setex(key, ttl, JSON.stringify(value));
  }
}
```

#### AI Analysis Caching
```python
# AI Analysis Service
class AnalysisCache:
    def __init__(self, redis_client):
        self.redis = redis_client
    
    async def get_analysis_result(self, analysis_id: str) -> Optional[Dict]:
        result = await self.redis.get(f"analysis:{analysis_id}")
        return json.loads(result) if result else None
    
    async def cache_analysis_result(self, analysis_id: str, result: Dict, ttl: int = 3600):
        await self.redis.setex(f"analysis:{analysis_id}", ttl, json.dumps(result))
```

### Memory Management

#### Node.js Memory Optimization
```typescript
// Use streams for large files
import { createReadStream } from 'fs';
import { pipeline } from 'stream/promises';

const processLargeFile = async (filePath: string) => {
  const readStream = createReadStream(filePath);
  const processStream = new Transform({
    transform(chunk, encoding, callback) {
      // Process chunk
      callback(null, processedChunk);
    }
  });
  
  await pipeline(readStream, processStream);
};
```

#### Python Memory Optimization
```python
# Use generators for large datasets
def process_large_dataset(data):
    for item in data:
        yield process_item(item)

# Use context managers
async with aiofiles.open(file_path, 'rb') as f:
    async for chunk in f:
        await process_chunk(chunk)
```

---

## 🔒 Security Best Practices

### Input Validation
```typescript
// Evidence Service
const evidenceSchema = Joi.object({
  type: Joi.string().valid('IMAGE', 'VIDEO', 'DOCUMENT', 'AUDIO', 'OTHER').required(),
  description: Joi.string().max(1000).optional(),
  tags: Joi.string().optional()
});

const { error } = evidenceSchema.validate(req.body);
if (error) {
  throw new AppError(error.details[0].message, 400);
}
```

```python
# AI Analysis Service
from pydantic import BaseModel, validator, Field

class AnalysisRequest(BaseModel):
    evidence_id: str = Field(..., min_length=1, max_length=100)
    analysis_type: str = Field(..., regex="^(image|video|document|audio)$")
    priority: int = Field(5, ge=1, le=10)
    
    @validator('evidence_id')
    def validate_evidence_id(cls, v):
        if not v.isalnum():
            raise ValueError('Evidence ID must be alphanumeric')
        return v
```

### Authentication & Authorization
```typescript
// JWT Middleware
export class AuthMiddleware {
  public authenticate(req: AuthRequest, res: Response, next: NextFunction): void {
    const token = req.headers.authorization?.replace('Bearer ', '');
    
    if (!token) {
      throw new AppError('Authentication required', 401);
    }
    
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET!) as JWTPayload;
      req.user = decoded;
      next();
    } catch (error) {
      throw new AppError('Invalid token', 401);
    }
  }
  
  public authorize(roles: string[]) {
    return (req: AuthRequest, res: Response, next: NextFunction) => {
      if (!roles.includes(req.user.role)) {
        throw new AppError('Access denied', 403);
      }
      next();
    };
  }
}
```

### File Upload Security
```typescript
// File validation
const allowedMimeTypes = [
  'image/jpeg', 'image/png', 'image/gif',
  'video/mp4', 'video/avi', 'video/mov',
  'application/pdf', 'text/plain'
];

const maxFileSize = 100 * 1024 * 1024; // 100MB

if (!allowedMimeTypes.includes(file.mimetype)) {
  throw new AppError('File type not allowed', 400);
}

if (file.size > maxFileSize) {
  throw new AppError('File too large', 400);
}
```

---

## 📊 Monitoring & Observability

### Health Checks
```typescript
// Evidence Service Health Check
export class HealthService {
  public async getHealthStatus(): Promise<HealthStatus> {
    const checks = await Promise.allSettled([
      this.checkDatabase(),
      this.checkRedis(),
      this.checkMessageQueue(),
      this.checkIPFS()
    ]);
    
    return {
      status: checks.every(check => check.status === 'fulfilled') ? 'healthy' : 'unhealthy',
      services: {
        database: checks[0].status === 'fulfilled',
        redis: checks[1].status === 'fulfilled',
        messageQueue: checks[2].status === 'fulfilled',
        ipfs: checks[3].status === 'fulfilled'
      }
    };
  }
}
```

### Metrics Collection
```typescript
// Prometheus Metrics
import { register, Counter, Histogram, Gauge } from 'prom-client';

const evidenceUploads = new Counter({
  name: 'evidence_uploads_total',
  help: 'Total number of evidence uploads',
  labelNames: ['type', 'status']
});

const analysisDuration = new Histogram({
  name: 'analysis_duration_seconds',
  help: 'Duration of AI analysis',
  labelNames: ['analysis_type']
});

const activeAnalyses = new Gauge({
  name: 'active_analyses',
  help: 'Number of active analyses'
});
```

---

## 🧪 Testing Strategies

### Test Categories

#### Unit Tests
- **Purpose**: Test individual functions and methods
- **Coverage**: Business logic, utilities, models
- **Tools**: Jest (Node.js), pytest (Python)

#### Integration Tests
- **Purpose**: Test service interactions
- **Coverage**: API endpoints, database operations, external services
- **Tools**: Supertest (Node.js), httpx (Python)

#### End-to-End Tests
- **Purpose**: Test complete user workflows
- **Coverage**: Full system functionality
- **Tools**: Playwright, Cypress

### Test Data Management
```typescript
// Test fixtures
export const mockEvidence = {
  evidenceId: 'test-evidence-id',
  type: EvidenceType.IMAGE,
  status: EvidenceStatus.UPLOADED,
  submitter: {
    userId: 'test-user-id',
    name: 'Test User',
    organization: 'Test Org',
    role: 'investigator'
  }
};

export const mockFile = {
  fieldname: 'evidence',
  originalname: 'test-image.jpg',
  mimetype: 'image/jpeg',
  size: 1024000,
  buffer: Buffer.from('fake-image-data')
};
```

---

## 📚 Additional Resources

### Documentation
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [FastAPI Documentation](https://fastapi.tiangolo.com/)
- [MongoDB Node.js Driver](https://mongodb.github.io/node-mongodb-native/)
- [PostgreSQL Node.js](https://node-postgres.com/)

### Tools
- [VS Code Extensions](https://code.visualstudio.com/docs/editor/extension-marketplace)
- [Postman](https://www.postman.com/) - API testing
- [Docker Desktop](https://www.docker.com/products/docker-desktop)
- [k9s](https://k9scli.io/) - Kubernetes management

### Best Practices
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)
- [Python Best Practices](https://docs.python-guide.org/)
- [REST API Design](https://restfulapi.net/)
- [Microservices Patterns](https://microservices.io/)

---

**Version**: 1.0.0  
**Last Updated**: September 2025  
**Maintainer**: Forensic Evidence System Team
