import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useChat } from './hooks/useChat.js';

function App() {
  const { messages, isLoading, sendMessage, clearChat } = useChat('http://localhost:5000/api/chat');
  const [input, setInput] = useState('');
  const [ingesting, setIngesting] = useState(false);
  const [ingestStatus, setIngestStatus] = useState('');
  const messagesEndRef = useRef(null);

  // Scroll to bottom when messages update
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    sendMessage(input);
    setInput('');
  };

  const handleIngest = async () => {
    if (ingesting) return;
    setIngesting(true);
    setIngestStatus('Ingesting documents from local docs/ folder...');
    
    try {
      const response = await fetch('http://localhost:5000/api/ingest', {
        method: 'POST'
      });
      
      const data = await response.json();
      if (data.success) {
        setIngestStatus('Success: All documents ingested successfully!');
      } else {
        setIngestStatus(`Error: ${data.error || 'Failed to ingest documents.'}`);
      }
    } catch (err) {
      console.error('Ingestion error:', err);
      setIngestStatus(`Error: Ingestion failed (${err.message}).`);
    } finally {
      setTimeout(() => {
        setIngesting(false);
        setIngestStatus('');
      }, 5000);
    }
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">
      
      {/* 1. Sidebar - Control panel & Ingestion */}
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 hidden md:flex">
        
        {/* Sidebar Header */}
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-2.5 bg-gradient-to-tr from-cyan-500 to-purple-600 rounded-xl shadow-lg shadow-cyan-500/10">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-xl font-bold tracking-tight text-white leading-none">RAG Chatbot</h1>
              <span className="text-[10px] text-cyan-400 font-mono tracking-widest font-semibold uppercase">SUPABASE + DEEPSEEK</span>
            </div>
          </div>

          {/* Action Buttons */}
          <button
            onClick={clearChat}
            className="w-full flex items-center justify-center gap-2 py-3 px-4 bg-slate-800 hover:bg-slate-700/80 active:bg-slate-800 border border-slate-700/50 rounded-xl font-medium transition-all duration-200 mb-4"
          >
            <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
            </svg>
            নতুন চ্যাট (New Chat)
          </button>

          <button
            onClick={handleIngest}
            disabled={ingesting}
            className={`w-full flex items-center justify-center gap-2 py-3 px-4 rounded-xl font-semibold border transition-all duration-200 ${
              ingesting 
                ? 'bg-purple-950/30 border-purple-500/30 text-purple-400 cursor-not-allowed' 
                : 'bg-gradient-to-r from-cyan-600 to-purple-600 hover:from-cyan-500 hover:to-purple-500 text-white border-transparent shadow-lg shadow-cyan-500/10 active:opacity-90'
            }`}
          >
            {ingesting ? (
              <>
                <svg className="animate-spin h-4 w-4 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                প্রসেসিং হচ্ছে...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
                </svg>
                ডকুমেন্ট ইনজেস্ট করুন
              </>
            )}
          </button>
        </div>

        {/* Sidebar Footer / Ingest Log */}
        <div className="p-6 border-t border-slate-800/80">
          {ingestStatus ? (
            <div className="bg-slate-950 border border-slate-800 p-4 rounded-xl">
              <span className="text-[10px] text-slate-500 font-mono block uppercase mb-1">System Log</span>
              <p className="text-xs text-slate-300 font-mono leading-relaxed break-words">{ingestStatus}</p>
            </div>
          ) : (
            <div className="text-center text-xs text-slate-500 font-mono">
              <p>Place PDF/Image files in `/docs` and click ingest to embed.</p>
            </div>
          )}
        </div>

      </aside>

      {/* 2. Main Chat Area */}
      <main className="flex-1 flex flex-col h-full relative">
        
        {/* Top Header bar */}
        <header className="h-16 border-b border-slate-800/80 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur-md z-10 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="text-sm font-semibold text-white">
              Assistant Online
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button 
              onClick={clearChat}
              className="p-2 hover:bg-slate-800 rounded-lg md:hidden text-slate-400 hover:text-white transition-colors"
              title="Clear Conversation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>
            
            <button
              onClick={handleIngest}
              disabled={ingesting}
              className="p-2 hover:bg-slate-800 rounded-lg md:hidden text-slate-400 hover:text-white transition-colors"
              title="Ingest Documents"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
            </button>

            <span className="text-xs font-mono py-1 px-2.5 bg-slate-900 border border-slate-800 rounded-lg text-slate-400">
              Model: DeepSeek
            </span>
          </div>
        </header>

        {/* Scrollable Conversation Box */}
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">
            
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex gap-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
              >
                {/* Avatar for Assistant */}
                {msg.role === 'assistant' && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-cyan-600 to-cyan-400 flex items-center justify-center shrink-0 shadow-md">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904L9 21l8.904-.813a10.125 10.125 0 10-18.09-8.286v-.002" />
                    </svg>
                  </div>
                )}

                {/* Message Body */}
                <div className="flex flex-col max-w-[85%] space-y-1.5">
                  <div
                    className={`rounded-2xl px-5 py-3.5 leading-relaxed text-sm ${
                      msg.role === 'user'
                        ? 'bg-gradient-to-r from-cyan-600 to-indigo-600 text-white rounded-tr-none shadow-md shadow-indigo-600/10'
                        : 'bg-slate-900 border border-slate-800 text-slate-100 rounded-tl-none shadow-sm'
                    }`}
                  >
                    {msg.role === 'user' ? (
                      <p className="whitespace-pre-wrap font-medium">{msg.content}</p>
                    ) : (
                      <div className="markdown-content">
                        {msg.content === '' && isLoading ? (
                          <div className="flex items-center gap-1.5 py-1">
                            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '0ms' }}></span>
                            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '150ms' }}></span>
                            <span className="w-2 h-2 bg-cyan-400 rounded-full animate-bounce" style={{ animationDelay: '300ms' }}></span>
                          </div>
                        ) : (
                          <ReactMarkdown
                            components={{
                              p: ({node, ...props}) => <p className="mb-2 last:mb-0 leading-relaxed font-normal" {...props} />,
                              strong: ({node, ...props}) => <strong className="font-semibold text-cyan-300" {...props} />,
                              code: ({node, ...props}) => <code className="bg-slate-950 px-1.5 py-0.5 rounded text-rose-400 font-mono text-xs border border-slate-800" {...props} />,
                              ul: ({node, ...props}) => <ul className="list-disc pl-5 mb-2 space-y-1" {...props} />,
                              ol: ({node, ...props}) => <ol className="list-decimal pl-5 mb-2 space-y-1" {...props} />,
                              blockquote: ({node, ...props}) => <blockquote className="border-l-2 border-cyan-500 pl-3 italic text-slate-400 my-2" {...props} />,
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Highlighted Citations */}
                  {msg.role === 'assistant' && msg.citations && msg.citations.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 pl-1.5">
                      <span className="text-[10px] text-slate-500 font-semibold self-center mr-1">SOURCES:</span>
                      {msg.citations.map((cite, i) => (
                        <div
                          key={i}
                          className="inline-flex items-center gap-1 py-0.5 px-2 bg-cyan-950/40 hover:bg-cyan-950/60 border border-cyan-500/20 rounded-md text-[10px] text-cyan-400 font-medium transition-colors font-mono cursor-default"
                        >
                          <svg className="w-2.5 h-2.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                          </svg>
                          {cite}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Avatar for User */}
                {msg.role === 'user' && (
                  <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-indigo-600 to-purple-600 flex items-center justify-center shrink-0 shadow-md">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                    </svg>
                  </div>
                )}
              </div>
            ))}

            {/* Anchor for auto scroll */}
            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input Bar Section */}
        <footer className="p-4 md:p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent shrink-0">
          <div className="max-w-3xl mx-auto">
            
            {/* Input Form */}
            <form onSubmit={handleSubmit} className="relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="একটি প্রশ্ন লিখুন... (Type a message...)"
                disabled={isLoading}
                className="w-full bg-slate-900/80 backdrop-blur border border-slate-800/80 focus:border-cyan-500/50 hover:border-slate-700/50 rounded-2xl py-4 pl-5 pr-14 outline-none text-sm text-white placeholder-slate-500 shadow-xl transition-all disabled:opacity-70 disabled:cursor-not-allowed"
              />

              <button
                type="submit"
                disabled={!input.trim() || isLoading}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white disabled:opacity-40 disabled:hover:from-cyan-600 disabled:hover:to-indigo-600 disabled:cursor-not-allowed shadow-md transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>

            {/* Small status helper / warnings */}
            <div className="mt-3 text-center">
              <p className="text-[10px] text-slate-600 font-mono">
                RAG Chatbot will answer questions based strictly on the retrieved context docs. Supporting English & Bengali.
              </p>
            </div>
            
          </div>
        </footer>

      </main>
    </div>
  );
}

export default App;
