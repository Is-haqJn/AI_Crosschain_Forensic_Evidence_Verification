# Forensic Evidence System - API Documentation

## 📋 Overview

This document provides comprehensive API documentation for the Forensic Evidence System. The system consists of two main services: Evidence Service and AI Analysis Service, each with their own RESTful APIs.

## 🔗 Base URLs

- **Evidence Service**: `http://localhost:3001`
- **AI Analysis Service**: `http://localhost:8001`
- **Production**: `https://evidence.forensic-evidence.local` (Evidence Service)
- **Production**: `https://ai.forensic-evidence.local` (AI Analysis Service)

## 🔐 Authentication

### JWT Authentication
- All API endpoints (except health checks and `/api/v1/auth/*` where noted) require JWT.
- Tokens are issued by the Evidence Service.

```http
Authorization: Bearer <jwt_token>
```

### Token Format
```json
{
  "sub": "user_id",
  "email": "user@example.com",
  "role": "investigator|validator|admin",
  "organization": "organization_name",
  "iat": 1640995200,
  "exp": 1641081600
}
```

### Roles
- **investigator**: Can upload evidence and view own evidence
- **validator**: Can validate evidence and view all evidence
- **admin**: Full system access

### Auth Endpoints (Evidence Service)
```http
POST /api/v1/auth/register
POST /api/v1/auth/login
POST /api/v1/auth/refresh
POST /api/v1/auth/logout
GET  /api/v1/auth/me
```

Request/Responses (summarized):
- Register: body { email, password, name, organization, role? }
- Login: body { email, password } → { token, refreshToken, user } + HttpOnly cookies
- Refresh: body { refreshToken? } or cookie → { token, refreshToken }
- Logout: revokes refresh tokens and clears cookies

---

## 🗂️ Evidence Service API

### Health Endpoints

#### Get Service Health
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "evidence-service",
  "timestamp": "2025-09-11T01:06:02.570Z"
}
```

#### Get Detailed Health
```http
GET /api/v1/detailed
```

**Response:**
```json
{
  "status": "healthy",
  "service": "evidence-service",
  "version": "1.0.0",
  "timestamp": "2025-09-11T01:06:02.570Z",
  "environment": "development",
  "uptime": 85691.70702528954,
  "system": {
    "cpu": {"usage_percent": 100.0, "count": 8},
    "memory": {"total": 16952647680, "available": 3106512896, "used": 13846134784, "percent": 81.7},
    "disk": {"total": 1000186310656, "used": 840924409856, "free": 159261900800, "percent": 84.07677658619987}
  },
  "dependencies": {
    "database": {"healthy": true, "type": "PostgreSQL"},
    "message_queue": {"healthy": true, "type": "RabbitMQ"},
    "redis": {"healthy": true, "type": "Redis"}
  }
}
```

### Evidence Management

#### Upload Evidence
```http
POST /api/v1/evidence/upload
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Request Body:**
```
evidence: <file> (required)
description: string (optional)
type: "IMAGE"|"VIDEO"|"DOCUMENT"|"AUDIO"|"OTHER" (required)
location: string (optional, JSON)
deviceInfo: string (optional, JSON)
tags: string (optional, comma-separated)
```

**Response:**
```json
{
  "success": true,
  "data": {
    "evidenceId": "uuid",
    "ipfsHash": "QmHash...",
    "dataHash": "sha256_hash",
    "status": "UPLOADED",
    "metadata": {
      "filename": "evidence.jpg",
      "filesize": 1024000,
      "mimetype": "image/jpeg",
      "uploadDate": "2025-09-11T01:06:02.570Z"
    },
    "submitter": {
      "userId": "user_id",
      "name": "John Doe",
      "organization": "Police Department",
      "role": "investigator"
    },
    "chainOfCustody": [...],
    "createdAt": "2025-09-11T01:06:02.570Z"
  }
}
```

