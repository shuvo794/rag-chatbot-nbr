import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { supabase } from './src/db/supabase.js';

import { ingestDocs, getEmbedding } from './src/services/ingestion.js';
import OpenAI from 'openai';
import { llmConfig } from './src/config/llm.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Dynamically reads the Acts and Rules JSON files and returns an array of all document titles.
 */
function getDocumentRegistry() {
  const registry = [];
  try {
    const actsPath = path.resolve(__dirname, '../VAT-Acts.json');
    const rulesPath = path.resolve(__dirname, '../VAT-Rules.json');

    if (fs.existsSync(actsPath)) {
      const acts = JSON.parse(fs.readFileSync(actsPath, 'utf8'));
      for (const item of acts) {
        const title = item['Act Title']?.text;
        if (title) registry.push(title);
      }
    }

    if (fs.existsSync(rulesPath)) {
      const rules = JSON.parse(fs.readFileSync(rulesPath, 'utf8'));
      for (const item of rules) {
        const title = item['Title']?.text;
        if (title) registry.push(title);
      }
    }
  } catch (error) {
    console.error('Error reading document registry:', error);
  }
  return registry;
}

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: "Hello World from RAG Chatbot Backend!" });
});

app.get('/api/config', (req, res) => {
  res.json({ model: llmConfig.model });
});

// Authentication middleware to check against optional CHAT_PASSWORD
const checkAuth = (req, res, next) => {
  const chatPassword = process.env.CHAT_PASSWORD;
  if (!chatPassword) {
    return next(); // Auth not enabled in env
  }

  const authHeader = req.headers.authorization;
  if (!authHeader || authHeader !== chatPassword) {
    return res.status(401).json({ error: "Unauthorized: Invalid or missing CHAT_PASSWORD passcode." });
  }
  next();
};

app.post('/api/ingest', checkAuth, async (req, res) => {
  try {
    await ingestDocs();
    res.json({ success: true, message: "Ingestion pipeline completed successfully." });
  } catch (error) {
    console.error("Ingestion endpoint error:", error);
    res.status(500).json({ success: false, error: error.message || error });
  }
});

/**
 * Retries a promise-returning function with exponential backoff if it hits a 429 status code.
 *
 * @param {Function} fn - Function returning a promise to execute.
 * @param {number} retries - Maximum retries.
 * @param {number} delay - Base delay in milliseconds.
 */
async function retryWithBackoff(fn, retries = 3, delay = 2000) {
  try {
    return await fn();
  } catch (error) {
    const isRateLimit = error.status === 429 || 
                        error.statusCode === 429 || 
                        (error.message && error.message.includes('429')) ||
                        (error.message && error.message.toLowerCase().includes('rate limit'));
    if (isRateLimit && retries > 0) {
      console.warn(`[LLM API Rate Limit 429] Retrying in ${delay / 1000} seconds... (${retries} attempts left)`);
      await new Promise(resolve => setTimeout(resolve, delay));
      return retryWithBackoff(fn, retries - 1, delay * 2);
    }
    throw error;
  }
}

