# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **Markdown to PowerPoint Converter** web application built with Next.js 15, TypeScript, and Tailwind CSS. The app allows users to upload `.md` files via drag-and-drop and automatically converts them to `.pptx` presentations.

## Key Architecture

### Core Components
- **Frontend**: Single-page React app with drag-and-drop file upload (`src/components/FileUpload.tsx`)
- **API**: Next.js API route that handles file processing (`src/app/api/convert/route.ts`)
- **Main Dependencies**:
  - `markdown-it`: Parses markdown content into tokens
  - `pptxgenjs`: Generates PowerPoint presentations
  - `react-dropzone`: Handles file drag-and-drop functionality

### Conversion Flow
1. User uploads `.md` file via drag-and-drop interface
2. File is sent to `/api/convert` endpoint via FormData
3. API parses markdown using `markdown-it` tokenizer
4. Markdown headings (`#`, `##`, `###`) become slide titles
5. Content under each heading becomes slide content
6. `pptxgenjs` generates PPTX file asynchronously using callback-based API
7. Generated file is returned as download to user

### Important Implementation Details
- **PptxGenJS API**: Use `pptx.write('nodebuffer', callback)` - NOT `pptx.writeSync()` (doesn't exist)
- **Markdown Parsing**: Custom token-based parser that tracks heading levels and collects content
- **File Handling**: API expects FormData with 'file' field containing .md file

## Development Commands

```bash
# Start development server (uses Turbopack)
npm run dev

# Build for production
npm run build

# Start production server
npm start

# Run linting
npm run lint
```

## Testing the Application
1. Start dev server: `npm run dev`
2. Open http://localhost:3000
3. Use the provided `sample.md` file for testing
4. Expected behavior: Markdown headings become slide titles, content becomes slide body text

## Common Issues
- **PptxGenJS Errors**: Always use callback-based `write()` method, never `writeSync()`
- **File Upload**: API expects `.md` files only, validates file extension
- **Markdown Structure**: App requires headings to create slides - plain text without headings won't generate slides