/**
 * CRTOverlay - Authentic CRT monitor effects
 * Adds that vintage phosphor display look from the Matrix movies
 * 
 * Effects included:
 * - Scanlines (horizontal CRT lines)
 * - RGB phosphor pixels
 * - Screen curvature vignette
 * - Subtle flicker
 * - Chromatic aberration
 * 
 * "The Matrix is a system, Neo" - Morpheus
 */

import React from 'react';

interface CRTOverlayProps {
  /** Enable horizontal scanlines */
  scanlines?: boolean;
  /** Scanline opacity (0-1) */
  scanlineOpacity?: number;
  /** Enable RGB phosphor pixel effect */
  rgbPixels?: boolean;
  /** Enable edge vignette */
  vignette?: boolean;
  /** Vignette intensity (0-1) */
  vignetteIntensity?: number;
  /** Enable subtle screen flicker */
  flicker?: boolean;
  /** Enable chromatic aberration (color fringing) */
  chromaticAberration?: boolean;
  /** Overall opacity of effects */
  opacity?: number;
  /** Z-index for layering */
  zIndex?: number;
}

const CRTOverlay: React.FC<CRTOverlayProps> = ({
  scanlines = true,
  scanlineOpacity = 0.08,  // Reduced from 0.15 for cleaner look
  rgbPixels = false,       // Disabled by default - adds too much noise
  vignette = true,
  vignetteIntensity = 0.35, // Reduced from 0.5 for subtler effect
  flicker = false,          // Disabled - can cause visual fatigue
  chromaticAberration = false,
  opacity = 1,
  zIndex = 9999
}) => {
  return (
    <div
      className="crt-overlay"
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        width: '100vw',
        height: '100vh',
        pointerEvents: 'none',
        zIndex,
        opacity
      }}
    >
      {/* Scanlines */}
      {scanlines && (
        <div
          className="crt-scanlines"
          style={{
            position: 'absolute',
            inset: 0,
            background: `repeating-linear-gradient(
              0deg,
              rgba(0, 0, 0, ${scanlineOpacity}),
              rgba(0, 0, 0, ${scanlineOpacity}) 1px,
              transparent 1px,
              transparent 2px
            )`,
            animation: flicker ? 'crtFlicker 0.1s infinite' : undefined
          }}
        />
      )}
      
      {/* RGB Phosphor Pixels */}
      {rgbPixels && (
        <div
          className="crt-rgb-pixels"
          style={{
            position: 'absolute',
            inset: 0,
            background: `repeating-linear-gradient(
              90deg,
              rgba(255, 0, 0, 0.02),
              rgba(255, 0, 0, 0.02) 1px,
              rgba(0, 255, 0, 0.02) 1px,
              rgba(0, 255, 0, 0.02) 2px,
              rgba(0, 0, 255, 0.02) 2px,
              rgba(0, 0, 255, 0.02) 3px
            )`,
            opacity: 0.5
          }}
        />
      )}
      
      {/* Vignette */}
      {vignette && (
        <div
          className="crt-vignette"
          style={{
            position: 'absolute',
            inset: 0,
            background: `radial-gradient(
              ellipse at center,
              transparent 0%,
              transparent ${60 - vignetteIntensity * 20}%,
              rgba(0, 0, 0, ${vignetteIntensity * 0.4}) ${80 - vignetteIntensity * 10}%,
              rgba(0, 0, 0, ${vignetteIntensity * 0.7}) 100%
            )`
          }}
        />
      )}
      
      {/* Chromatic Aberration (color fringing on edges) */}
      {chromaticAberration && (
        <div
          className="crt-chromatic"
          style={{
            position: 'absolute',
            inset: 0,
            background: `
              linear-gradient(90deg, 
                rgba(255, 0, 0, 0.03) 0%, 
                transparent 5%, 
                transparent 95%, 
                rgba(0, 255, 255, 0.03) 100%
              )
            `
          }}
        />
      )}
      
      {/* Screen curvature shadow (subtle) */}
      <div
        className="crt-curvature"
        style={{
          position: 'absolute',
          inset: 0,
          boxShadow: 'inset 0 0 100px rgba(0, 0, 0, 0.2)',
          borderRadius: '10px'
        }}
      />
      
      {/* Global styles for animations */}
      <style>{`
        @keyframes crtFlicker {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.98; }
        }
        
        @media (prefers-reduced-motion: reduce) {
          .crt-scanlines {
            animation: none !important;
          }
        }
      `}</style>
    </div>
  );
};

export default CRTOverlay;

/**
 * MatrixGlow - Adds a green phosphor glow to any element
 * Wrap any component to give it that Matrix terminal glow
 */
interface MatrixGlowProps {
  children: React.ReactNode;
  /** Glow intensity (0-1) */
  intensity?: number;
  /** Glow color */
  color?: string;
  /** Enable text shadow glow */
  textGlow?: boolean;
  /** Enable box shadow glow */
  boxGlow?: boolean;
}

export const MatrixGlow: React.FC<MatrixGlowProps> = ({
  children,
  intensity = 0.5,
  color = '#00ff41',
  textGlow = true,
  boxGlow = false
}) => {
  const glowSize = Math.round(10 * intensity);
  const glowOpacity = intensity * 0.6;
  
  const style: React.CSSProperties = {};
  
  if (textGlow) {
    style.textShadow = `0 0 ${glowSize}px ${color}`;
  }
  
  if (boxGlow) {
    style.boxShadow = `0 0 ${glowSize * 2}px rgba(0, 255, 65, ${glowOpacity})`;
  }
  
  return (
    <div className="matrix-glow" style={style}>
      {children}
    </div>
  );
};

/**
 * DigitalRainBackground - Full-screen Matrix rain for backgrounds
 * A simple wrapper around MatrixRain for easy background usage
 */
export { default as MatrixRain } from '../AgentMode/MatrixRain';
