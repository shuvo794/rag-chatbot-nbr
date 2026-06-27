import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { supabase } from './src/db/supabase.js';

import { ingestDocs } from './src/services/ingestion.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 5000;

app.use(cors());
app.use(express.json());

app.get('/', (req, res) => {
  res.json({ message: "Hello World from RAG Chatbot Backend!" });
});

app.post('/api/ingest', async (req, res) => {
  try {
    await ingestDocs();
    res.json({ success: true, message: "Ingestion pipeline completed successfully." });
  } catch (error) {
    console.error("Ingestion endpoint error:", error);
    res.status(500).json({ success: false, error: error.message || error });
  }
});


app.listen(PORT, () => {
  console.log(`Backend server is running on port ${PORT}`);
});