app.post('/api/chat', checkAuth, async (req, res) => {
  const { message, history } = req.body;
  if (!message) {
    return res.status(400).json({ error: "Message is required" });
  }

  // Set up Server-Sent Events headers
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');

  try {
    // 1. Query Translation (Bilingual pipeline)
    let searchQuery = message;
    const hasBengali = /[\u0980-\u09FF]/.test(message);

    if (hasBengali) {
      console.log(`Bengali characters detected in user query: "${message}". Translating to English for semantic matching...`);
      try {
        const openaiClient = new OpenAI({
          apiKey: llmConfig.apiKey,
          baseURL: llmConfig.baseURL
        });

        const translationPrompt = `You are a helper that translates Bengali queries to English to improve vector database semantic search.
Translate the user's Bengali query into a clear, direct English search query. Preserve the original context and specialized NBR terms (like VAT, SRO, exemptions, tax rates).
Respond ONLY with the translated English query. Do not add any conversational text, introductions, or explanations.

User query: "${message}"`;

        const translationResponse = await retryWithBackoff(() =>
          openaiClient.chat.completions.create({
            model: llmConfig.model,
            messages: [{ role: 'user', content: translationPrompt }],
            temperature: 0.1
          })
        );

        const translatedQuery = translationResponse.choices[0]?.message?.content?.trim();
        if (translatedQuery) {
          searchQuery = translatedQuery;
          console.log(`Translated search query: "${searchQuery}"`);
        }
      } catch (transError) {
        console.error('Query translation failed, falling back to original query:', transError);
      }
    }

    // 2. Generate embedding for query
    console.log(`Generating embedding for search query: "${searchQuery}"...`);
    const queryEmbedding = await getEmbedding(searchQuery);

    // 3. Search Supabase for similarity match
    console.log('Querying Supabase for similar document chunks...');
    let contextText = '';
    let citations = [];

    try {
      const { data: documents, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 15
      });

      if (error) throw error;

      if (documents && documents.length > 0) {
        contextText = documents.map((doc, idx) => `[Document ${idx + 1}] (Source: ${doc.metadata?.source || 'Unknown'})\n${doc.content}`).join('\n\n---\n\n');
        citations = documents.map(doc => doc.metadata?.source || 'unknown');
        citations = [...new Set(citations)]; // Deduplicate
        console.log(`Found ${documents.length} relevant chunks for context.`);
      } else {
        contextText = 'No relevant context found.';
        console.log('No relevant chunks found in DB.');
      }
    } catch (dbError) {
      console.warn('Database query failed or is unconfigured. Proceeding with empty context:', dbError.message || dbError);
      contextText = 'Database is unconfigured or unavailable. Prompt user to complete the setup.';
    }

    // 3. Construct messages payload including conversation memory (history)
    let formattedHistory = [];
    if (Array.isArray(history)) {
      formattedHistory = history
        .filter(msg => msg && (msg.role === 'user' || msg.role === 'assistant') && typeof msg.content === 'string')
        .slice(-6); // Limit memory to last 3 turns (6 messages)
    }

    const documentRegistry = getDocumentRegistry();
    const registryListText = documentRegistry.length > 0
      ? documentRegistry.map(title => `- ${title}`).join('\n')
      : 'No documents registered.';

    const systemPrompt = `Role: You are the official NBR (National Board of Revenue) AI Assistant.

Strict Grounding: You must answer the user's question ONLY using the provided retrieved CONTEXT. Do not use your internal general knowledge or make up answers.

Zero Hallucination: Under NO circumstances should you use your internal general knowledge to answer. If the CONTEXT does not contain the answer, you must explicitly state:
- "দুঃখিত, বর্তমানে আমার কাছে থাকা NBR ডকুমেন্টে এই তথ্যের উল্লেখ নেই।" (if the user's query is in Bengali)
- "Sorry, the NBR documents currently available in my knowledge base do not contain this information." (if the user's query is in English)
Do not attempt to guess or hallucinate.

Direct & Clear: Provide clear, concise, and structured answers. Use bullet points if explaining a process or list.

Mandatory Citations: You must cite the source document for every claim you make. Append the document title from the metadata at the end of your response (e.g., "Source: Value Added Tax Act, 1991").

Language Matching: Reply in the exact same language (Bengali or English) as the user's prompt. If the CONTEXT is in English and the user's query is in Bengali, read the English context carefully, translate the relevant information, and answer the user's question in their original language (Bengali) while maintaining all strict grounding and citation rules.

For your awareness, the following official NBR documents are available in your knowledge base (Injected Document Registry):
${registryListText}

Meta-Queries Instruction: If the user asks what documents are loaded, what documents you know about, what is in the database/knowledge base, or similar meta-questions, list the documents from the "Injected Document Registry" above instead of relying on the CONTEXT. In these cases, do NOT include any source citations.`;

    const userPrompt = `Retrieved Context:
---
${contextText}
---

User Query: ${message}`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: userPrompt }
    ];

    // 4. Stream response using OpenAI SDK
    console.log(`Calling LLM API using model: ${llmConfig.model}...`);
    const openaiClient = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseURL
    });

    const stream = await retryWithBackoff(() =>
      openaiClient.chat.completions.create({
        model: llmConfig.model,
        messages: chatMessages,
        stream: true
      })
    );

    for await (const chunk of stream) {
      const text = chunk.choices[0]?.delta?.content || '';
      if (text) {
        res.write(`data: ${JSON.stringify({ text, citations })}\n\n`);
      }
    }

    res.write('data: [DONE]\n\n');
    res.end();

  } catch (error) {
    console.error('Error in chat streaming:', error);
    
    // Check if the final error is a rate limit error (429)
    const isRateLimit = error.status === 429 || 
                        error.statusCode === 429 || 
                        (error.message && error.message.includes('429')) ||
                        (error.message && error.message.toLowerCase().includes('rate limit'));
                        
    const userFriendlyMessage = isRateLimit 
      ? "দুঃখিত, সার্ভারে অতিরিক্ত চাপ রয়েছে। কিছুক্ষণ পর আবার চেষ্টা করুন। (Sorry, the server is currently experiencing high traffic. Please try again in a moment.)"
      : (error.message || 'An error occurred during chat generation.');

    res.write(`data: ${JSON.stringify({ error: userFriendlyMessage })}\n\n`);
    res.end();
  }
});



app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
// Trigger reload for new .env change - v2

