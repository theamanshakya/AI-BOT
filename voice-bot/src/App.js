import React, { useState, useEffect, useCallback, useRef } from 'react';
import './App.css';

const App = () => {
  const [socket, setSocket] = useState(null);
  const [isActive, setIsActive] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [recognition, setRecognition] = useState(null);
  const synth = window.speechSynthesis;
  const chatContainerRef = useRef(null);
  const speechTimeout = useRef(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const speechQueue = useRef([]);

  // Auto-scroll to bottom when new messages arrive
  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages]);

  // Initialize speech recognition
  useEffect(() => {
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      const recognition = new SpeechRecognition();
      recognition.continuous = true;
      recognition.interimResults = true;
      recognition.lang = 'en-IN';

      recognition.onstart = () => {
        console.log('Speech recognition started');
      };

      recognition.onend = () => {
        if (isActive) {
          try {
            recognition.start();
          } catch (error) {
            console.error('Error restarting recognition:', error);
          }
        }
      };

      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'no-speech' && isActive) {
          try {
            recognition.start();
          } catch (error) {
            console.error('Error restarting recognition:', error);
          }
        }
      };

      recognition.onspeechstart = () => {
        if (isSpeaking) {
          synth.cancel();
          setIsSpeaking(false);
        }
      };

      recognition.onresult = (event) => {
        const transcript = event.results[event.results.length - 1];

        if (speechTimeout.current) {
          clearTimeout(speechTimeout.current);
        }

        if (transcript.isFinal) {
          const text = transcript[0].transcript.trim();
          if (text) {
            setMessages(prev => [...prev, { sender: 'User', text }]);
            if (socket && socket.readyState === WebSocket.OPEN) {
              socket.send(JSON.stringify({
                type: 'message',
                text
              }));
            }
          }
        }
      };

      recognition.onspeechend = () => {
        speechTimeout.current = setTimeout(() => {
          recognition.stop();
        }, 1000);
      };

      setRecognition(recognition);
    } else {
      console.error('Speech recognition not supported in this browser');
    }
  }, [isActive, socket, isSpeaking]);

  // Initialize WebSocket connection
  useEffect(() => {
    const ws = new WebSocket('ws://localhost:8080');

    ws.onopen = () => {
      console.log('Connected to WebSocket server');
      setSocket(ws);
    };

    ws.onmessage = (event) => {
      const data = JSON.parse(event.data);
      if (data.type === 'response') {
        setMessages(prev => [...prev, {
          sender: 'AI',
          text: data.text
        }]);
        speak(data.text);
      } else if (data.type === 'error') {
        console.error(data.message);
      }
    };

    ws.onerror = (error) => {
      console.error('WebSocket error:', error);
    };

    ws.onclose = () => {
      console.log('Disconnected from WebSocket server');
      setIsActive(false);
    };

    return () => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, []);

  // Add a new function to initialize voices
  const initializeVoices = useCallback(() => {
    // Some browsers need this to load voices
    if (speechSynthesis.onvoiceschanged !== undefined) {
      speechSynthesis.onvoiceschanged = () => {
        const voices = synth.getVoices();
        // Include Indian English and other natural voices
        const preferredVoices = [
          'Microsoft Heera',       // Windows Indian English
          'Google UK English Male', // Chrome UK English male
          'Google UK English Female', // Chrome UK English female
          'Veena',                 // Indian English voice (macOS/others)
          'Google हिन्दी',          // Chrome Hindi
          'Karen',                 // macOS natural voice
          'Daniel',                // UK English male
          'Samantha',              // macOS natural voice
        ];

        // Find a preferred voice or fall back to a default
        const voice = voices.find(v =>
          preferredVoices.some(pv => v.name.includes(pv))
        ) || voices.find(v =>
          v.lang === 'en-IN' // Prioritize Indian English voices
        ) || voices.find(v =>
          v.lang === 'hi-IN' && v.name.includes('India') // Hindi
        ) || voices.find(v =>
          v.lang === 'en-US' && v.name.includes('Female') // Fallback to US female
        ) || voices[0]; // Absolute fallback
        console.log(voices);
        
        if (voice) {
          console.log('Selected voice:', voice.name);
        }
      };
    }
  }, [synth]);


  // Initialize voices when component mounts
  useEffect(() => {
    initializeVoices();
  }, [initializeVoices]);

  // Add this new function to handle speech queue
  const processSpeechQueue = useCallback(() => {
    if (speechQueue.current.length === 0 || isProcessing) {
      return;
    }

    setIsProcessing(true);
    const text = speechQueue.current.shift();
    
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = synth.getVoices();
    const preferredVoices = [
      'Microsoft Heera',
      'Google UK English Male',
      'Google UK English Female',
      'Veena',
      'Google हिन्दी',
      'Karen',
      'Daniel',
      'Samantha',
    ];

    const voice = voices.find(v =>
      preferredVoices.some(pv => v.name.includes(pv))
    ) || voices.find(v =>
      v.lang === 'hi-IN' && v.name.includes('India')
    ) || voices[0];

    if (voice) {
      utterance.voice = voice;
    }

    utterance.rate = 1.2;
    utterance.pitch = 0.6;
    utterance.volume = 0.9;

    const processedText = text
      .replace(/([.!?])\s+/g, '$1|')
      .replace(/,\s+/g, ',|')
      .split('|')
      .join(' ');

    utterance.text = processedText;

    utterance.onstart = () => {
      setIsSpeaking(true);
    };

    utterance.onend = () => {
      setIsSpeaking(false);
      setIsProcessing(false);
      setTimeout(() => processSpeechQueue(), 100);
    };

    utterance.onerror = (error) => {
      console.error('Speech synthesis error:', error);
      setIsSpeaking(false);
      setIsProcessing(false);
      
      switch (error.error) {
        case 'interrupted':
          speechQueue.current = [];
          setTimeout(() => setIsProcessing(false), 100);
          break;
        case 'canceled':
          speechQueue.current = [];
          setTimeout(() => setIsProcessing(false), 100);
          break;
        default:
          if (speechQueue.current.length > 0) {
            setTimeout(() => processSpeechQueue(), 100);
          }
      }
    };

    try {
      synth.speak(utterance);
    } catch (error) {
      console.error('Speech synthesis failed:', error);
      setIsProcessing(false);
      setIsSpeaking(false);
      speechQueue.current = [];
    }
  }, [synth, isProcessing]);

  // Modified speak function
  const speak = useCallback((text) => {
    if (synth.speaking) {
      synth.cancel(); // Cancel current speech
      speechQueue.current = []; // Clear the queue
    }
    
    speechQueue.current.push(text);
    processSpeechQueue();
  }, [synth, processSpeechQueue]);

  // Handle cleanup
  useEffect(() => {
    return () => {
      if (synth.speaking) {
        synth.cancel();
      }
      speechQueue.current = [];
      if (speechTimeout.current) {
        clearTimeout(speechTimeout.current);
      }
    };
  }, []);

  const toggleConversation = () => {
    if (!recognition) {
      console.error('Speech recognition not initialized');
      return;
    }

    if (!isActive) {
      setIsActive(true);
      setMessages([]);
      try {
        recognition.start();
        setMessages([{
          sender: 'AI',
          text: 'Conversation started. How can I help you?'
        }]);
      } catch (error) {
        console.error('Error starting recognition:', error);
      }
    } else {
      setIsActive(false);
      recognition.stop();
      if (synth.speaking) {
        synth.cancel();
      }
      setMessages(prev => [...prev, {
        sender: 'AI',
        text: 'Conversation ended. Click Start to begin a new conversation.'
      }]);
    }
  };

  return (
    <div className="app-container">
      <h1 className="app-header">AI Voice Conversation Bot</h1>

      <div className="control-panel">
        <button
          onClick={toggleConversation}
          className={`toggle-button ${isActive ? 'active' : 'inactive'}`}
        >
          {isActive ? 'Stop Conversation' : 'Start Conversation'}
        </button>
      </div>

      <div className="chat-container" ref={chatContainerRef}>
        {messages.map((msg, index) => (
          <div
            key={index}
            className={`message-wrapper ${msg.sender === 'User' ? 'user-message' : 'ai-message'}`}
          >
            <div className="message-bubble">
              {msg.text}
            </div>
          </div>
        ))}
      </div>

      {isActive && (
        <div className="status-indicator">
          <div className="listening-indicator"></div>
          {isSpeaking ? 'AI is speaking...' : 'Listening... Speak to interact'}
        </div>
      )}
    </div>
  );
};

export default App;
