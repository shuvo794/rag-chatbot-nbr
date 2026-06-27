import { useState, useCallback } from 'react';

/**
 * Custom React hook to manage chatbot conversation state and handle SSE streaming.
 * 
 * @param {string} apiUrl - Base URL for the chat endpoint.
 * @returns {object} Chat state and controllers.
 */
export function useChat(apiUrl = 'http://localhost:5000/api/chat') {
  const [messages, setMessages] = useState([
    {
      id: 'welcome',
      role: 'assistant',
      content: 'হ্যালো! আমি আপনাকে কীভাবে সাহায্য করতে পারি? (Hello! How can I help you today?)',
      citations: []
    }
  ]);
  const [isLoading, setIsLoading] = useState(false);

  const clearChat = useCallback(() => {
    setMessages([
      {
        id: 'welcome',
        role: 'assistant',
        content: 'হ্যালো! আমি আপনাকে কীভাবে সাহায্য করতে পারি? (Hello! How can I help you today?)',
        citations: []
      }
    ]);
    setIsLoading(false);
  }, []);

  const sendMessage = useCallback(async (content) => {
    if (!content.trim() || isLoading) return;

    // 1. Add User Message to List
    const userMessageId = Date.now().toString();
    const userMessage = {
      id: userMessageId,
      role: 'user',
      content: content,
      citations: []
    };
    
    // Extract dialogue history (excluding welcome message, mapping only standard roles)
    const chatHistory = messages
      .filter(msg => msg.id !== 'welcome')
      .map(msg => ({
        role: msg.role,
        content: msg.content
      }))
      .slice(-6); // Limit to last 3 turns (6 messages)

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // 2. Prepare Assistant Placeholder Message
    const assistantMessageId = (Date.now() + 1).toString();
    const assistantMessagePlaceholder = {
      id: assistantMessageId,
      role: 'assistant',
      content: '',
      citations: []
    };
    
    setMessages((prev) => [...prev, assistantMessagePlaceholder]);

    try {
      // 3. Retrieve passcode from local storage and initiate SSE Request
      const passcode = localStorage.getItem('chat_passcode') || '';
      const response = await fetch(apiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': passcode
        },
        body: JSON.stringify({ 
          message: content,
          history: chatHistory
        })
      });

      if (response.status === 401) {
        throw new Error('UNAUTHORIZED_PASSWORD');
      }

      if (!response.ok) {
        throw new Error(`Failed to send message: ${response.statusText}`);
      }

      // 4. Read the SSE Stream
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let accumulatedText = '';
      let accumulatedCitations = [];
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        // Retain the last incomplete chunk in the buffer
        buffer = lines.pop() || '';

        for (const line of lines) {
          const cleanedLine = line.trim();
          
          if (cleanedLine.startsWith('data: ')) {
            const dataStr = cleanedLine.substring(6);
            
            if (dataStr === '[DONE]') {
              break;
            }

            try {
              const parsed = JSON.parse(dataStr);
              
              if (parsed.error) {
                accumulatedText += `\n\n⚠️ **Error:** ${parsed.error}`;
              } else {
                if (parsed.text) {
                  accumulatedText += parsed.text;
                }
                if (parsed.citations && parsed.citations.length > 0) {
                  accumulatedCitations = parsed.citations;
                }
              }

              // Update the assistant message token-by-token
              setMessages((prev) =>
                prev.map((msg) =>
                  msg.id === assistantMessageId
                    ? { ...msg, content: accumulatedText, citations: accumulatedCitations }
                    : msg
                )
              );
            } catch (jsonErr) {
              console.error('Failed to parse SSE JSON chunk:', jsonErr);
            }
          }
        }
      }
    } catch (err) {
      console.error('Error streaming chat:', err);
      if (err.message === 'UNAUTHORIZED_PASSWORD') {
        window.dispatchEvent(new CustomEvent('chat-unauthorized'));
        setMessages((prev) => prev.slice(0, -1)); // Remove the empty assistant placeholder
      } else {
        setMessages((prev) =>
          prev.map((msg) =>
            msg.id === assistantMessageId
              ? { 
                  ...msg, 
                  content: `দুঃখিত, সংযোগে ত্রুটি ঘটেছে। অনুগ্রহ করে আবার চেষ্টা করুন।\n\n*(Error: ${err.message || err})*` 
                }
              : msg
          )
        );
      }
    } finally {
      setIsLoading(false);
    }
  }, [apiUrl, isLoading, messages]);

  return {
    messages,
    isLoading,
    sendMessage,
    clearChat
  };
}

export default useChat;
