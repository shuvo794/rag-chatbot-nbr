import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createRequire } from 'module';
import https from 'https';
import { supabase } from '../db/supabase.js';
import { getEmbedding, chunkText, parsePDF } from '../services/ingestion.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths
const actsPath = path.resolve(__dirname, '../../../VAT-Acts.json');
const rulesPath = path.resolve(__dirname, '../../../VAT-Rules.json');
const tempDir = path.resolve(__dirname, '../../../docs/temp_pdfs');

/**
 * Downloads a file from a URL to a local destination path.
 * Uses an HTTPS agent that ignores self-signed or expired SSL certificates.
 * Supports standard HTTP redirects.
 */
function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    
    // Create an agent that ignores self-signed/expired SSL certificates
    const agent = new https.Agent({
      rejectUnauthorized: false
    });

    https.get(url, { agent }, (response) => {
      // Handle redirects (status codes 3xx)
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        try {
          fs.unlinkSync(dest); // Delete the temp file
        } catch (e) {
          // ignore
        }
        // Recursively follow redirect
        return downloadFile(response.headers.location, dest).then(resolve).catch(reject);
      }

      if (response.statusCode !== 200) {
        file.close();
        try {
          fs.unlinkSync(dest);
        } catch (e) {
          // ignore
        }
        return reject(new Error(`Failed to download: Status Code ${response.statusCode}`));
      }

      response.pipe(file);
      file.on('finish', () => {
        file.close();
        resolve();
      });
    }).on('error', (err) => {
      file.close();
      try {
        if (fs.existsSync(dest)) {
          fs.unlinkSync(dest);
        }
      } catch (e) {
        // ignore
      }
      reject(err);
    });
  });
}

async function main() {
  console.log(`\n--- Starting NBR JSON PDF Ingestion Pipeline ---`);
  
  // Ensure temp download directory exists
  if (!fs.existsSync(tempDir)) {
    console.log(`Creating temp PDF directory: ${tempDir}`);
    fs.mkdirSync(tempDir, { recursive: true });
  }

  const documentsToProcess = [];

  // Parse Acts
  if (fs.existsSync(actsPath)) {
    console.log(`Reading Acts from: ${actsPath}`);
    const acts = JSON.parse(fs.readFileSync(actsPath, 'utf8'));
    for (const item of acts) {
      const title = item['Act Title']?.text;
      const url = item['Act Title']?.href;
      if (title && url) {
        documentsToProcess.push({ title, url, type: 'Act' });
      }
    }
  } else {
    console.warn(`⚠️ VAT-Acts.json not found at ${actsPath}`);
  }

  // Parse Rules
  if (fs.existsSync(rulesPath)) {
    console.log(`Reading Rules from: ${rulesPath}`);
    const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
    for (const item of rules) {
      const title = item['Title']?.text;
      const url = item['Title']?.href;
      if (title && url) {
        documentsToProcess.push({ title, url, type: 'Rule' });
      }
    }
  } else {
    console.warn(`⚠️ VAT-Rules.json not found at ${rulesPath}`);
  }

  console.log(`Found total of ${documentsToProcess.length} documents in JSON definitions.`);

  for (const doc of documentsToProcess) {
    const { title, url, type } = doc;
    console.log(`\n--------------------------------------------------`);
    console.log(`Processing [${type}]: "${title}"`);
    console.log(`URL: ${url}`);

    // Check if the URL points to a PDF
    if (!url.toLowerCase().endsWith('.pdf')) {
      console.warn(`⚠️ Skipping: Not a PDF file (e.g., .doc or other format).`);
      continue;
    }

    // Generate collision-free filename
    const urlObj = new URL(url);
    const originalFilename = path.basename(urlObj.pathname);
    const localFilename = `${type.toLowerCase()}_${originalFilename}`;
    const destPath = path.join(tempDir, localFilename);

    // Download PDF if it doesn't exist
    if (fs.existsSync(destPath)) {
      console.log(`ℹ️ File already exists locally: ${localFilename}. Skipping download.`);
    } else {
      try {
        console.log(`Downloading: ${url} -> ${destPath}`);
        await downloadFile(url, destPath);
        console.log(`✅ Download completed successfully.`);
      } catch (downloadError) {
        console.error(`❌ Failed to download PDF:`, downloadError.message);
        continue;
      }
    }

    // Parse PDF
    let text = '';
    try {
      console.log(`Parsing PDF file content...`);
      text = await parsePDF(destPath);
      const wordCount = text.trim().split(/\s+/).length;
      console.log(`✅ Parsed PDF successfully. Word count: ${wordCount}`);
      if (wordCount < 10) {
        console.warn(`⚠️ Warning: Extracted text is very short. This PDF might be scanned or empty.`);
      }
    } catch (parseError) {
      console.error(`❌ Failed to parse PDF:`, parseError.message);
      continue;
    }

    // Clean up existing chunks in Supabase for this document to prevent duplicate entries
    try {
      console.log(`Cleaning up old database chunks for "${title}"...`);
      const { error: deleteError } = await supabase
        .from('documents')
        .delete()
        .eq('metadata->>source', title);

      if (deleteError) {
        console.warn(`⚠️ Warning during deletion:`, deleteError.message);
      } else {
        console.log(`✅ Cleaned up existing chunks.`);
      }
    } catch (dbDeleteError) {
      console.warn(`⚠️ Database delete error (ignored):`, dbDeleteError.message || dbDeleteError);
    }

    // Chunk text
    console.log(`Chunking text...`);
    const chunks = chunkText(text, 700, 70); // sensible overlapping chunks (700 words, 70 overlap)
    console.log(`Generated ${chunks.length} chunks.`);

    const rows = [];
    for (let index = 0; index < chunks.length; index++) {
      const chunk = chunks[index];
      try {
        console.log(`Generating embedding for chunk ${index + 1}/${chunks.length}...`);
        const embedding = await getEmbedding(chunk);
        rows.push({
          content: chunk,
          metadata: { 
            source: title, 
            url: url,
            type: type,
            chunk_index: index 
          },
          embedding: embedding
        });
      } catch (embedError) {
        console.error(`❌ Failed to generate embedding for chunk ${index + 1}:`, embedError.message || embedError);
      }
    }

    // Insert chunks into Supabase
    if (rows.length > 0) {
      try {
        console.log(`Storing ${rows.length} chunks in Supabase documents table...`);
        const { error: insertError } = await supabase
          .from('documents')
          .insert(rows);

        if (insertError) {
          console.error(`❌ Supabase insertion failed:`, insertError.message);
        } else {
          console.log(`✅ Successfully stored ${rows.length} chunks in Supabase.`);
        }
      } catch (insertError) {
        console.error(`❌ Error during insertion:`, insertError.message || insertError);
      }
    } else {
      console.warn(`⚠️ No chunks were generated/embedded for this file.`);
    }
  }

  console.log(`\n--- NBR JSON PDF Ingestion Pipeline Complete ---\n`);
}

main().catch((err) => {
  console.error(`❌ Script failed:`, err);
  process.exit(1);
});
