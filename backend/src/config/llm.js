import dotenv from 'dotenv';

// Load env variables
dotenv.config();

export const llmConfig = {
  // Base API configuration
  apiKey: process.env.DEEPSEEK_API_KEY || '',
  
  // Base URL for the LLM API provider
  // Defaults to DeepSeek API URL, but can be configured for Gemini, Ollama, etc.
  baseURL: process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1',
  
  // Model identifier
  // Defaults to "deepseek-chat", but can be swapped to "gemini-2.5-flash", etc.
  model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
};

export default llmConfig;
