import { chunkText, getEmbedding } from './src/services/ingestion.js';
import { llmConfig } from './src/config/llm.js';
import assert from 'assert';

async function runTests() {
  console.log('🧪 Starting Automated Unit Tests...\n');

  // Test 1: Chunking logic
  console.log('Test 1: Testing Text Chunking...');
  const sampleText = 'The quick brown fox jumps over the lazy dog. '.repeat(50); // Generates 450 words
  const chunks = chunkText(sampleText, 100, 10);
  
  assert(chunks.length > 0, 'Chunking should return non-empty array');
  assert(chunks[0].split(' ').length <= 100, 'Chunk size must not exceed limit');
  console.log(`✅ Text Chunking passed! (Generated ${chunks.length} chunks)`);

  // Test 2: Embedding Generation Dimensions
  console.log('\nTest 2: Testing Local Embedding Generator (all-MiniLM-L6-v2)...');
  try {
    const textToEmbed = 'Increments Inc. NBR University RAG Chatbot';
    const embedding = await getEmbedding(textToEmbed);
    
    assert(Array.isArray(embedding), 'Embedding output must be an array');
    assert.strictEqual(embedding.length, 384, 'Xenova MiniLM-L6-v2 embedding dimension must be exactly 384');
    console.log('✅ Embedding Generation passed! (Embedding dimension is exactly 384)');
  } catch (error) {
    console.error('❌ Embedding Generation test failed:', error.message || error);
    process.exit(1);
  }

  // Test 3: LLM Configuration Swappability
  console.log('\nTest 3: Checking LLM Swappable Configuration...');
  assert.ok(llmConfig.baseURL, 'LLM Base URL should be configured');
  assert.ok(llmConfig.model, 'LLM Model Name should be configured');
  console.log(`✅ LLM Config passed! (Active Base URL: ${llmConfig.baseURL}, Model: ${llmConfig.model})`);

  console.log('\n🎉 All tests passed successfully!');
  process.exit(0);
}

runTests().catch(err => {
  console.error('❌ Tests failed with error:', err);
  process.exit(1);
});
