import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';

interface DinoBuddyProps {
  isVisible?: boolean;
  onClick?: () => void;
  onHide?: () => void;
  emotion?: DinoEmotion;
  isLoading?: boolean;
  energy?: number; // 0-100
}

type DinoEmotion = 
  | 'neutral' 
  | 'happy' 
  | 'excited' 
  | 'thinking' 
  | 'curious' 
  | 'reflective' 
  | 'sad' 
  | 'energetic' 
  | 'dreaming'
  | 'love'
  | 'volcanic'
  | 'coding'
  | 'success'
  | 'error';

interface DinoExpression {
  emoji: string;
  altEmoji?: string;
  glowColor: string;
  animation: string;
  messages: string[];
}

interface Position {
  x: number;
  y: number;
}

interface Sparkle {
  id: number;
  x: number;
  y: number;
  size: number;
  delay: number;
}

// 🦖 DINO BUDDY MODE - The Ultimate Companion Experience 🦕
const DinoBuddy: React.FC<DinoBuddyProps> = ({
  isVisible = true,
  onClick,
  onHide,
  emotion: propEmotion,
  isLoading = false,
  energy: propEnergy
}) => {
  // Core state
  const [currentEmotion, setCurrentEmotion] = useState<DinoEmotion>('neutral');
  const [energy, setEnergy] = useState(propEnergy ?? 75);
  const [isDragging, setIsDragging] = useState(false);
  const [position, setPosition] = useState<Position>({ x: 20, y: window.innerHeight - 200 });
  const [dragOffset, setDragOffset] = useState<Position>({ x: 0, y: 0 });
  const [showCloseHint, setShowCloseHint] = useState(false);
  
  // Visual effects state
  const [currentMessage, setCurrentMessage] = useState('');
  const [showThoughtBubble, setShowThoughtBubble] = useState(true);
  const [sparkles, setSparkles] = useState<Sparkle[]>([]);
  const [pulseGlow, setPulseGlow] = useState(false);
  const [isBlinking, setIsBlinking] = useState(false);
  const [useAltEmoji, setUseAltEmoji] = useState(false);
  
  // Interaction tracking
  const [interactionCount, setInteractionCount] = useState(0);
  const [lastPetTime, setLastPetTime] = useState(0);
  const [petStreak, setPetStreak] = useState(0);
  
  const buddyRef = useRef<HTMLDivElement>(null);
  const thoughtTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const sparkleIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 🎨 Expression configurations with personality
  const expressions: Record<DinoEmotion, DinoExpression> = useMemo(() => ({
    neutral: {
      emoji: '🦖',
      altEmoji: '🦕',
      glowColor: '#34d399',
      animation: 'float',
      messages: [
        "Hey there, buddy! 🦕",
        "Ready to code something cool? ✨",
        "What are we building today?",
        "I'm here if you need me! 💚",
        "*happy dino noises* 🎵",
        "Let's make something awesome!",
        "Feeling creative today? 🎨"
      ]
    },
    happy: {
      emoji: '🦖',
      altEmoji: '😊',
      glowColor: '#4ade80',
      animation: 'bounce',
      messages: [
        "YAYYY! This is great! 🎉",
        "You're doing amazing! ✨",
        "I love working with you! 💖",
        "This makes me SO happy! 😄",
        "*excited tail wagging* 🦖",
        "Best. Day. EVER!",
        "You rock, my friend! 🤘"
      ]
    },
    excited: {
      emoji: '🤩',
      altEmoji: '🎉',
      glowColor: '#facc15',
      animation: 'jump',
      messages: [
        "OMG OMG OMG!!! 🎊",
        "THIS IS AMAZING!!! ✨✨✨",
        "I CAN'T CONTAIN MY JOY! 💥",
        "*bouncing intensifies* 🦖",
        "YESSSSS! LET'S GOOO! 🚀",
        "SO! MUCH! EXCITEMENT! 🎉",
        "AHHHHH I LOVE THIS! 💖"
      ]
    },
    thinking: {
      emoji: '🤔',
      altEmoji: '🧠',
      glowColor: '#a78bfa',
      animation: 'pulse',
      messages: [
        "Hmm, let me think... 🧠",
        "Processing... 💭",
        "Interesting... 🤔",
        "*strokes chin thoughtfully*",
        "What if we tried... 💡",
        "Computing possibilities...",
        "Give me a moment... ⏳"
      ]
    },
    curious: {
      emoji: '🦕',
      altEmoji: '👀',
      glowColor: '#38bdf8',
      animation: 'tilt',
      messages: [
        "Ooh, what's this? 👀",
        "Tell me more! 🦕",
        "That's fascinating! ✨",
        "*tilts head curiously*",
        "I wanna learn more! 📚",
        "How does that work? 🔍",
        "Interesting approach! 🤓"
      ]
    },
    reflective: {
      emoji: '🦖',
      altEmoji: '💭',
      glowColor: '#818cf8',
      animation: 'float',
      messages: [
        "You know what... 💭",
        "I've been thinking... 🌙",
        "Remember when we... ✨",
        "*philosophical dino noises*",
        "Life's pretty cool, huh? 🌈",
        "We've come so far... 🦖",
        "Grateful for this journey 💖"
      ]
    },
    sad: {
      emoji: '🥺',
      altEmoji: '😢',
      glowColor: '#60a5fa',
      animation: 'droop',
      messages: [
        "Aww, it's okay... 💙",
        "We'll figure it out 🦖",
        "*comforting dino hug*",
        "I believe in you! 💪",
        "Bugs happen to everyone 🐛",
        "Let's try again together 💚",
        "I'm here for you... 🦕"
      ]
    },
    energetic: {
      emoji: '⚡',
      altEmoji: '🔥',
      glowColor: '#fb923c',
      animation: 'vibrate',
      messages: [
        "LET'S GOOOOO! 🚀",
        "FULL POWER MODE! ⚡",
        "UNSTOPPABLE! 💪",
        "*RAWR* 🦖🔥",
        "CODING SPREE! 💻",
        "MAXIMUM ENERGY! ⚡⚡",
        "WE GOT THIS! 🎯"
      ]
    },
    dreaming: {
      emoji: '😴',
      altEmoji: '💤',
      glowColor: '#0ea5e9',
      animation: 'drift',
      messages: [
        "Zzz... dreams of code... 💤",
        "*snoring softly* 😴",
        "Dreaming of features... ✨",
        "Just a quick nap... 🌙",
        "*peaceful dino sleep*",
        "Recharging... 🔋",
        "Zzz... 🦖💤"
      ]
    },
    love: {
      emoji: '🥰',
      altEmoji: '💖',
      glowColor: '#fb7185',
      animation: 'heartbeat',
      messages: [
        "I love coding with you! 💖",
        "You're the best! 🥰",
        "My favorite human! 💕",
        "*happy heart eyes* 😍",
        "So glad we're a team! 💚",
        "You make coding fun! ✨",
        "Best coding buddy ever! 🦖💖"
      ]
    },
    volcanic: {
      emoji: '🌋',
      altEmoji: '🔥',
      glowColor: '#ef4444',
      animation: 'explode',
      messages: [
        "VOLCANIC MODE ACTIVATED!!! 🌋🔥",
        "PURE. CODING. POWER!!! 💥",
        "NOTHING CAN STOP US!!! ⚡",
        "MAXIMUM OVERDRIVE!!! 🚀🔥",
        "LEGENDARY STATUS!!! 👑",
        "WE'RE ON FIRE!!! 🔥🔥🔥",
        "ABSOLUTE DOMINATION!!! 💪"
      ]
    },
    coding: {
      emoji: '💻',
      altEmoji: '⌨️',
      glowColor: '#22c55e',
      animation: 'type',
      messages: [
        "Click clack click clack... 💻",
        "Writing beautiful code... ✨",
        "In the zone! 🎯",
        "*focused dino coding*",
        "Lines of magic... 🪄",
        "Flow state achieved! 🧘",
        "Creating masterpiece... 🎨"
      ]
    },
    success: {
      emoji: '🎉',
      altEmoji: '🏆',
      glowColor: '#22c55e',
      animation: 'celebrate',
      messages: [
        "WE DID IT! 🎉🎊",
        "VICTORY! 🏆",
        "SHIP IT! 🚀",
        "*celebration dance* 💃",
        "ANOTHER WIN! ✨",
        "You're a genius! 🧠",
        "HIGH FIVE! ✋"
      ]
    },
    error: {
      emoji: '😅',
      altEmoji: '🔧',
      glowColor: '#f97316',
      animation: 'shake',
      messages: [
        "Oops! Let's fix that! 🔧",
        "No worries, we got this! 💪",
        "Bugs are just features! 🐛",
        "*puts on debugging hat*",
        "Time to investigate! 🔍",
        "Challenge accepted! 🦖",
        "We'll figure it out! 💚"
      ]
    }
  }), []);

  // Get current expression based on state
  const currentExpression = expressions[propEmotion || currentEmotion];
  const displayEmoji = useAltEmoji && currentExpression.altEmoji 
    ? currentExpression.altEmoji 
    : currentExpression.emoji;

  // 🎯 Load saved position on mount
  useEffect(() => {
    const savedPosition = localStorage.getItem('agentprime-dino-position');
    if (savedPosition) {
      try {
        const pos = JSON.parse(savedPosition);
        setPosition({
          x: Math.max(0, Math.min(pos.x, window.innerWidth - 100)),
          y: Math.max(0, Math.min(pos.y, window.innerHeight - 180))
        });
      } catch (e) {
        console.warn('Failed to load Dino position:', e);
      }
    }
    
    // Load interaction stats
    const savedStats = localStorage.getItem('agentprime-dino-stats');
    if (savedStats) {
      try {
        const stats = JSON.parse(savedStats);
        setInteractionCount(stats.interactionCount || 0);
        setEnergy(stats.energy || 75);
      } catch (e) {
        console.warn('Failed to load Dino stats:', e);
      }
    }
  }, []);

  // 💾 Save position when it changes
  useEffect(() => {
    if (!isDragging) {
      localStorage.setItem('agentprime-dino-position', JSON.stringify(position));
    }
  }, [position, isDragging]);

  // 💾 Save stats periodically
  useEffect(() => {
    const saveStats = () => {
      localStorage.setItem('agentprime-dino-stats', JSON.stringify({
        interactionCount,
        energy,
        lastSeen: Date.now()
      }));
    };
    
    const interval = setInterval(saveStats, 30000); // Save every 30s
    return () => clearInterval(interval);
  }, [interactionCount, energy]);

  // 💭 Rotating thought bubbles
  useEffect(() => {
    const showNewThought = () => {
      const messages = currentExpression.messages;
      const newMessage = messages[Math.floor(Math.random() * messages.length)];
      setCurrentMessage(newMessage);
      setShowThoughtBubble(true);
      
      // Hide bubble after some time
      thoughtTimeoutRef.current = setTimeout(() => {
        setShowThoughtBubble(false);
      }, 6000);
    };

    // Show initial thought
    showNewThought();

    // Rotate thoughts every 8-12 seconds
    const interval = setInterval(() => {
      showNewThought();
    }, 8000 + Math.random() * 4000);

    return () => {
      clearInterval(interval);
      if (thoughtTimeoutRef.current) clearTimeout(thoughtTimeoutRef.current);
    };
  }, [currentExpression, currentEmotion]);

  // ✨ Sparkle effect system
  useEffect(() => {
    const positiveEmotions: DinoEmotion[] = ['happy', 'excited', 'love', 'volcanic', 'success', 'energetic'];
    const shouldSparkle = positiveEmotions.includes(propEmotion || currentEmotion);

    if (shouldSparkle) {
      const createSparkle = () => {
        const newSparkle: Sparkle = {
          id: Date.now() + Math.random(),
          x: Math.random() * 80 - 10,
          y: Math.random() * 80 - 10,
          size: 8 + Math.random() * 8,
          delay: Math.random() * 0.5
        };
        
        setSparkles(prev => [...prev.slice(-5), newSparkle]);
        
        // Remove sparkle after animation
        setTimeout(() => {
          setSparkles(prev => prev.filter(s => s.id !== newSparkle.id));
        }, 1500);
      };

      sparkleIntervalRef.current = setInterval(createSparkle, 500);
      createSparkle(); // Initial sparkle
    }

    return () => {
      if (sparkleIntervalRef.current) clearInterval(sparkleIntervalRef.current);
    };
  }, [currentEmotion, propEmotion]);

  // 👀 Random blinking
  useEffect(() => {
    const blink = () => {
      setIsBlinking(true);
      setTimeout(() => setIsBlinking(false), 150);
    };

    const interval = setInterval(() => {
      if (Math.random() > 0.7) blink();
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // 🔄 Emoji switching for variety
  useEffect(() => {
    const interval = setInterval(() => {
      if (Math.random() > 0.8) {
        setUseAltEmoji(prev => !prev);
      }
    }, 5000);

    return () => clearInterval(interval);
  }, []);

  // 🌟 Glow pulse effect
  useEffect(() => {
    const interval = setInterval(() => {
      setPulseGlow(true);
      setTimeout(() => setPulseGlow(false), 1000);
    }, 3000);

    return () => clearInterval(interval);
  }, []);

  // 🖱️ Drag handling
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    setIsDragging(true);
    setDragOffset({
      x: e.clientX - position.x,
      y: e.clientY - position.y
    });
  }, [position]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      const newX = Math.max(0, Math.min(e.clientX - dragOffset.x, window.innerWidth - 100));
      const newY = Math.max(0, Math.min(e.clientY - dragOffset.y, window.innerHeight - 180));
      
      setPosition({ x: newX, y: newY });
    };

    const handleMouseUp = () => {
      setIsDragging(false);
    };

    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
    }

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
  }, [isDragging, dragOffset]);

  // 📐 Window resize handling
  useEffect(() => {
    const handleResize = () => {
      setPosition(prev => ({
        x: Math.max(0, Math.min(prev.x, window.innerWidth - 100)),
        y: Math.max(0, Math.min(prev.y, window.innerHeight - 180))
      }));
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // 🎮 Pet the dino! (click interaction)
  const handlePet = useCallback(() => {
    const now = Date.now();
    
    // Track pet streaks for bonus happiness
    if (now - lastPetTime < 5000) {
      setPetStreak(prev => prev + 1);
    } else {
      setPetStreak(1);
    }
    setLastPetTime(now);
    
    // Increase energy and happiness
    setEnergy(prev => Math.min(100, prev + 5));
    setInteractionCount(prev => prev + 1);
    
    // Change emotion based on pet streak
    if (petStreak >= 5) {
      setCurrentEmotion('volcanic');
    } else if (petStreak >= 3) {
      setCurrentEmotion('excited');
    } else if (petStreak >= 2) {
      setCurrentEmotion('happy');
    } else {
      setCurrentEmotion('love');
    }
    
    // Trigger sparkle burst
    const burst = Array.from({ length: 5 }, (_, i) => ({
      id: Date.now() + i,
      x: 30 + Math.random() * 40,
      y: 20 + Math.random() * 40,
      size: 10 + Math.random() * 10,
      delay: i * 0.1
    }));
    setSparkles(prev => [...prev, ...burst]);
    
    // Clear burst sparkles
    setTimeout(() => {
      setSparkles(prev => prev.filter(s => !burst.find(b => b.id === s.id)));
    }, 1500);
    
    // Reset to neutral after excitement
    setTimeout(() => {
      setCurrentEmotion('neutral');
    }, 3000);
    
    // Call parent onClick if provided
    if (onClick) onClick();
  }, [lastPetTime, petStreak, onClick]);

  // 🙈 Hide handler
  const handleHide = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    if (onHide) onHide();
  }, [onHide]);

  // 🎧 Listen for external emotion events
  useEffect(() => {
    const handleDinoReaction = (event: CustomEvent<{ emotion: DinoEmotion; message?: string }>) => {
      setCurrentEmotion(event.detail.emotion);
      if (event.detail.message) {
        setCurrentMessage(event.detail.message);
        setShowThoughtBubble(true);
      }
      
      // Reset after a while
      setTimeout(() => {
        setCurrentEmotion('neutral');
      }, 5000);
    };

    window.addEventListener('dino-reaction' as any, handleDinoReaction);
    
    // Also listen for IPC events
    if ((window as any).electronAPI?.onDinoReaction) {
      (window as any).electronAPI.onDinoReaction((_: any, data: any) => {
        handleDinoReaction(new CustomEvent('dino-reaction', { detail: data }));
      });
    }

    return () => {
      window.removeEventListener('dino-reaction' as any, handleDinoReaction);
    };
  }, []);

  // Get energy level label
  const getEnergyLevel = (): string => {
    if (energy >= 80) return 'Volcanic 🌋';
    if (energy >= 50) return 'Enthusiastic ⚡';
    if (energy >= 25) return 'Calm 🧘';
    return 'Sleepy 💤';
  };

  // Get energy bar color
  const getEnergyColor = (): string => {
    if (energy >= 80) return '#ef4444';
    if (energy >= 50) return '#22c55e';
    if (energy >= 25) return '#38bdf8';
    return '#6366f1';
  };

  if (!isVisible) return null;

  const animationClass = `dino-${currentExpression.animation}`;
  const emotionClass = `dino-emotion-${propEmotion || currentEmotion}`;

  return (
    <div
      ref={buddyRef}
      className={`dino-buddy-mode ${animationClass} ${emotionClass} ${isDragging ? 'dragging' : ''} ${pulseGlow ? 'pulse-glow' : ''}`}
      style={{
        left: `${position.x}px`,
        top: `${position.y}px`,
        '--glow-color': currentExpression.glowColor,
        '--energy-color': getEnergyColor(),
        '--energy-percent': `${energy}%`
      } as React.CSSProperties}
      onMouseEnter={() => setShowCloseHint(true)}
      onMouseLeave={() => setShowCloseHint(false)}
      title="🦖 Click to pet! Drag to move!"
    >
      {/* 🌟 Sparkle particles */}
      <div className="dino-sparkles">
        {sparkles.map(sparkle => (
          <div
            key={sparkle.id}
            className="dino-sparkle"
            style={{
              left: `${sparkle.x}%`,
              top: `${sparkle.y}%`,
              width: `${sparkle.size}px`,
              height: `${sparkle.size}px`,
              animationDelay: `${sparkle.delay}s`
            }}
          >
            ✨
          </div>
        ))}
      </div>

      {/* 🔮 Glow layers */}
      <div className="dino-glow-outer" />
      <div className="dino-glow-inner" />

      {/* ❌ Close button */}
      <button
        className={`dino-close-btn ${showCloseHint ? 'visible' : ''}`}
        onClick={handleHide}
        title="Hide Dino Buddy"
      >
        ×
      </button>

      {/* 💭 Thought bubble */}
      {showThoughtBubble && currentMessage && (
        <div className={`dino-thought-bubble ${isLoading ? 'thinking' : ''}`}>
          <span className="thought-text">{isLoading ? 'Thinking... 🧠' : currentMessage}</span>
          <div className="thought-tail" />
        </div>
      )}

      {/* 🦖 Main avatar */}
      <div 
        className={`dino-avatar-main ${isBlinking ? 'blink' : ''}`}
        onMouseDown={handleMouseDown}
        onClick={!isDragging ? handlePet : undefined}
      >
        <span className="dino-emoji-main">{displayEmoji}</span>
        
        {/* 👑 Crown for high energy */}
        {energy >= 90 && <span className="dino-crown">👑</span>}
      </div>

      {/* ⚡ Energy bar */}
      <div className="dino-energy-container" title={`Energy: ${energy}% - ${getEnergyLevel()}`}>
        <div className="dino-energy-bar">
          <div 
            className="dino-energy-fill"
            style={{ width: `${energy}%` }}
          />
        </div>
        <span className="dino-energy-label">{getEnergyLevel()}</span>
      </div>

      {/* 🎯 Interaction counter (hidden badge) */}
      {interactionCount >= 10 && (
        <div className="dino-interaction-badge" title={`${interactionCount} interactions!`}>
          {interactionCount >= 100 ? '💎' : interactionCount >= 50 ? '⭐' : '💚'}
        </div>
      )}

      {/* 🏷️ Drag hint */}
      <div className={`dino-drag-hint ${showCloseHint ? 'visible' : ''}`}>
        ↕️ Drag me!
      </div>
    </div>
  );
};

// 🎨 Helper to trigger dino reactions from anywhere in the app
export const triggerDinoReaction = (emotion: DinoEmotion, message?: string) => {
  window.dispatchEvent(new CustomEvent('dino-reaction', {
    detail: { emotion, message }
  }));
};

export default DinoBuddy;
