# OCR Implementation (Image Analysis)

This document describes how text (OCR) extraction is implemented in the AI Analysis Service and how it is surfaced in the frontend Analysis Report.

## Overview

- Backend: Tesseract OCR via `pytesseract` in `image_processor.py`
- Docker: Installs `tesseract-ocr` and `tesseract-ocr-eng`
- Config flags (in `src/config.py`):
  - `IMAGE_ENABLE_OCR` (default: true) – turns OCR on/off
  - `OCR_LANGUAGE` (default: `eng`) – Tesseract language code(s)
- Frontend: Analysis Report shows a "Detected Text (OCR)" card when text is found

## Backend Details

- File: `microservices/ai-analysis-service/src/processors/image_processor.py`
- Function: `_extract_text_ocr(file_path: str) -> str`
  - Loads the image via PIL, converts to grayscale
  - If the image is tiny (< 200 px min dimension), upsamples to improve OCR
  - Uses `pytesseract.image_to_string` with `lang=OCR_LANGUAGE`
  - Returns trimmed text (may be empty if no text found)
- Result mapping
  - OCR output is added to `technical_metadata.extracted_text` in the `ImageAnalysisResult`
  - Example (Raw JSON):
    ```json
    {
      "results": {
        "technical_metadata": {
          "width": 1280,
          "height": 720,
          "extracted_text": "Example text detected..."
        }
      }
    }
    ```

## Frontend Details

- File: `frontend/src/pages/AnalysisReport.tsx`
- Mapping:
  - `technical_metadata.extracted_text` -> `metadata.extracted.text`
- UI:
  - New card "Detected Text (OCR)" under the Image view
  - Shows extracted text and a Copy button

## Configuration

Edit `microservices/ai-analysis-service/src/config.py`:
```python
IMAGE_ENABLE_OCR: bool = True
OCR_LANGUAGE: str = "eng"
```

Provide additional languages by installing their Tesseract language packs in the Dockerfile and setting `OCR_LANGUAGE` (e.g., `eng+spa`).

## Dependencies

- `requirements-light.txt` adds `pytesseract`
- Dockerfile installs packages:
  - `tesseract-ocr`
  - `tesseract-ocr-eng`

## Rebuild & Run

```bash
# Rebuild the AI service image
docker compose -f docker-compose.dev.yml build ai-analysis-service

# Restart the container
docker compose -f docker-compose.dev.yml up -d ai-analysis-service
```

Submit a new analysis so OCR runs on the newly processed image.

## Troubleshooting

- Empty text
  - The image has no readable text or is too small/low contrast.
  - Try higher-resolution images, or adjust preprocessing (we upsample small images automatically).
- Unsupported language
  - Ensure the language pack is installed in the container and set `OCR_LANGUAGE` accordingly.
- Performance
  - OCR adds minimal overhead for small images, but may be noticeable for very large scans. Consider disabling with `IMAGE_ENABLE_OCR=False` for bulk non-text workloads.

## Security & Compliance Notes

- OCR runs locally in the container; no external calls are made.
- Sensitive data may be extracted (e.g., emails, IDs). Handle outputs according to your data policy.
