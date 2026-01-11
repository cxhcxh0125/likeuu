
import React, { useState, useRef, useEffect } from 'react';
import { Send, Mic, Sparkles } from 'lucide-react';
import { Message } from '../types';

interface ChatInterfaceProps {
  messages: Message[];
  onSendMessage: (text: string) => void;
  isLoading: boolean;
}

const ChatInterface: React.FC<ChatInterfaceProps> = ({ messages, onSendMessage, isLoading }) => {
  const [input, setInput] = useState('');
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (input.trim() && !isLoading) {
      onSendMessage(input);
      setInput('');
    }
  };

  return (
    <div className="flex flex-col h-[500px] bg-white border border-pink-100 rounded-2xl shadow-sm overflow-hidden">
      <div 
        ref={scrollRef}
        className="flex-1 overflow-y-auto p-6 space-y-4"
      >
        {messages.map((msg) => (
          <div 
            key={msg.id} 
            className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div className={`max-w-[80%] rounded-2xl p-4 text-sm leading-relaxed ${
              msg.role === 'user' 
                ? 'bg-gray-50 text-gray-800' 
                : 'bg-pink-50 text-pink-900 border border-pink-100'
            }`}>
              {msg.content}
            </div>
          </div>
        ))}
        {isLoading && (
          <div className="flex justify-start">
            <div className="bg-pink-50 text-pink-900 rounded-2xl p-4 text-sm border border-pink-100 animate-pulse">
              Thinking of the perfect outfit...
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="p-4 border-t border-gray-100 bg-white">
        <div className="relative flex items-center gap-2">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Describe the occasion you want to attend..."
            className="w-full pl-4 pr-24 py-3 bg-white border border-gray-200 rounded-xl focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all text-sm text-gray-900 placeholder-gray-400"
          />
          <div className="absolute right-2 flex items-center gap-1">
            <button type="button" className="p-2 text-gray-400 hover:text-pink-500 transition-colors">
              <Mic size={18} />
            </button>
            <button 
              type="submit" 
              disabled={isLoading}
              className="bg-pink-200 text-pink-700 hover:bg-pink-300 px-4 py-2 rounded-lg flex items-center gap-2 text-sm font-medium transition-colors"
            >
              <Send size={16} />
              <span>Send</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};

export default ChatInterface;
