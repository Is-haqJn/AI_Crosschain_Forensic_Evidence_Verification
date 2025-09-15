# Cases API

## Create Case
POST /api/v1/cases

Body:
{ "title": "Robbery @ 5th Ave", "description": "Convenience store robbery", "tags": ["robbery","urgent"] }

## List Cases
GET /api/v1/cases?page=1&limit=10&status=OPEN&search=text&tag=urgent

## Get Case
GET /api/v1/cases/:id

## Add Evidence to Case
POST /api/v1/cases/:id/evidence
Body: { "evidenceId": "uuid" }