#### Get Evidence by ID
```http
GET /api/v1/evidence/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "evidenceId": "uuid",
    "ipfsHash": "QmHash...",
    "dataHash": "sha256_hash",
    "status": "ANALYZED",
    "metadata": {...},
    "submitter": {...},
    "chainOfCustody": [...],
    "aiAnalysis": {
      "analysisId": "analysis_uuid",
      "timestamp": "2025-09-11T01:06:02.570Z",
      "results": {...},
      "confidence": 95.5,
      "anomaliesDetected": false
    },
    "blockchainData": {...},
    "tags": ["crime-scene", "digital"],
    "accessControl": [...],
    "createdAt": "2025-09-11T01:06:02.570Z",
    "updatedAt": "2025-09-11T01:06:02.570Z"
  }
}
```

#### Get All Evidence
```http
GET /api/v1/evidence?page=1&limit=10&status=ANALYZED&type=IMAGE&tags=crime-scene
Authorization: Bearer <token>
```

**Query Parameters:**
- `page`: Page number (default: 1)
- `limit`: Items per page (default: 10, max: 100)
- `status`: Filter by status
- `type`: Filter by evidence type
- `tags`: Filter by tags (comma-separated)
- `startDate`: Filter by creation date (ISO 8601)
- `endDate`: Filter by creation date (ISO 8601)
- `sortBy`: Sort field (default: createdAt)
- `sortOrder`: Sort order (asc|desc, default: desc)

**Response:**
```json
{
  "success": true,
  "data": {
    "evidence": [...],
    "pagination": {
      "page": 1,
      "limit": 10,
      "total": 150,
      "pages": 15
    }
  }
}
```

#### Update Evidence Status
```http
PUT /api/v1/evidence/:id/status
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "status": "PROCESSING|ANALYZED|VERIFIED|REJECTED|ARCHIVED",
  "notes": "Status change reason"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "evidenceId": "uuid",
    "status": "ANALYZED",
    "updatedAt": "2025-09-11T01:06:02.570Z",
    "chainOfCustody": [...]
  }
}
```

### AI Analysis Integration

#### Submit Evidence for AI Analysis
```http
POST /api/v1/evidence/:id/ai-analysis
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "analysisType": "image|video|document|audio",
  "priority": 5
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysisId": "analysis_uuid",
    "status": "pending"
  }
}
```

#### Get AI Analysis Results
```http
GET /api/v1/evidence/:id/ai-analysis/results
Authorization: Bearer <token>
```

**Response (Evidence Service wrapper):**
```json
{
  "success": true,
  "data": {
    "analysisId": "analysis_uuid",
    "status": "completed",
    "results": { /* raw AI results mapped as-is or normalized */ },
    "confidence": 95.5,
    "anomaliesDetected": false,
    "processingTime": 45200,
    "completedAt": "2025-09-11T01:06:02.570Z"
  }
}
```

#### Get AI Analysis Status
```http
GET /api/v1/evidence/:id/ai-analysis/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "analysisId": "analysis_uuid",
    "status": "processing",
    "progress": 75,
    "startedAt": "2025-09-11T01:06:02.570Z",
    "estimatedCompletion": "2025-09-11T01:07:02.570Z"
  }
}
```

#### Get Supported AI Analysis Types
```http
GET /api/v1/evidence/ai-analysis/types
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "image": {
      "description": "Image forensics and manipulation detection",
      "supported_formats": ["jpg", "jpeg", "png", "gif", "bmp", "tiff"],
      "features": ["Manipulation detection", "EXIF analysis", "Similarity matching", "Object detection", "Face detection", "Hash analysis"]
    },
    "video": {
      "description": "Video analysis and deepfake detection",
      "supported_formats": ["mp4", "avi", "mov", "wmv", "flv", "mkv"],
      "features": ["Deepfake detection", "Frame analysis", "Motion detection", "Face tracking", "Audio extraction", "Metadata analysis"]
    },
    "document": {
      "description": "Document authenticity and content analysis",
      "supported_formats": ["pdf", "doc", "docx", "txt", "rtf"],
      "features": ["Text extraction", "Authenticity verification", "Metadata analysis", "Language detection", "Content classification", "Plagiarism detection"]
    },
    "audio": {
      "description": "Audio forensics and voice analysis",
      "supported_formats": ["mp3", "wav", "m4a", "flac", "ogg"],
      "features": ["Voice identification", "Audio enhancement", "Noise reduction", "Spectrum analysis", "Speaker verification", "Authenticity check"]
    }
  }
}
```

