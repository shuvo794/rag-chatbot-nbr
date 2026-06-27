import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { createWorker } from 'tesseract.js';
import { pipeline } from '@xenova/transformers';
import { supabase } from '../db/supabase.js';

const require = createRequire(import.meta.url);
const { PDFParse } = require('pdf-parse');


let extractor = null;

/**
 * Generates vector embeddings for a given text using a local model.
 * 
 * @param {string} text - The input text.
 * @returns {Promise<number[]>} Float array of dimensions.
 */
export async function getEmbedding(text) {
  if (!extractor) {
    console.log('Loading local embedding model (Xenova/all-MiniLM-L6-v2)...');
    // Disable offline loading warning for downloading
    extractor = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Embedding model loaded successfully.');
  }
  const output = await extractor(text, { pooling: 'mean', normalize: true });
  return Array.from(output.data);
}

/**
 * Splits text into overlapping chunks of a specified size (measured in words).
 * 
 * @param {string} text - The input text to chunk.
 * @param {number} chunkSize - Number of words per chunk.
 * @param {number} overlap - Number of overlapping words between consecutive chunks.
 * @returns {string[]} Array of text chunks.
 */
export function chunkText(text, chunkSize = 500, overlap = 50) {
  if (!text) return [];
  
  // Standardize whitespace and split by space characters
  const words = text.trim().replace(/\s+/g, ' ').split(' ');
  const chunks = [];
  
  if (words.length <= chunkSize) {
    return [words.join(' ')];
  }

  let i = 0;
  while (i < words.length) {
    const chunkWords = words.slice(i, i + chunkSize);
    if (chunkWords.length === 0) break;
    
    chunks.push(chunkWords.join(' '));
    
    // Advance index by the step size
    i += (chunkSize - overlap);
    
    // Safety check to avoid infinite loop
    if (chunkSize <= overlap) {
      i += chunkSize;
    }
  }
  
  return chunks;
}

/**
 * Parses a PDF file and extracts its text.
 * 
 * @param {string} filePath - Path to the PDF file.
 * @returns {Promise<string>} Extracted text.
 */
async function parsePDF(filePath) {
  const dataBuffer = fs.readFileSync(filePath);
  const parser = new PDFParse(new Uint8Array(dataBuffer));
  const result = await parser.getText();
  return result.text;
}

/**
 * Performs OCR on an image file to extract text.
 * 
 * @param {string} filePath - Path to the image file.
 * @returns {Promise<string>} Extracted text.
 */
async function parseImage(filePath) {
  // Initialize tesseract worker for bilingual (English & Bengali) OCR
  const worker = await createWorker('eng+ben');
  const { data: { text } } = await worker.recognize(filePath);
  await worker.terminate();
  return text;
}

/**
 * Main function to ingest files from the docs directory, extract text, and chunk it.
 */
export async function ingestDocs() {
  // Resolve docs directory path (checks root level and falls back to backend level)
  const rootDocsPath = path.resolve('../docs');
  const backendDocsPath = path.resolve('./docs');
  const docsDir = fs.existsSync(rootDocsPath) ? rootDocsPath : backendDocsPath;

  console.log(`\n--- Starting Document Ingestion Pipeline ---`);
  console.log(`Scanning directory: ${docsDir}`);

  if (!fs.existsSync(docsDir)) {
    console.error(`Error: Ingestion folder does not exist at either ${rootDocsPath} or ${backendDocsPath}. Please create one of these folders.`);
    return;
  }

  const files = fs.readdirSync(docsDir);
  const supportedExtensions = ['.pdf', '.png', '.jpg', '.jpeg'];
  const filesToProcess = files.filter(file => 
    supportedExtensions.includes(path.extname(file).toLowerCase())
  );

  if (filesToProcess.length === 0) {
    console.log('No supported documents found in the docs directory (.pdf, .png, .jpg, .jpeg).');
    return;
  }

  console.log(`Found ${filesToProcess.length} file(s) to process.`);

  for (const file of filesToProcess) {
    const filePath = path.join(docsDir, file);
    const ext = path.extname(file).toLowerCase();
    let extractedText = '';

    console.log(`\nProcessing: "${file}"...`);

    try {
      if (ext === '.pdf') {
        extractedText = await parsePDF(filePath);
      } else {
        extractedText = await parseImage(filePath);
      }

      const wordCount = extractedText.trim().split(/\s+/).length;
      console.log(`Successfully extracted ${wordCount} words from "${file}".`);

      // Chunk the text
      const chunks = chunkText(extractedText, 500, 50);
      console.log(`Generated ${chunks.length} chunks from "${file}".`);

      const rows = [];
      for (let index = 0; index < chunks.length; index++) {
        const chunk = chunks[index];
        console.log(`Generating embedding for chunk ${index + 1}/${chunks.length}...`);
        try {
          const embedding = await getEmbedding(chunk);
          rows.push({
            content: chunk,
            metadata: { source: file, chunk_index: index },
            embedding: embedding
          });
        } catch (embedError) {
          console.error(`Failed to generate embedding for chunk ${index + 1}:`, embedError);
        }
      }

      if (rows.length > 0) {
        console.log(`Inserting ${rows.length} chunks into Supabase...`);
        const { error } = await supabase
          .from('documents')
          .insert(rows);

        if (error) {
          throw error;
        }
        console.log(`Successfully stored ${rows.length} chunks from "${file}" in Supabase.`);
      }

    } catch (error) {
      console.error(`Error processing file "${file}":`, error.message || error);
    }
  }

  console.log(`\n--- Document Ingestion Complete ---`);
}

// If executed directly (e.g., node src/services/ingestion.js)
const isDirectRun = process.argv[1] && (
  process.argv[1].endsWith('ingestion.js') || 
  process.argv[1].endsWith('ingestion')
);

if (isDirectRun) {
  ingestDocs();
}
