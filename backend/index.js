import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './src/db/supabase.js';

import { ingestDocs, getEmbedding } from './src/services/ingestion.js';
import OpenAI from 'openai';
import { llmConfig } from './src/config/llm.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: "Hello World from RAG Chatbot Backend!" });
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
    // 1. Generate embedding for query
    console.log(`Generating embedding for user query: "${message}"...`);
    const queryEmbedding = await getEmbedding(message);

    // 2. Search Supabase for similarity match
    console.log('Querying Supabase for similar document chunks...');
    let contextText = '';
    let citations = [];

    try {
      const { data: documents, error } = await supabase.rpc('match_documents', {
        query_embedding: queryEmbedding,
        match_threshold: 0.3,
        match_count: 5
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

    const systemPrompt = `You are an official NBR (National Board of Revenue) Assistant. 
You must answer the user's query ONLY using the provided context retrieved from the database. Do not use any outside knowledge or hallucinate.
If the answer is not present in the provided context, gracefully reply that you do not have the information in the current NBR documents. Do NOT make up answers or hallucinate.

You must respond in the same language as the user's query: if the query is in Bengali, respond in Bengali. If it is in English, respond in English.

Mandatory Citation: Always cite the source at the end of the answer using the metadata provided (e.g., "Source: Value Added Tax Act, 2012").

Retrieved Context:
---
${contextText}
---`;

    const chatMessages = [
      { role: 'system', content: systemPrompt },
      ...formattedHistory,
      { role: 'user', content: message }
    ];

    // 4. Stream response using OpenAI SDK
    console.log(`Calling LLM API using model: ${llmConfig.model}...`);
    const openaiClient = new OpenAI({
      apiKey: llmConfig.apiKey,
      baseURL: llmConfig.baseURL
    });

    const stream = await openaiClient.chat.completions.create({
      model: llmConfig.model,
      messages: chatMessages,
      stream: true
    });

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
    res.write(`data: ${JSON.stringify({ error: error.message || 'An error occurred during chat generation.' })}\n\n`);
    res.end();
  }
});



app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