#### Get AI Service Health
```http
GET /api/v1/evidence/ai-analysis/health
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "healthy": true,
    "details": {
      "status": "healthy",
      "service": "ai-analysis-service",
      "version": "1.0.0"
    }
  }
}
```

### Chain of Custody

#### Transfer Custody
```http
POST /api/v1/evidence/:id/custody
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "newHandler": "user_id",
  "notes": "Transfer reason",
  "signature": "digital_signature"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "evidenceId": "uuid",
    "chainOfCustody": [...]
  }
}
```

#### Get Chain of Custody
```http
GET /api/v1/evidence/:id/custody
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": [
    {
      "handler": "user_id",
      "timestamp": "2025-09-11T01:06:02.570Z",
      "action": "Evidence Created",
      "notes": "Initial upload",
      "signature": "digital_signature"
    }
  ]
}
```

#### Verify Chain of Custody
```http
GET /api/v1/evidence/:id/custody/verify
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "valid": true,
    "issues": []
  }
}
```

#### Update Evidence (metadata/tags/type)
```http
PUT /api/v1/evidence/:id
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body (any subset):**
```json
{
  "description": "Updated description",
  "tags": ["crime-scene", "priority"],
  "type": "IMAGE|VIDEO|DOCUMENT|AUDIO|OTHER",
  "metadata": {
    "location": { "latitude": 37.77, "longitude": -122.42, "address": "SF" },
    "deviceInfo": { "make": "Canon", "model": "5D" }
  }
}
```

**Response:**
```json
{ "success": true, "data": { /* updated evidence */ } }
```

#### Download Evidence File
```http
GET /api/v1/evidence/:id/download
Authorization: Bearer <token>
```

Returns the binary file with appropriate `Content-Type` and `Content-Disposition` headers.

#### Get Evidence Metadata Only
```http
GET /api/v1/evidence/:id/metadata
Authorization: Bearer <token>
```

**Response:**
```json
{ "success": true, "data": { "filename": "...", "filesize": 1234, "mimetype": "image/jpeg", "uploadDate": "...", "description": "..." } }
```

#### Transfer Custody
```http
POST /api/v1/evidence/:id/custody
Authorization: Bearer <token>
Content-Type: application/json
```

**Request Body:**
```json
{
  "newHandler": "user-uuid",
  "notes": "Sealed package transferred",
  "location": { "name": "Main Lab", "address": "123 Lab St" },
  "purpose": "Forensic analysis",
  "method": "In-person handoff",
  "packaging": { "sealId": "SEAL-12345", "condition": "Intact", "tamperEvident": true }
}
```

**Response:**
```json
{
  "success": true,
  "data": { /* updated evidence */ }
}
```

### Blockchain Integration

#### Submit to Blockchain
```http
POST /api/v1/evidence/:id/blockchain
Authorization: Bearer <token>
```

**Request Body:**
```json
{
  "network": "sepolia|amoy"
}
```

**Response:**
```json
{
  "success": true,
  "data": {
    "transactionHash": "0x...",
    "blockNumber": 12345678,
    "chainId": 11155111,
    "contractAddress": "0x...",
    "timestamp": "2025-09-11T01:06:02.570Z",
    "network": "sepolia"
  }
}
```

#### Verify on Blockchain
```http
GET /api/v1/evidence/:id/verify?network=sepolia
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "data": {
    "verified": true,
    "transactionHash": "0x...",
    "blockNumber": 12345678,
    "timestamp": "2025-09-11T01:06:02.570Z",
    "network": "sepolia"
  }
}
```

### Evidence Management

#### Delete Evidence (Soft Delete)
```http
DELETE /api/v1/evidence/:id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Evidence deleted successfully"
}
```

---

## 🤖 AI Analysis Service API

### Health Endpoints

#### Get Service Health
```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "service": "ai-analysis-service",
  "version": "1.0.0"
}
```

#### Get Ready Status
```http
GET /ready
```

**Response:**
```json
{
  "ready": true,
  "services": {
    "database": true,
    "redis": true,
    "message_queue": true
  }
}
```

### Analysis Management

#### Submit Evidence for Analysis
```http
POST /api/v1/submit
Content-Type: multipart/form-data
Authorization: Bearer <token>
```

**Request Body:**
```
evidence_id: string (required)
analysis_type: "image|video|document|audio" (required)
file: <file> (required)
priority: integer (optional, 1-10, default: 5)
metadata: string (optional, JSON)
```

**Response:**
```json
{
  "analysis_id": "analysis_uuid",
  "evidence_id": "evidence_uuid",
  "status": "pending",
  "message": "Analysis submitted successfully",
  "estimated_completion": "2025-09-11T01:07:02.570Z",
  "priority": 5
}
```

#### Get Analysis Status
```http
GET /api/v1/status/:analysis_id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "analysis_id": "analysis_uuid",
  "evidence_id": "evidence_uuid",
  "status": "processing",
  "progress": 75,
  "started_at": "2025-09-11T01:06:02.570Z",
  "completed_at": null,
  "estimated_completion": "2025-09-11T01:07:02.570Z",
  "error_message": null,
  "processing_node": "node-1"
}
```

#### Get Analysis Results
```http
GET /api/v1/results/:analysis_id
Authorization: Bearer <token>
```

**Response (AI service):**
```json
{
  "analysis_id": "analysis_uuid",
  "evidence_id": "evidence_uuid",
  "status": "completed",
  "results": {
    "confidence_score": 0.955,
    "confidence_percent": 96,
    "manipulation_detection": { /* ... */ },
    "technical_metadata": {
      "width": 1280,
      "height": 720,
      "extracted_text": "Example text detected..."
    },
    "detected_objects": [],
    "detected_faces": []
  },
  "processing_time": 45.2,
  "processing_time_ms": 45200,
  "completed_at": "2025-09-11T01:06:47.770Z"
}
```

#### Submit Batch Analysis
```http
POST /api/v1/batch
Authorization: Bearer <token>
```

**Request Body:**
```json
[
  {
    "evidence_id": "evidence_uuid_1",
    "analysis_type": "image",
    "priority": 5,
    "metadata": {...}
  },
  {
    "evidence_id": "evidence_uuid_2",
    "analysis_type": "video",
    "priority": 8,
    "metadata": {...}
  }
]
```

**Response:**
```json
[
  {
    "analysis_id": "analysis_uuid_1",
    "status": "pending",
    "evidence_id": "evidence_uuid_1"
  },
  {
    "analysis_id": "analysis_uuid_2",
    "status": "pending",
    "evidence_id": "evidence_uuid_2"
  }
]
```

#### Cancel Analysis
```http
DELETE /api/v1/cancel/:analysis_id
Authorization: Bearer <token>
```

**Response:**
```json
{
  "success": true,
  "message": "Analysis cancelled successfully"
}
```

### Queue Management

#### Get Queue Status
```http
GET /api/v1/queue/status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "queue_length": 5,
  "processing": 2,
  "completed_today": 150,
  "average_processing_time": 45.2,
  "queue_breakdown": {
    "pending": 3,
    "processing": 2,
    "completed": 150,
    "failed": 2
  }
}
```

### Analysis Types

#### Get Supported Analysis Types
```http
GET /api/v1/types
```

**Response:**
```json
{
  "image": {
    "description": "Image forensics and manipulation detection",
    "supported_formats": ["jpg", "jpeg", "png", "gif", "bmp", "tiff"],
    "features": ["Manipulation detection", "EXIF analysis", "Similarity matching", "Object detection", "Face detection", "Hash analysis"]
  },
  "video": {
    "description": "Video analysis and deepfake detection",
    "supported_formats": ["mp4", "avi", "mov", "wmv", "flv", "mkv"],
    "features": ["Deepfake detection", "Frame analysis", "Motion detection", "Face tracking", "Audio extraction", "Metadata analysis"]
  },
  "document": {
    "description": "Document authenticity and content analysis",
    "supported_formats": ["pdf", "doc", "docx", "txt", "rtf"],
    "features": ["Text extraction", "Authenticity verification", "Metadata analysis", "Language detection", "Content classification", "Plagiarism detection"]
  },
  "audio": {
    "description": "Audio forensics and voice analysis",
    "supported_formats": ["mp3", "wav", "m4a", "flac", "ogg"],
    "features": ["Voice identification", "Audio enhancement", "Noise reduction", "Spectrum analysis", "Speaker verification", "Authenticity check"]
  }
}
```

---

## 📊 Error Responses

### Standard Error Format
```json
{
  "error": "Error Type",
  "message": "Human readable error message",
  "details": {
    "field": "Additional error details",
    "code": "ERROR_CODE"
  },
  "timestamp": "2025-09-11T01:06:02.570Z",
  "path": "/api/v1/evidence/upload"
}
```

### Common HTTP Status Codes

#### 200 OK
- Successful request

#### 201 Created
- Resource created successfully

#### 400 Bad Request
- Invalid request data
- Missing required fields
- Validation errors

#### 401 Unauthorized
- Missing or invalid authentication token
- Token expired

#### 403 Forbidden
- Insufficient permissions
- Access denied

#### 404 Not Found
- Resource not found
- Invalid endpoint

#### 409 Conflict
- Resource already exists
- Duplicate submission

#### 422 Unprocessable Entity
- Validation errors
- Business logic errors

#### 429 Too Many Requests
- Rate limit exceeded

#### 500 Internal Server Error
- Server error
- Unexpected error

#### 503 Service Unavailable
- Service temporarily unavailable
- Maintenance mode

### Error Examples

#### Authentication Error
```json
{
  "error": "Authentication required",
  "message": "No token provided",
  "timestamp": "2025-09-11T01:06:02.570Z"
}
```

#### Validation Error
```json
{
  "error": "Validation Error",
  "message": "Invalid request data",
  "details": {
    "field": "type",
    "message": "Type must be one of: IMAGE, VIDEO, DOCUMENT, AUDIO, OTHER"
  },
  "timestamp": "2025-09-11T01:06:02.570Z"
}
```

#### Permission Error
```json
{
  "error": "Access denied",
  "message": "Insufficient permissions",
  "details": {
    "required_role": "admin",
    "user_role": "investigator"
  },
  "timestamp": "2025-09-11T01:06:02.570Z"
}
```

---

## 🔧 Rate Limiting

### Rate Limits
- **General API**: 100 requests per 15 minutes per IP
- **File Upload**: 10 requests per hour per user
- **AI Analysis**: 5 requests per hour per user
- **Authentication**: 5 requests per minute per IP

### Rate Limit Headers
```http
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

