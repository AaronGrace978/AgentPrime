/**
 * MatrixRain - Movie-Authentic Digital Rain Effect
 * Creates the iconic Matrix (1999) digital rain with:
 * - Multi-layer depth simulation
 * - Glowing lead characters
 * - Variable column speeds
 * - Authentic character morphing
 * - Phosphor glow effects
 * 
 * "The Matrix is everywhere. It is all around us." - Morpheus
 */

import React, { useRef, useEffect, useCallback, useMemo } from 'react';

interface MatrixRainProps {
  opacity?: number;
  speed?: number;
  density?: number;
  /** Enable the bright "head" glow on lead characters */
  glowingHeads?: boolean;
  /** Number of depth layers (more = more 3D effect, higher CPU) */
  layers?: number;
  /** Character set variant */
  charset?: 'classic' | 'extended' | 'minimal';
  /** Enable character morphing animation */
  morphing?: boolean;
}

// Authentic Matrix character sets
const CHARSETS = {
  // Classic: Katakana + digits (movie-accurate)
  classic: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンヴガギグゲゴザジズゼゾダヂヅデドバビブベボパピプペポ0123456789',
  // Extended: More symbols for variety
  extended: 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲンヴ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZΣΦΨΩδθλμπσ¥$€@#&*<>[]{}|/',
  // Minimal: Just essential characters
  minimal: 'ｱｲｳｴｵｶｷｸｹｺ0123456789ABCDEF'
};

// Color palette matching the movie's phosphor CRT look
const MATRIX_COLORS = {
  // The bright white-green lead character
  head: '#ffffff',
  headGlow: 'rgba(180, 255, 180, 1)',
  // Bright green (just behind head)
  bright: '#7fff7f',
  // Standard Matrix green
  primary: '#00ff41',
  // Fading trail colors
  mid: '#00cc33',
  dim: '#009922',
  faint: '#006611',
  // Background fade - higher opacity = faster fade, less filmy buildup
  trail: 'rgba(0, 0, 0, 0.12)'
};

interface Column {
  x: number;
  y: number;
  speed: number;
  length: number;
  chars: string[];
  morphTimers: number[];
  brightness: number;
  layer: number;
}

