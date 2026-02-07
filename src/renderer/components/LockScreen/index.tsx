/**
 * LockScreen - Matrix-themed Lock Screen
 * Full-screen overlay with iconic Matrix digital rain aesthetic
 * "Wake up, Neo..." - The Matrix (1999)
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import MatrixRain from '../AgentMode/MatrixRain';
import './styles.css';

interface LockScreenProps {
  isLocked: boolean;
  onUnlock: () => void;
  autoLockMinutes?: number; // Auto-lock after N minutes of inactivity
}

// Matrix quotes for immersion - iconic lines from the trilogy
const MATRIX_QUOTES = [
  "Wake up, Neo...",
  "The Matrix has you...",
  "Follow the white rabbit.",
  "Knock, knock, Neo.",
  "There is no spoon.",
  "Free your mind.",
  "I know kung fu.",
  "Welcome to the real world.",
  "You take the red pill...",
  "The Matrix is everywhere.",
  "What is real?",
  "I'm going to show you a world...",
  "You've been living in a dream world.",
  "Unfortunately, no one can be told what the Matrix is.",
  "The body cannot live without the mind.",
  "Guns. Lots of guns.",
  "I'm trying to free your mind, Neo.",
  "Do not try to bend the spoon. That's impossible.",
  "He is the one.",
  "You have to let it all go, Neo.",
  "Everything that has a beginning has an end.",
  "Choice. The problem is choice.",
  "We're not here because we're free.",
  "Hope. It is the quintessential human delusion.",
  "To deny our own impulses is to deny the very thing that makes us human.",
  "You hear that, Mr. Anderson? That is the sound of inevitability.",
  "I've seen an agent punch through a concrete wall.",
  "Never send a human to do a machine's job.",
  "Human beings are a disease, a cancer of this planet.",
  "The Matrix is a system, Neo.",
];

const LockScreen: React.FC<LockScreenProps> = ({ 
  isLocked, 
  onUnlock,
  autoLockMinutes = 0 
}) => {
  const [currentQuote, setCurrentQuote] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [showUnlockHint, setShowUnlockHint] = useState(false);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [glitchActive, setGlitchActive] = useState(false);
  const typingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const quoteIndexRef = useRef(0);

  // Update time every second
  useEffect(() => {
    if (!isLocked) return;
    
    const interval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(interval);
  }, [isLocked]);

  // Typing effect for Matrix quotes
  useEffect(() => {
    if (!isLocked) return;

    const typeQuote = () => {
      const quote = MATRIX_QUOTES[quoteIndexRef.current % MATRIX_QUOTES.length];
      setCurrentQuote(quote);
      setDisplayedText('');
      
      let charIndex = 0;
      const typeChar = () => {
        if (charIndex <= quote.length) {
          setDisplayedText(quote.slice(0, charIndex));
          charIndex++;
          typingTimeoutRef.current = setTimeout(typeChar, 80 + Math.random() * 40);
        } else {
          // Wait, then show next quote
          typingTimeoutRef.current = setTimeout(() => {
            quoteIndexRef.current++;
            typeQuote();
          }, 4000);
        }
      };
      typeChar();
    };

    // Start typing after a brief delay
    const initialDelay = setTimeout(() => {
      typeQuote();
      // Show unlock hint after first quote
      setTimeout(() => setShowUnlockHint(true), 3000);
    }, 1000);

    return () => {
      clearTimeout(initialDelay);
      if (typingTimeoutRef.current) {
        clearTimeout(typingTimeoutRef.current);
      }
    };
  }, [isLocked]);

  // Random glitch effect
  useEffect(() => {
    if (!isLocked) return;

    const glitchInterval = setInterval(() => {
      if (Math.random() > 0.85) {
        setGlitchActive(true);
        setTimeout(() => setGlitchActive(false), 150);
      }
    }, 2000);

    return () => clearInterval(glitchInterval);
  }, [isLocked]);

  // Handle unlock
  const handleUnlock = useCallback(() => {
    if (isUnlocking) return;
    
    setIsUnlocking(true);
    
    // Dramatic unlock animation
    setTimeout(() => {
      onUnlock();
      setIsUnlocking(false);
      setShowUnlockHint(false);
      setDisplayedText('');
      quoteIndexRef.current = 0;
    }, 800);
  }, [isUnlocking, onUnlock]);

  // Keyboard unlock
  useEffect(() => {
    if (!isLocked) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      // Allow Ctrl+Shift+L to toggle lock, but any other key unlocks
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === 'l') {
        return;
      }
      handleUnlock();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isLocked, handleUnlock]);

  if (!isLocked) return null;

  // Format time in Matrix style (24-hour with leading zeros)
  const formatTime = (date: Date) => {
    const hours = date.getHours().toString().padStart(2, '0');
    const minutes = date.getMinutes().toString().padStart(2, '0');
    const seconds = date.getSeconds().toString().padStart(2, '0');
    return { hours, minutes, seconds };
  };

  const formatDate = (date: Date) => {
    const options: Intl.DateTimeFormatOptions = { 
      weekday: 'long', 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    };
    return date.toLocaleDateString('en-US', options);
  };

  const time = formatTime(currentTime);

  return (
    <div 
      className={`matrix-lock-screen ${isUnlocking ? 'unlocking' : ''} ${glitchActive ? 'glitch' : ''}`}
      onClick={handleUnlock}
    >
      {/* Matrix Rain Background - Movie-authentic multi-layer effect */}
      <MatrixRain 
        opacity={0.4} 
        speed={1.2} 
        density={0.96}
        glowingHeads={true}
        layers={3}
        charset="classic"
        morphing={true}
      />
      
      {/* Scanline overlay */}
      <div className="lock-scanlines" />
      
      {/* CRT vignette effect */}
      <div className="lock-vignette" />
      
      {/* Main content */}
      <div className="lock-content">
        {/* Matrix-style logo */}
        <div className="lock-logo">
          <span className="logo-bracket">[</span>
          <span className="logo-text">AGENT</span>
          <span className="logo-prime">PRIME</span>
          <span className="logo-bracket">]</span>
        </div>

        {/* Digital clock */}
        <div className="lock-clock">
          <div className="clock-time">
            <span className="clock-segment hours">{time.hours}</span>
            <span className="clock-colon">:</span>
            <span className="clock-segment minutes">{time.minutes}</span>
            <span className="clock-colon dim">:</span>
            <span className="clock-segment seconds dim">{time.seconds}</span>
          </div>
          <div className="clock-date">{formatDate(currentTime)}</div>
        </div>

        {/* Matrix quote with typing effect */}
        <div className="lock-quote">
          <span className="quote-text">{displayedText}</span>
          <span className="quote-cursor">▌</span>
        </div>

        {/* Unlock hint */}
        <div className={`lock-hint ${showUnlockHint ? 'visible' : ''}`}>
          <div className="hint-icon">⌨</div>
          <div className="hint-text">Press any key or click to enter the Matrix</div>
          <div className="hint-shortcut">Ctrl+Shift+L to lock</div>
        </div>

        {/* Unlock animation overlay */}
        {isUnlocking && (
          <div className="unlock-animation">
            <div className="unlock-text">ACCESSING SYSTEM...</div>
            <div className="unlock-progress">
              <div className="progress-bar" />
            </div>
          </div>
        )}
      </div>

      {/* Matrix code rain on sides (decorative) */}
      <div className="lock-side-code left">
        {Array(20).fill(0).map((_, i) => (
          <div key={`left-${i}`} className="code-line" style={{ animationDelay: `${i * 0.1}s` }}>
            {Array(8).fill(0).map((_, j) => (
              <span key={j}>{String.fromCharCode(0x30A0 + Math.random() * 96)}</span>
            ))}
          </div>
        ))}
      </div>
      <div className="lock-side-code right">
        {Array(20).fill(0).map((_, i) => (
          <div key={`right-${i}`} className="code-line" style={{ animationDelay: `${i * 0.15}s` }}>
            {Array(8).fill(0).map((_, j) => (
              <span key={j}>{String.fromCharCode(0x30A0 + Math.random() * 96)}</span>
            ))}
          </div>
        ))}
      </div>

      {/* Bottom system info */}
      <div className="lock-system-info">
        <span className="system-item">◉ SECURE</span>
        <span className="system-divider">│</span>
        <span className="system-item">MATRIX v4.1</span>
        <span className="system-divider">│</span>
        <span className="system-item">NODE: PRIME-{Math.floor(Math.random() * 999).toString().padStart(3, '0')}</span>
      </div>
    </div>
  );
};

export default LockScreen;