### Rate Limit Exceeded Response
```json
{
  "error": "Rate limit exceeded",
  "message": "Too many requests from this IP, please try again later",
  "retry_after": 900
}
```

---

## 📝 API Versioning

### Version Strategy
- **URL Versioning**: `/api/v1/`
- **Backward Compatibility**: Maintained for at least 2 versions
- **Deprecation Notice**: 6 months advance notice

### Version Headers
```http
API-Version: 1.0
Deprecation: 2025-12-01
Sunset: 2026-06-01
```

---

## 🧪 Testing

### Test Environment
- **Base URL**: `http://localhost:3001` (Evidence Service)
- **Base URL**: `http://localhost:8001` (AI Analysis Service)
- **Test Data**: Available in `/test-data/` directory

### Postman Collection
- **Collection**: Available in `/docs/postman/`
- **Environment**: Test environment variables included

### cURL Examples
```bash
# Health check
curl -X GET http://localhost:3001/health

# Upload evidence (with authentication)
curl -X POST http://localhost:3001/api/v1/evidence/upload \
  -H "Authorization: Bearer <token>" \
  -F "evidence=@test-image.jpg" \
  -F "type=IMAGE" \
  -F "description=Test evidence"

# Get analysis types
curl -X GET http://localhost:8001/api/v1/types
```

---

**Version**: 1.0.0  
**Last Updated**: September 2025  
**API Version**: v1
