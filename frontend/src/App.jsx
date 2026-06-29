import { useEffect, useState, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { useChat } from './hooks/useChat.js';

/**
 * Cleanly separates the document citation footers from the AI assistant message text.
 * Returns the text body and an array of extracted unique sources.
 */
function extractSourcesFromText ( text )
{
  if ( !text ) return { cleanText: '', sources: [] };

  const sources = [];
  let cleanText = text;

  // Regex to match Source: ... or উৎস: ... (case-insensitive)
  const sourceRegex = /(?:source|উৎস)\s*:\s*([^\n\r]+)/gi;

  let match;
  const matches = [];
  while ( ( match = sourceRegex.exec( text ) ) !== null )
  {
    const sourceName = match[ 1 ].trim();
    if ( sourceName && !sources.includes( sourceName ) )
    {
      sources.push( sourceName );
    }
    matches.push( match[ 0 ] );
  }

  // Remove the citation strings from the text content
  matches.forEach( m =>
  {
    cleanText = cleanText.replace( m, '' );
  } );

  // Clean trailing punctuation, dashes, or newlines
  cleanText = cleanText.trim().replace( /---+\s*$/, '' ).trim();

  return { cleanText, sources };
}

function App ()
{
  const { messages, isLoading, sendMessage, clearChat } = useChat( 'http://localhost:5000/api/chat' );
  const [ input, setInput ] = useState( '' );
  const [ ingesting, setIngesting ] = useState( false );
  const [ ingestStatus, setIngestStatus ] = useState( '' );
  const messagesEndRef = useRef( null );

  // Active Model from backend
  const [ activeModel, setActiveModel ] = useState( '' );

  // Authentication states
  const [ isAuthModalOpen, setIsAuthModalOpen ] = useState( false );
  const [ passcode, setPasscode ] = useState( '' );
  const [ authError, setAuthError ] = useState( '' );

  // Fetch LLM model configuration from backend
  useEffect( () =>
  {
    const fetchConfig = async () =>
    {
      try
      {
        const response = await fetch( 'http://localhost:5000/api/config' );
        if ( response.ok )
        {
          const data = await response.json();
          if ( data.model )
          {
            setActiveModel( data.model );
          }
        }
      } catch ( err )
      {
        console.error( 'Failed to fetch active model configuration:', err );
      }
    };
    fetchConfig();
  }, [] );

  // Listen to 401 unauthorized events from useChat hook
  useEffect( () =>
  {
    const handleUnauthorized = () =>
    {
      setIsAuthModalOpen( true );
      setAuthError( 'Unauthorized: Please enter the correct access passcode.' );
    };
    window.addEventListener( 'chat-unauthorized', handleUnauthorized );
    return () =>
    {
      window.removeEventListener( 'chat-unauthorized', handleUnauthorized );
    };
  }, [] );

  // Suggestions for empty state onboarding
  const suggestions = [
    {
      title: "ডকুমেন্ট কীভাবে ইনজেস্ট করব?",
      subtitle: "How to ingest documents?",
      query: "আমি কীভাবে সিস্টেমে নতুন ডকুমেন্ট যোগ এবং ইনজেস্ট করতে পারি?",
      lang: "বাংলা (Bengali)"
    },
    {
      title: "Knowledge Source details",
      subtitle: "Checking available document details",
      query: "What documents are currently loaded in your database to answer questions?",
      lang: "English"
    },
    {
      title: "NBR University ভর্তি তথ্য কী?",
      subtitle: "Admission guidelines & criteria",
      query: "NBR University ভর্তি সংক্রান্ত কি কি তথ্য আপনার ডাটাবেজে রয়েছে?",
      lang: "বাংলা (Bengali)"
    },
    {
      title: "Summarize dummy.pdf contents",
      subtitle: "Quick summary of primary doc",
      query: "Please summarize the core text and findings in the dummy.pdf file.",
      lang: "English"
    }
  ];

  // Scroll to bottom when messages update or during generation
  const scrollToBottom = () =>
  {
    messagesEndRef.current?.scrollIntoView( { behavior: 'smooth' } );
  };

  useEffect( () =>
  {
    scrollToBottom();
  }, [ messages, isLoading ] );

  const handleSubmit = ( e ) =>
  {
    e.preventDefault();
    if ( !input.trim() || isLoading ) return;
    sendMessage( input );
    setInput( '' );
  };

  const handleSuggestionClick = ( query ) =>
  {
    if ( isLoading ) return;
    sendMessage( query );
  };

  const handleIngest = async () =>
  {
    if ( ingesting ) return;
    setIngesting( true );
    setIngestStatus( 'Analyzing /docs directory and loading documents...' );

    try
    {
      const savedPasscode = localStorage.getItem( 'chat_passcode' ) || '';
      const response = await fetch( 'http://localhost:5000/api/ingest', {
        method: 'POST',
        headers: {
          'Authorization': savedPasscode
        }
      } );

      if ( response.status === 401 )
      {
        setIsAuthModalOpen( true );
        setAuthError( 'Unauthorized: Ingestion requires a valid passcode.' );
        setIngestStatus( 'Error: Unauthorized passcode.' );
        return;
      }

      const data = await response.json();
      if ( data.success )
      {
        setIngestStatus( 'Success: All documents ingested, parsed, and embedded in Supabase!' );
      } else
      {
        setIngestStatus( `Error: ${ data.error || 'Failed to ingest documents.' }` );
      }
    } catch ( err )
    {
      console.error( 'Ingestion error:', err );
      setIngestStatus( `Error: Ingestion failed (${ err.message }).` );
    } finally
    {
      setTimeout( () =>
      {
        setIngesting( false );
        setIngestStatus( '' );
      }, 6000 );
    }
  };

  // Helper to pre-process text to wrap citations in backticks so they render as customized code spans
  const highlightCitations = ( text ) =>
  {
    if ( !text ) return '';
    // Matches patterns like [filename.pdf] or [filename.png] and wraps them in backticks if not already wrapped
    return text.replace( /(?<!`)(?:\[([a-zA-Z0-9_\-.]+\.(?:pdf|png|jpg|jpeg))\])(?!`)/gi, '`[$1]`' );
  };

  return (
    <div className="flex h-screen w-screen bg-slate-950 text-slate-100 font-sans overflow-hidden">

      {/* 1. Sidebar - Control panel & Ingestion */ }
      <aside className="w-80 bg-slate-900 border-r border-slate-800 flex flex-col justify-between shrink-0 hidden md:flex z-20">

        {/* Sidebar Header */ }
        <div className="p-6">
          <div className="flex items-center gap-3 mb-8">
            <div className="p-3 bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 rounded-2xl shadow-xl shadow-cyan-500/10">
              <svg className="w-6 h-6 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path strokeLinecap="round" strokeLinejoin="round" d="M7.5 8.25h9m-9 3H12m-9.75 1.51c0 1.6 1.123 2.994 2.707 3.227 1.129.166 2.27.293 3.423.379.35.026.67.21.865.501L12 21l3.255-4.643a1.002 1.002 0 0 1 .865-.501c1.153-.086 2.294-.213 3.423-.379 1.584-.233 2.707-1.626 2.707-3.228V6.741c0-1.602-1.123-2.995-2.707-3.228A48.394 48.394 0 0 0 12 3c-2.392 0-4.744.175-7.043.513C3.373 3.746 2.25 5.14 2.25 6.741v6.018Z"></path>
              </svg>
            </div>
            <div>
              <h1 className="text-lg font-bold tracking-tight text-white leading-tight">NBR University RAG</h1>
              <span className="text-[9px] text-cyan-400 font-mono tracking-widest font-bold uppercase">SUPABASE + DEEPSEEK</span>
            </div>
          </div>

          <div className="space-y-3">
            {/* New Chat Button */ }
            <button
              onClick={ clearChat }
              className="w-full flex items-center justify-center gap-2.5 py-3 px-4 bg-slate-800 hover:bg-slate-750 border border-slate-700/80 hover:border-slate-600 rounded-xl font-medium text-sm transition-all duration-200 hover:scale-[1.02] active:scale-[0.98]"
            >
              <svg className="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
              </svg>
              নতুন চ্যাট (New Chat)
            </button>

            {/* Ingest Button */ }
            <button
              onClick={ handleIngest }
              disabled={ ingesting }
              className={ `w-full flex items-center justify-center gap-2.5 py-3 px-4 rounded-xl text-sm font-semibold border transition-all duration-300 hover:scale-[1.02] active:scale-[0.98] ${ ingesting
                  ? 'bg-purple-950/20 border-purple-500/30 text-purple-400 cursor-not-allowed animate-pulse'
                  : 'bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white border-transparent shadow-lg shadow-indigo-500/10 cursor-pointer'
                }` }
            >
              { ingesting ? (
                <>
                  <svg className="animate-spin h-4 w-4 text-purple-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  প্রসেসিং হচ্ছে...
                </>
              ) : (
                <>
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 0 1-1.41-8.775 5.25 5.25 0 0 1 10.233-2.33 3 3 0 0 1 3.758 3.848A3.752 3.752 0 0 1 18 19.5H6.75Z" />
                  </svg>
                  ডকুমেন্ট ইনজেস্ট করুন
                </>
              ) }
            </button>
          </div>
        </div>

        {/* Sidebar Footer / Ingest Log */ }
        <div className="p-6 border-t border-slate-800">
          { ingestStatus ? (
            <div className="bg-slate-950 border border-slate-850 p-4 rounded-xl shadow-inner">
              <div className="flex items-center gap-2 mb-2">
                <span className="relative flex h-2 w-2">
                  <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75"></span>
                  <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-500"></span>
                </span>
                <span className="text-[9px] text-slate-400 font-mono tracking-wider block uppercase font-bold">System Status</span>
              </div>
              <p className="text-xs text-slate-300 font-mono leading-relaxed break-words">{ ingestStatus }</p>
            </div>
          ) : (
            <div className="bg-slate-950/40 border border-slate-850/50 p-4 rounded-xl text-center text-xs text-slate-500 font-mono">
              <p>Place PDF/Image files in `/docs` and click ingest to embed inside Supabase.</p>
            </div>
          ) }
        </div>

      </aside>

      {/* 2. Main Chat Area */ }
      <main className="flex-1 flex flex-col h-full relative bg-slate-950">

        {/* Top Header bar */ }
        <header className="h-16 border-b border-slate-800/80 flex items-center justify-between px-6 bg-slate-950/80 backdrop-blur-md z-15 shrink-0">
          <div className="flex items-center gap-3">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-450 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <div className="text-xs font-semibold text-slate-200">
              Assistant Active
            </div>
          </div>

          <div className="flex items-center gap-3">
            {/* Clear button for mobile screen */ }
            <button
              onClick={ clearChat }
              className="p-2.5 hover:bg-slate-900 rounded-xl md:hidden text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-850"
              title="Clear Conversation"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182m0-4.991v4.99" />
              </svg>
            </button>

            {/* Ingest button for mobile screen */ }
            <button
              onClick={ handleIngest }
              disabled={ ingesting }
              className="p-2.5 hover:bg-slate-900 rounded-xl md:hidden text-slate-400 hover:text-white transition-colors border border-transparent hover:border-slate-850"
              title="Ingest Documents"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 16.5V9.75m0 0l3 3m-3-3l-3 3M6.75 19.5a4.5 4.5 0 01-1.41-8.775 5.25 5.25 0 0110.233-2.33 3 3 0 013.758 3.848A3.752 3.752 0 0118 19.5H6.75z" />
              </svg>
            </button>

            <span className="text-[10px] font-mono font-bold tracking-wider py-1 px-3 bg-slate-900 border border-slate-850 rounded-full text-slate-400 shadow-inner uppercase">
              Model: { activeModel || 'gemini-2.5-flash' }
            </span>
          </div>
        </header>

        {/* Scrollable Conversation Box */ }
        <div className="flex-1 overflow-y-auto px-4 md:px-8 py-6 space-y-6">
          <div className="max-w-3xl mx-auto space-y-6">

            {/* Welcome onboarding grid (shows when only welcome message is loaded) */ }
            { messages.length === 1 && (
              <div className="flex flex-col items-center justify-center text-center mt-6 mb-12 max-w-2xl mx-auto px-2">
                <div className="w-16 h-16 bg-gradient-to-tr from-cyan-500 via-indigo-500 to-purple-600 rounded-2xl flex items-center justify-center shadow-2xl shadow-indigo-500/25 mb-5 animate-pulse">
                  <svg className="w-7 h-7 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9.813 15.904 9 21l8.904-.813a10.125 10.125 0 1 0-18.09-8.286v-.002" />
                  </svg>
                </div>

                <h2 className="text-xl md:text-2xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-indigo-200 to-purple-400 mb-2.5 tracking-tight font-sans">
                  NBR University RAG Assistant
                </h2>
                <p className="text-slate-400 text-xs md:text-sm leading-relaxed mb-8 max-w-md">
                  এনবিআর ইউনিভার্সিটি নথি তথ্য ভাণ্ডার চালিত এআই চ্যাটবট। আপনার আপলোড করা ফাইল থেকে সঠিক ও দ্রুত উত্তর প্রদান করতে সক্ষম।
                </p>

                {/* Suggestions layout */ }
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 w-full">
                  { suggestions.map( ( sug, i ) => (
                    <button
                      key={ i }
                      type="button"
                      onClick={ () => handleSuggestionClick( sug.query ) }
                      className="flex flex-col items-start text-left p-4 bg-slate-900/40 hover:bg-slate-900/90 active:bg-slate-950 border border-slate-850 hover:border-cyan-500/30 rounded-2xl cursor-pointer hover:shadow-lg transition-all duration-300 group"
                    >
                      <div className="flex justify-between w-full mb-1">
                        <span className="text-[9px] font-bold text-slate-500 font-mono tracking-wider uppercase">{ sug.lang }</span>
                        <svg className="w-3.5 h-3.5 text-slate-600 group-hover:text-cyan-400 transition-colors" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 4.5 21 12m0 0-7.5 7.5M21 12H3" />
                        </svg>
                      </div>
                      <p className="text-sm font-semibold text-slate-200 group-hover:text-white leading-tight mb-0.5">{ sug.title }</p>
                      <p className="text-[11px] text-slate-500 group-hover:text-slate-400 leading-snug line-clamp-1">{ sug.subtitle }</p>
                    </button>
                  ) ) }
                </div>
              </div>
            ) }

            {/* Ingestion Status helper for mobile screens */ }
            { ingestStatus && (
              <div className="md:hidden p-4 bg-slate-900 border border-slate-800 rounded-2xl shadow-lg">
                <p className="text-xs text-cyan-400 font-mono mb-1 uppercase font-bold">System Log:</p>
                <p className="text-xs text-slate-300 leading-relaxed font-sans">{ ingestStatus }</p>
              </div>
            ) }

            {/* Conversation Flow */ }
            { messages.map( ( msg, idx ) =>
            {
              const isLastMessage = idx === messages.length - 1;
              const isStreaming = isLoading && isLastMessage && msg.role === 'assistant';

              // Separate text content from source lines
              const { cleanText, sources: extractedSources } = msg.role === 'assistant'
                ? extractSourcesFromText( msg.content )
                : { cleanText: msg.content, sources: [] };

              // Combine citations from metadata with those extracted from text
              const allCitations = msg.role === 'assistant'
                ? [ ...new Set( [ ...( msg.citations || [] ), ...extractedSources ] ) ]
                : [];

              return (
                <div
                  key={ msg.id }
                  className={ `flex gap-4 ${ msg.role === 'user' ? 'justify-end' : 'justify-start' } animate-fade-in` }
                >
                  {/* Assistant Avatar */ }
                  { msg.role === 'assistant' && (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-600 via-indigo-500 to-cyan-500 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/10 border border-indigo-400/20">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M9 17.25v1.007a3 3 0 0 1-.879 2.122L7.5 21h9l-.621-.621A3 3 0 0 1 15 18.257V17.25m6-12V15a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 15V5.25m18 0A2.25 2.25 0 0 0 18.75 3H5.25A2.25 2.25 0 0 0 3 5.25m18 0V12a2.25 2.25 0 0 1-2.25 2.25H5.25A2.25 2.25 0 0 1 3 12V5.25" />
                      </svg>
                    </div>
                  ) }

                  {/* Message Body wrapper */ }
                  <div className="flex flex-col max-w-[85%] space-y-2">
                    <div
                      className={ `rounded-2xl px-5 py-4 leading-relaxed text-[14px] border transition-all ${ msg.role === 'user'
                          ? 'bg-gradient-to-br from-indigo-900/40 to-indigo-950/60 border-indigo-500/20 text-indigo-50 rounded-tr-none shadow-md shadow-indigo-950/20 font-medium'
                          : 'bg-slate-900/35 border-slate-800/80 text-slate-100 rounded-tl-none shadow-md backdrop-blur-sm'
                        }` }
                    >
                      { msg.role === 'user' ? (
                        <p className="whitespace-pre-wrap font-medium tracking-wide bengali-text text-[14.5px]">{ msg.content }</p>
                      ) : (
                        <div className="markdown-content">
                          { msg.content === '' && isLoading ? (
                            <div className="flex items-center gap-1.5 py-1 px-1">
                              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={ { animationDelay: '0ms' } }></span>
                              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={ { animationDelay: '150ms' } }></span>
                              <span className="w-2 h-2 bg-indigo-400 rounded-full animate-bounce" style={ { animationDelay: '300ms' } }></span>
                            </div>
                          ) : (
                            <ReactMarkdown
                              components={ {
                                p: ( { children, ...props } ) => (
                                  <p className={ `mb-3 last:mb-0 leading-relaxed md:leading-loose text-[14.5px] text-slate-200 bengali-text ${ isStreaming ? 'streaming-cursor' : '' }` } { ...props }>
                                    { children }
                                  </p>
                                ),
                                strong: ( { children, ...props } ) => <strong className="font-semibold text-cyan-400" { ...props }>{ children }</strong>,
                                ul: ( { children, ...props } ) => <ul className="list-disc pl-5 mb-3.5 space-y-2 text-slate-300" { ...props }>{ children }</ul>,
                                ol: ( { children, ...props } ) => <ol className="list-decimal pl-5 mb-3.5 space-y-2 text-slate-300" { ...props }>{ children }</ol>,
                                li: ( { children, ...props } ) => <li className="leading-relaxed text-[14.5px] bengali-text" { ...props }>{ children }</li>,
                                blockquote: ( { children, ...props } ) => <blockquote className="border-l-4 border-indigo-500/60 pl-4 py-1 my-3 italic text-slate-450 bg-slate-950/20 rounded-r-lg" { ...props }>{ children }</blockquote>,
                                code: ( { children, ...props } ) =>
                                {
                                  const content = String( children ).replace( /\n$/, '' );
                                  const isCitation = typeof content === 'string' && /^\[.+\.(pdf|png|jpg|jpeg)\]$/i.test( content );
                                  if ( isCitation )
                                  {
                                    return (
                                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-cyan-955/60 text-cyan-400 font-bold font-mono text-[10.5px] border border-cyan-500/20 shadow-sm mx-0.5 cursor-default hover:bg-cyan-900/40 transition-colors">
                                        <svg className="w-2.5 h-2.5" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                                          <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                        </svg>
                                        { content.slice( 1, -1 ) }
                                      </span>
                                    );
                                  }
                                  return (
                                    <code className="bg-slate-950 px-1.5 py-0.5 rounded text-indigo-300 font-mono text-xs border border-slate-850" { ...props }>
                                      { children }
                                    </code>
                                  );
                                }
                              } }
                            >
                              { highlightCitations( cleanText ) }
                            </ReactMarkdown>
                          ) }
                        </div>
                      ) }
                    </div>

                    {/* Citations Tag/Pill List under Assistant message */ }
                    { msg.role === 'assistant' && allCitations.length > 0 && (
                      <div className="flex flex-wrap items-center gap-2 mt-2 pt-2 border-t border-slate-850/45">
                        <span className="text-[9.5px] text-slate-500 font-bold tracking-wider font-mono self-center mr-1 uppercase">SOURCES:</span>
                        { allCitations.map( ( cite, i ) => (
                          <span
                            key={ i }
                            className="inline-flex items-center gap-1 py-1 px-3 bg-indigo-950/25 hover:bg-indigo-900/35 border border-indigo-500/20 hover:border-indigo-400/30 rounded-full text-[11px] text-indigo-300 font-medium font-mono transition-all cursor-default shadow-sm hover:scale-[1.01]"
                          >
                            <svg className="w-3 h-3 text-indigo-400 shrink-0" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                            </svg>
                            { cite }
                          </span>
                        ) ) }
                      </div>
                    ) }
                  </div>

                  {/* User Avatar */ }
                  { msg.role === 'user' && (
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-indigo-500 via-purple-500 to-indigo-600 flex items-center justify-center shrink-0 shadow-lg shadow-indigo-500/10 border border-indigo-400/20">
                      <svg className="w-5 h-5 text-white" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
                      </svg>
                    </div>
                  ) }
                </div>
              );
            } ) }



            {/* Anchor for auto scroll */ }
            <div ref={ messagesEndRef } />
          </div>
        </div>

        {/* Input Bar Section */ }
        <footer className="p-4 md:p-6 bg-gradient-to-t from-slate-950 via-slate-950 to-transparent shrink-0 border-t border-slate-900">
          <div className="max-w-3xl mx-auto">

            {/* Input Form */ }
            <form onSubmit={ handleSubmit } className="relative">
              <input
                type="text"
                value={ input }
                onChange={ ( e ) => setInput( e.target.value ) }
                placeholder="একটি প্রশ্ন লিখুন... (Type a message...)"
                disabled={ isLoading }
                className="w-full bg-slate-900/80 backdrop-blur border border-slate-850 focus:border-cyan-500/50 hover:border-slate-800 focus:bg-slate-900 rounded-2xl py-4 pl-5 pr-14 outline-none text-sm text-white placeholder-slate-500 shadow-2xl transition-all disabled:opacity-75 disabled:cursor-not-allowed"
              />

              <button
                type="submit"
                disabled={ !input.trim() || isLoading }
                className="absolute right-2.5 top-1/2 -translate-y-1/2 p-2.5 rounded-xl bg-gradient-to-r from-cyan-600 to-indigo-600 hover:from-cyan-500 hover:to-indigo-500 text-white disabled:opacity-40 disabled:hover:from-cyan-600 disabled:hover:to-indigo-600 disabled:cursor-not-allowed shadow-md hover:shadow-cyan-500/5 transition-all duration-200"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth="2.5" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                </svg>
              </button>
            </form>

            {/* Small status helper / warnings */ }
            <div className="mt-3 text-center">
              <p className="text-[10.5px] text-slate-500 font-mono tracking-wide leading-relaxed">
                RAG Chatbot will answer questions based strictly on the retrieved context docs. Supporting English & Bengali.
              </p>
            </div>

          </div>
        </footer>

      </main>

      {/* Auth Modal Overlay */ }
      { isAuthModalOpen && (
        <div className="fixed inset-0 bg-slate-950/85 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl w-full max-w-sm shadow-2xl relative">
            <h3 className="text-lg font-bold text-white mb-2">সুরক্ষিত অ্যাক্সেস (Secure Access)</h3>
            <p className="text-xs text-slate-400 mb-4 leading-relaxed">
              nbr-chatbot ব্যবহার করার জন্য অনুগ্রহ করে অ্যাক্সেস পাসকোডটি দিন।
              <br />
              <span className="text-[10px] text-slate-500">(Enter the access passcode to use the chatbot.)</span>
            </p>
            <form onSubmit={ ( e ) =>
            {
              e.preventDefault();
              if ( !passcode.trim() ) return;
              localStorage.setItem( 'chat_passcode', passcode );
              setIsAuthModalOpen( false );
              setAuthError( '' );
              window.location.reload(); // Refresh to clean states and retry
            } }>
              <input
                type="password"
                value={ passcode }
                onChange={ ( e ) => setPasscode( e.target.value ) }
                placeholder="পাসকোড দিন... (Enter passcode...)"
                className="w-full bg-slate-950 border border-slate-850 focus:border-cyan-500 rounded-xl py-3 px-4 outline-none text-sm text-white mb-3 shadow-inner"
                autoFocus
              />
              { authError && <p className="text-xs text-rose-500 mb-3 font-medium">{ authError }</p> }
              <button
                type="submit"
                className="w-full py-3 bg-gradient-to-r from-cyan-600 to-indigo-650 hover:from-cyan-500 hover:to-indigo-550 text-white font-semibold rounded-xl text-sm shadow-lg shadow-indigo-500/10 cursor-pointer transition-all active:scale-[0.98]"
              >
                অ্যাক্সেস করুন (Access)
              </button>
            </form>
          </div>
        </div>
      ) }

    </div>
  );
}

export default App;
