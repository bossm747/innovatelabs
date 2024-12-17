'use client';

import { useState, useRef, useEffect } from 'react';
import { Prism as SyntaxHighlighter } from 'react-syntax-highlighter';
import { vs } from 'react-syntax-highlighter/dist/esm/styles/prism';
import { constructPrompt } from '@/utils/prompt';
import { IoChevronBackOutline, IoChevronForwardOutline } from 'react-icons/io5';
import { IoShareOutline } from 'react-icons/io5';
import { FiExternalLink } from 'react-icons/fi';
import { CopyButton } from '@/components/CopyButton';
import { ReloadButton } from '@/components/ReloadButton';
import { ShareButton } from '@/components/ShareButton';
import { ExternalButton } from '@/components/ExternalButton';
import { VersionSwitcher } from '@/components/VersionSwitcher';
import { v4 as uuidv4 } from 'uuid';
import toast from 'react-hot-toast';

interface HistoryEntry {
  html: string;
  feedback: string;
  usage?: {
    total_time: number;
    total_tokens: number;
  };
  sessionId?: string;
  version?: string;
}

export default function Home() {
  const [query, setQuery] = useState('');
  const [currentHtml, setCurrentHtml] = useState('');
  const [currentFeedback, setCurrentFeedback] = useState('');
  const [isOverlayOpen, setIsOverlayOpen] = useState(false);
  const [mode, setMode] = useState<'query' | 'feedback'>('query');
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [sessionId] = useState(() => uuidv4());
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const generateHtml = async () => {
    try {
      const response = await fetch('/api/generate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          query,
          currentHtml,
        }),
      });

      const data = await response.json();
      
      if (!response.ok) {
        if (response.status === 400 && data.category) {
          toast.error(
            <div>
              <p>{data.error}</p>
              <p className="text-sm text-gray-500 mt-1">Category: {data.category}</p>
            </div>,
            { duration: 5000 }
          );
          return;
        }
        throw new Error('Failed to generate HTML');
      }
      
      if (data.html) {
        const version = (history.length + 1).toString();
        const newEntry: HistoryEntry = { 
          html: data.html, 
          feedback: '',
          usage: data.usage,
          sessionId,
          version
        };
        const newHistory = historyIndex === -1 
          ? [newEntry] 
          : [...history.slice(0, historyIndex + 1), newEntry];
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        setCurrentHtml(data.html);
        setMode('feedback');
        
        // Save the HTML to the server
        await fetch(`/api/apps/${sessionId}/${version}`, {
          method: 'POST',
          body: data.html
        });
      }
    } catch (error) {
      console.error('Error:', error);
    }
  };

  const submitFeedback = async () => {
    if (currentFeedback.trim()) {
      // Update history entry with new feedback
      const updatedHistory = [...history];
      updatedHistory[historyIndex] = {
        ...updatedHistory[historyIndex],
        feedback: currentFeedback.trim()
      };
      setHistory(updatedHistory);
      
      try {
        const response = await fetch('/api/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            currentHtml: history[historyIndex].html,
            feedback: currentFeedback.trim(),
          }),
        });

        const data = await response.json();
        
        if (!response.ok) {
          if (response.status === 400 && data.category) {
            toast.error(
              <div>
                <p>{data.error}</p>
                <p className="text-sm text-gray-500 mt-1">Category: {data.category}</p>
              </div>,
              { duration: 5000 }
            );
            return;
          }
          throw new Error('Failed to generate HTML');
        }
        
        if (data.html) {
          const version = (history.length + 1).toString();
          const newEntry: HistoryEntry = { 
            html: data.html, 
            feedback: '',
            usage: data.usage,
            sessionId: history[historyIndex].sessionId,
            version
          };
          const newHistory = [...history.slice(0, historyIndex + 1), newEntry];
          setHistory(newHistory);
          setHistoryIndex(newHistory.length - 1);
          setCurrentHtml(data.html);
          setCurrentFeedback('');

          // Save the HTML to the server
          await fetch(`/api/apps/${history[historyIndex].sessionId}/${version}`, {
            method: 'POST',
            body: data.html
          });
        }
      } catch (error) {
        console.error('Error:', error);
      }
    }
  };

  const navigateHistory = (direction: 'prev' | 'next') => {
    const newIndex = direction === 'prev' ? historyIndex - 1 : historyIndex + 1;
    if (newIndex >= 0 && newIndex < history.length) {
      setHistoryIndex(newIndex);
      setCurrentHtml(history[newIndex].html);
      setCurrentFeedback(history[newIndex].feedback || '');
    }
  };

  const getFormattedOutput = () => {
    return constructPrompt({
      query,
      currentFeedback,
      currentHtml
    });
  };

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setIsOverlayOpen(false);
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, []);

  return (
    <main className="h-screen flex flex-col overflow-hidden">
      {/* Top Input Bar */}
      <div className="p-4 bg-white border-b flex-shrink-0">
        <div className="flex flex-col gap-4">
          {/* Version Switcher - Separate row on mobile */}
          <VersionSwitcher
            className="lg:hidden justify-center"
            currentVersion={historyIndex + 1}
            totalVersions={history.length}
            onPrevious={() => navigateHistory('prev')}
            onNext={() => navigateHistory('next')}
          />

          {/* Main Input Row */}
          <div className="flex items-center gap-4">
            {/* Version Switcher - Only visible on desktop */}
            <VersionSwitcher
              className="lg:flex hidden"
              currentVersion={historyIndex + 1}
              totalVersions={history.length}
              onPrevious={() => navigateHistory('prev')}
              onNext={() => navigateHistory('next')}
            />

            <input
              type="text"
              value={mode === 'query' ? query : currentFeedback}
              onChange={(e) => mode === 'query' ? setQuery(e.target.value) : setCurrentFeedback(e.target.value)}
              className="flex-1 p-2 border rounded"
              placeholder={mode === 'query' ? "Describe your app..." : "Enter your feedback..."}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  mode === 'query' ? generateHtml() : submitFeedback();
                }
              }}
            />
            <button
              disabled={false}
              className={`px-4 py-2 text-white rounded-lg bg-[#F55036] hover:bg-[#D93D26] focus:outline-none focus:ring-2 focus:ring-[#FF7B66] focus:ring-opacity-50 whitespace-nowrap`}
              onClick={mode === 'query' ? generateHtml : submitFeedback}
            >
              {mode === 'query' ? 'Generate' : 'Apply edit'}
            </button>
            <button
              onClick={() => setIsOverlayOpen(!isOverlayOpen)}
              className="px-4 py-2 border border-gray-300 text-gray-600 rounded hover:bg-gray-100 whitespace-nowrap"
            >
              Show prompt
            </button>
          </div>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex flex-1 overflow-hidden">
        {/* Left Column - Code View */}
        <div className="w-1/2 p-4 border-r overflow-auto lg:block hidden">
          <div className="relative h-full">
            <SyntaxHighlighter
              language="html"
              style={vs}
              className="h-full rounded"
              customStyle={{ margin: 0, height: '100%', width: '100%' }}
            >
              {currentHtml || '<!-- HTML preview will appear here -->'}
            </SyntaxHighlighter>
            <div className="absolute bottom-4 left-4">
              <CopyButton code={currentHtml} />
            </div>
          </div>
        </div>

        {/* Right Column - Preview */}
        <div className="lg:w-1/2 w-full overflow-hidden">
          <div className="h-full p-4 relative">
            <div className="absolute top-6 right-6 flex gap-2 z-10">
              <ReloadButton iframeRef={iframeRef} />
              <ShareButton
                sessionId={history[historyIndex]?.sessionId}
                version={history[historyIndex]?.version}
                disabled={!history[historyIndex]?.sessionId || !history[historyIndex]?.version}
                onShare={async () => {
                  // The HTML is already saved when generated
                }}
              />
              <ExternalButton
                sessionId={history[historyIndex]?.sessionId}
                version={history[historyIndex]?.version}
                disabled={!history[historyIndex]?.sessionId || !history[historyIndex]?.version}
              />
            </div>
            <iframe
              ref={iframeRef}
              srcDoc={currentHtml}
              className="w-full h-full border rounded bg-white shadow-sm"
              style={{ minHeight: '100%', minWidth: '100%' }}
              scrolling="no"
              sandbox="allow-scripts"
            />
          </div>
        </div>

        {/* Sliding Debug Overlay */}
        <div className={`fixed top-0 right-0 h-screen w-[60vw] bg-white shadow-lg transform transition-transform duration-300 overflow-hidden z-50 ${isOverlayOpen ? 'translate-x-0' : 'translate-x-full'}`}>
          <div className="h-full flex flex-col p-4">
            <div className="flex justify-between items-center mb-4 flex-shrink-0">
              <h2 className="font-medium">Prompt</h2>
              <button
                onClick={() => setIsOverlayOpen(false)}
                className="text-gray-500 hover:text-gray-700"
              >
                ✕
              </button>
            </div>
            <pre className="flex-1 text-sm bg-gray-100 p-4 rounded overflow-auto">
              {getFormattedOutput()}
            </pre>
          </div>
        </div>
      </div>
      <div className="flex w-full max-w-3xl mx-auto">
        {/* Left column */}
        <div className="w-1/2 pr-4 pb-4 border-r">
          <div className="flex items-center justify-end text-sm text-gray-600">
            <span>Powered by</span>
            <img src="/groq-logo.webp" alt="Groq Logo" width={48} className="ml-2" />
          </div>
        </div>
        {/* Right column */}
        <div className="w-1/2 pl-4 pb-4">
        <div className="flex items-center justify-start text-sm text-gray-600">
            {history[historyIndex]?.usage && (
              <span>
                {(history[historyIndex].usage.total_time * 1000).toFixed(0)}ms • {Math.round(history[historyIndex].usage.total_tokens / history[historyIndex].usage.total_time)} tokens/sec
              </span>
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
