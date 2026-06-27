import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import ws from 'ws';

// Load environment variables (supports testing/scripts run independently)
dotenv.config();

// Polyfill WebSocket for Node < 22 (required by Supabase Realtime client)
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = ws;
}

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn(
    '\x1b[33m%s\x1b[0m', // Yellow output
    'WARNING: SUPABASE_URL or SUPABASE_ANON_KEY is missing in environment variables. Please check your .env file.'
  );
}

// Initialize Supabase Client
export const supabase = createClient(
  supabaseUrl || 'https://placeholder-url.supabase.co', 
  supabaseAnonKey || 'placeholder-anon-key'
);

export default supabase;
