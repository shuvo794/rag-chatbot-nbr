import { useEffect, useState } from 'react';

function App() {
  const [backendMessage, setBackendMessage] = useState('Connecting to backend server...');
  const [isConnected, setIsConnected] = useState(false);
  const [dots, setDots] = useState('');

  // Simple loading animation for status
  useEffect(() => {
    if (isConnected) return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? '' : prev + '.'));
    }, 500);
    return () => clearInterval(interval);
  }, [isConnected]);

  useEffect(() => {
    // Vite Dev Server runs inside Docker. In the browser, it communicates with localhost:5000.
    const backendUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000';
    
    fetch(backendUrl)
      .then((res) => {
        if (!res.ok) throw new Error('Network response was not ok');
        return res.json();
      })
      .then((data) => {
        setBackendMessage(data.message);
        setIsConnected(true);
      })
      .catch((err) => {
        console.error('Error connecting to backend:', err);
        setBackendMessage('Failed to connect to backend server. Make sure docker containers are running.');
        setIsConnected(false);
      });
  }, []);

  return (
    <div className="min-h-screen w-full bg-radial from-slate-900 via-slate-950 to-black text-slate-100 flex flex-col items-center justify-center p-6 relative overflow-hidden font-sans">
      
      {/* Background visual accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 bg-cyan-500/10 rounded-full blur-3xl pointer-events-none"></div>
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 bg-purple-500/10 rounded-full blur-3xl pointer-events-none"></div>

      {/* Main Glassmorphic Container */}
      <div className="relative max-w-lg w-full bg-slate-900/40 backdrop-blur-xl rounded-3xl border border-slate-800/80 p-8 shadow-2xl transition-all duration-300 hover:border-slate-700/60">
        
        {/* Decorative Top Line */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-1/2 h-[2px] bg-gradient-to-r from-transparent via-cyan-500 to-transparent"></div>

        {/* Header Section */}
        <div className="flex flex-col items-center mb-8">
          <div className="inline-flex items-center justify-center p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20 mb-4 animate-pulse">
            <svg className="w-10 h-10 text-cyan-400" fill="none" stroke="currentColor" strokeWidth="1.5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.625 12a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H8.25m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0H12m4.125 0a.375.375 0 11-.75 0 .375.375 0 01.75 0zm0 0h-.375M21 12c0 4.556-4.03 8.25-9 8.25a9.764 9.764 0 01-2.555-.337A5.972 5.972 0 015.41 20.97a5.969 5.969 0 01-.474-.065 4.48 4.48 0 00.978-2.025c.09-.457-.133-.901-.467-1.226C3.93 16.178 3 14.189 3 12c0-4.556 4.03-8.25 9-8.25s9 3.694 9 8.25z"></path>
            </svg>
          </div>
          
          <h1 className="text-4xl font-extrabold tracking-tight text-white mb-2">
            RAG <span className="bg-gradient-to-r from-cyan-400 to-purple-400 bg-clip-text text-transparent">Chatbot</span>
          </h1>
          <p className="text-slate-400 text-sm font-medium tracking-wide">
            MONOREPO BOILERPLATE INITIALIZED
          </p>
        </div>

        {/* Status Area */}
        <div className="space-y-4">
          <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800/80 transition-all hover:bg-slate-950/80">
            <div className="flex justify-between items-center mb-3">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest">
                Service Status
              </span>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${
                isConnected 
                  ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                  : 'bg-amber-500/10 text-amber-400 border-amber-500/20'
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${isConnected ? 'bg-emerald-400 animate-ping' : 'bg-amber-400 animate-pulse'}`}></span>
                {isConnected ? 'Connected' : 'Connecting'}
              </span>
            </div>
            
            <p className="text-slate-300 font-mono text-sm leading-relaxed break-words">
              {isConnected ? backendMessage : `${backendMessage}${dots}`}
            </p>
          </div>

          <div className="bg-slate-950/60 rounded-2xl p-5 border border-slate-800/80">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-widest block mb-3">
              Stack Capabilities Enabled
            </span>
            <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400">
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">✓</span> React 19 + Vite
              </div>
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">✓</span> Tailwind CSS v4
              </div>
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">✓</span> Node.js + Express
              </div>
              <div className="flex items-center gap-2">
                <span className="text-cyan-400">✓</span> Dockerized Dev
              </div>
            </div>
          </div>
        </div>

        {/* Footer info */}
        <div className="mt-8 text-center">
          <p className="text-xs text-slate-600 font-mono">
            Zero-steps containerized dev server running at <a href="http://localhost:5173" className="text-slate-500 hover:text-cyan-400 underline transition-colors">localhost:5173</a>
          </p>
        </div>

      </div>
    </div>
  );
}

export default App;
