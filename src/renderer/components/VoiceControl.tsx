import React, { useState, useEffect, useRef } from 'react';

interface VoiceControlProps {
  onVoiceCommand: (command: string, action: any) => void;
  isListening: boolean;
  onToggleListening: () => void;
}

declare global {
  interface Window {
    SpeechRecognition: any;
    webkitSpeechRecognition: any;
  }
}

const VoiceControl: React.FC<VoiceControlProps> = ({
  onVoiceCommand,
  isListening,
  onToggleListening
}) => {
  const [transcript, setTranscript] = useState('');
  const [isProcessing, setIsProcessing] = useState(false);
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    // Initialize speech recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;

    if (SpeechRecognition) {
      recognitionRef.current = new SpeechRecognition();
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = true;
      recognitionRef.current.lang = 'en-US';

      recognitionRef.current.onresult = (event: any) => {
        let finalTranscript = '';
        let interimTranscript = '';

        for (let i = event.resultIndex; i < event.results.length; i++) {
          const transcriptPart = event.results[i][0].transcript;
          if (event.results[i].isFinal) {
            finalTranscript += transcriptPart;
          } else {
            interimTranscript += transcriptPart;
          }
        }

        setTranscript(finalTranscript || interimTranscript);

        if (finalTranscript) {
          handleVoiceCommand(finalTranscript);
        }
      };

      recognitionRef.current.onend = () => {
        if (isListening) {
          // Restart listening for continuous mode
          setTimeout(() => {
            if (recognitionRef.current && isListening) {
              recognitionRef.current.start();
            }
          }, 100);
        }
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          alert('Microphone access denied. Please allow microphone access and try again.');
        }
      };
    } else {
      console.warn('Speech recognition not supported in this browser');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (isListening && recognitionRef.current) {
      recognitionRef.current.start();
    } else if (!isListening && recognitionRef.current) {
      recognitionRef.current.stop();
    }
  }, [isListening]);

  const handleVoiceCommand = async (command: string) => {
    setIsProcessing(true);
    try {
      // Send to voice processing
      const result = await window.agentAPI.processVoiceCommand(command);
      onVoiceCommand(command, result);
    } catch (error) {
      console.error('Voice command processing error:', error);
    } finally {
      setIsProcessing(false);
    }
  };

  const requestMicrophonePermission = async () => {
    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      onToggleListening();
    } catch (error) {
      alert('Microphone permission required for voice control');
    }
  };

  return (
    <div style={{
      position: 'fixed',
      bottom: '60px', // Above status bar (28px) + padding
      right: '20px',
      zIndex: 1000
    }}>
      <div style={{
        backgroundColor: isListening ? 'var(--prime-accent)' : 'var(--prime-surface)',
        color: isListening ? 'white' : 'var(--prime-text)',
        padding: '12px 16px',
        borderRadius: '50px',
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        boxShadow: 'var(--prime-shadow-md)',
        border: isListening ? 'none' : '1px solid var(--prime-border)',
        transition: 'all 0.2s ease'
      }} onClick={isListening ? onToggleListening : requestMicrophonePermission}>
        <div style={{
          width: '16px',
          height: '16px',
          borderRadius: '50%',
          backgroundColor: isListening ? '#fff' : 'transparent',
          border: isListening ? 'none' : '2px solid var(--prime-accent)',
          animation: isListening ? 'pulse 1.5s infinite' : 'none'
        }} />

        <div style={{ fontSize: '13px', fontWeight: '600' }}>
          {isProcessing ? '🎯 Processing...' :
           isListening ? '🎤 Listening...' :
           '🎤 Voice'}
        </div>
      </div>

      {(transcript || isListening) && (
        <div style={{
          position: 'absolute',
          bottom: '60px',
          right: '0',
          backgroundColor: 'var(--prime-surface)',
          color: 'var(--prime-text)',
          padding: '12px 16px',
          borderRadius: '12px',
          maxWidth: '280px',
          fontSize: '13px',
          whiteSpace: 'pre-wrap',
          boxShadow: 'var(--prime-shadow-lg)',
          border: '1px solid var(--prime-border)'
        }}>
          {isProcessing ? `🎯 "${transcript}"` : transcript}
        </div>
      )}

      <style>{`
        @keyframes pulse {
          0% { transform: scale(1); opacity: 1; }
          50% { transform: scale(1.2); opacity: 0.7; }
          100% { transform: scale(1); opacity: 1; }
        }
      `}</style>
    </div>
  );
};

export default VoiceControl;