const MatrixRain: React.FC<MatrixRainProps> = ({ 
  opacity = 0.3, 
  speed = 1,
  density = 0.97,
  glowingHeads = true,
  layers = 3,
  charset = 'classic',
  morphing = true
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const columnsRef = useRef<Column[]>([]);
  const animationRef = useRef<number>(0);
  const lastTimeRef = useRef<number>(0);
  const frameCountRef = useRef<number>(0);
  
  // Memoize charArray to prevent animation restart on parent re-renders
  const charArray = useMemo(() => CHARSETS[charset].split(''), [charset]);
  
  // Get random character
  const getRandomChar = useCallback(() => {
    return charArray[Math.floor(Math.random() * charArray.length)];
  }, [charArray]);
  
  // Initialize a column
  const createColumn = useCallback((x: number, layer: number, canvasHeight: number): Column => {
    const baseSpeed = 0.3 + Math.random() * 0.7;
    // Deeper layers move slower (parallax effect)
    const layerSpeedMod = 1 - (layer * 0.2);
    const length = 8 + Math.floor(Math.random() * 20);
    
    return {
      x,
      y: Math.random() * -canvasHeight * 2, // Start above screen
      speed: baseSpeed * layerSpeedMod * speed,
      length,
      chars: Array(length).fill(0).map(() => getRandomChar()),
      morphTimers: Array(length).fill(0).map(() => Math.random() * 100),
      brightness: 0.4 + Math.random() * 0.6,
      layer
    };
  }, [getRandomChar, speed]);
  
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const ctx = canvas.getContext('2d', { alpha: true });
    if (!ctx) return;
    
    // High-DPI support
    const dpr = window.devicePixelRatio || 1;
    
    const resizeCanvas = () => {
      // Use full viewport dimensions for fixed positioning
      const width = window.innerWidth;
      const height = window.innerHeight;
      canvas.width = width * dpr;
      canvas.height = height * dpr;
      ctx.scale(dpr, dpr);
      canvas.style.width = `${width}px`;
      canvas.style.height = `${height}px`;
      
      // Reinitialize columns on resize
      initColumns(width, height);
    };
    
    const initColumns = (width: number, height: number) => {
      const fontSize = 16;
      const columnCount = Math.ceil(width / fontSize);
      const columns: Column[] = [];
      
      for (let layer = 0; layer < layers; layer++) {
        // Each layer has slightly different column positions
        const layerOffset = layer * 3;
        const layerDensity = 1 - (layer * 0.15);
        
        for (let i = 0; i < columnCount; i++) {
          // Skip some columns for natural variation
          if (Math.random() > layerDensity) continue;
          
          columns.push(createColumn(
            (i * fontSize) + layerOffset,
            layer,
            height
          ));
        }
      }
      
      columnsRef.current = columns;
    };
    
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);
    
    const fontSize = 16;
    
    const draw = (currentTime: number) => {
      animationRef.current = requestAnimationFrame(draw);
      
      // Throttle to ~30fps for authentic retro feel + performance
      const elapsed = currentTime - lastTimeRef.current;
      if (elapsed < 33) return;
      lastTimeRef.current = currentTime;
      
      // Use viewport dimensions for fixed canvas
      const rect = { width: window.innerWidth, height: window.innerHeight };
      
      // Increment frame counter
      frameCountRef.current++;
      
      // Periodically do a full clear to prevent residue buildup (every ~5 seconds at 30fps)
      if (frameCountRef.current % 150 === 0) {
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fillRect(0, 0, rect.width, rect.height);
      } else {
        // Normal trail effect with semi-transparent black overlay
        ctx.fillStyle = MATRIX_COLORS.trail;
        ctx.fillRect(0, 0, rect.width, rect.height);
      }
      
      // Sort columns by layer (back to front)
      const sortedColumns = [...columnsRef.current].sort((a, b) => b.layer - a.layer);
      
      for (const column of sortedColumns) {
        // Layer-based opacity (back layers are dimmer)
        const layerOpacity = 1 - (column.layer * 0.25);
        const baseOpacity = opacity * layerOpacity * column.brightness;
        
        // Draw each character in the column
        for (let i = 0; i < column.chars.length; i++) {
          const charY = column.y + (i * fontSize);
          
          // Skip if off screen
          if (charY < -fontSize || charY > rect.height + fontSize) continue;
          
          // Character morphing effect
          if (morphing) {
            column.morphTimers[i]++;
            if (column.morphTimers[i] > 50 + Math.random() * 100) {
              column.chars[i] = getRandomChar();
              column.morphTimers[i] = 0;
            }
          }
          
          // Calculate color based on position in stream
          let color: string;
          let charOpacity = baseOpacity;
          let glowRadius = 0;
          
          if (i === 0) {
            // Lead character (head) - brightest, white-green with glow
            if (glowingHeads) {
              color = MATRIX_COLORS.head;
              charOpacity = Math.min(1, baseOpacity * 3);
              glowRadius = 15;
            } else {
              color = MATRIX_COLORS.bright;
              charOpacity = baseOpacity * 2;
            }
          } else if (i === 1) {
            // Second character - very bright green
            color = MATRIX_COLORS.headGlow;
            charOpacity = baseOpacity * 2;
            glowRadius = 8;
          } else if (i < 4) {
            // Near head - bright
            color = MATRIX_COLORS.bright;
            charOpacity = baseOpacity * 1.5;
          } else if (i < column.length * 0.4) {
            // Upper portion - standard green
            color = MATRIX_COLORS.primary;
          } else if (i < column.length * 0.7) {
            // Middle - starting to fade
            color = MATRIX_COLORS.mid;
            charOpacity = baseOpacity * 0.8;
          } else if (i < column.length * 0.9) {
            // Lower - dim
            color = MATRIX_COLORS.dim;
            charOpacity = baseOpacity * 0.5;
          } else {
            // Tail - faintest
            color = MATRIX_COLORS.faint;
            charOpacity = baseOpacity * 0.3;
          }
          
          // Apply glow effect for head characters
          if (glowRadius > 0 && glowingHeads) {
            ctx.save();
            ctx.shadowColor = MATRIX_COLORS.primary;
            ctx.shadowBlur = glowRadius;
            ctx.shadowOffsetX = 0;
            ctx.shadowOffsetY = 0;
          }
          
          // Set font - slightly smaller for deeper layers
          const layerFontSize = fontSize - (column.layer * 2);
          ctx.font = `bold ${layerFontSize}px "JetBrains Mono", "Fira Code", "Consolas", monospace`;
          ctx.fillStyle = color;
          ctx.globalAlpha = charOpacity;
          
          // Draw the character
          ctx.fillText(column.chars[i], column.x, charY);
          
          if (glowRadius > 0 && glowingHeads) {
            // Double draw for stronger glow
            ctx.fillText(column.chars[i], column.x, charY);
            ctx.restore();
          }
        }
        
        // Update column position
        column.y += column.speed * fontSize * 0.3;
        
        // Reset column when it goes off screen
        if (column.y > rect.height + (column.length * fontSize)) {
          if (Math.random() > density) {
            column.y = -column.length * fontSize * (1 + Math.random());
            column.speed = (0.3 + Math.random() * 0.7) * (1 - column.layer * 0.2) * speed;
            column.brightness = 0.4 + Math.random() * 0.6;
            column.chars = Array(column.length).fill(0).map(() => getRandomChar());
          }
        }
      }
      
      // Reset global alpha
      ctx.globalAlpha = 1;
    };
    
    animationRef.current = requestAnimationFrame(draw);
    
    return () => {
      window.removeEventListener('resize', resizeCanvas);
      cancelAnimationFrame(animationRef.current);
    };
  }, [opacity, speed, density, glowingHeads, layers, morphing, createColumn, getRandomChar]);
  
  return (
    <canvas
      ref={canvasRef}
      className="matrix-rain-canvas"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex: 10,
        // Crisp rendering - no blur for cleaner look
        imageRendering: 'crisp-edges'
      }}
    />
  );
};

export default MatrixRain;
