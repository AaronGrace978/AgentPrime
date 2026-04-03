import React, { useRef, useEffect } from 'react';

const CHARS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン日月火水木金土中大小上下左右前後0123456789ABCDEF$@#%&*+=<>{}[]|/\\';
const FONT_SIZE = 16;
const COL_GAP = 20;

interface Drop {
  y: number;
  speed: number;
  length: number;
  chars: string[];
  nextSwap: number;
  brightness: number; // 0..1 — how bright this column is
}

function randomChar(): string {
  return CHARS[Math.floor(Math.random() * CHARS.length)];
}

function createDrop(maxY: number): Drop {
  const length = 12 + Math.floor(Math.random() * 28);
  const brightness = 0.3 + Math.random() * 0.7;
  return {
    y: -Math.floor(Math.random() * maxY * 0.6),
    speed: 0.25 + Math.random() * 0.65,
    length,
    chars: Array.from({ length }, randomChar),
    nextSwap: Math.random() * 30,
    brightness,
  };
}

const MatrixRain: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const animRef = useRef<number>(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let w = 0;
    let h = 0;
    let columns = 0;
    let drops: Drop[] = [];

    const resize = () => {
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = w;
      canvas.height = h;
      const newCols = Math.ceil(w / COL_GAP);
      if (newCols !== columns) {
        const old = drops;
        drops = Array.from({ length: newCols }, (_, i) =>
          old[i] ?? createDrop(h / FONT_SIZE)
        );
        columns = newCols;
      }
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      // Slow fade — longer trails persist
      ctx.fillStyle = 'rgba(0, 0, 0, 0.04)';
      ctx.fillRect(0, 0, w, h);

      ctx.font = `bold ${FONT_SIZE}px "JetBrains Mono", "MS Gothic", Consolas, monospace`;
      ctx.textBaseline = 'top';

      for (let i = 0; i < columns; i++) {
        const drop = drops[i];
        const x = i * COL_GAP;
        const b = drop.brightness;

        // Shimmer — randomly mutate characters
        drop.nextSwap--;
        if (drop.nextSwap <= 0) {
          const swapCount = 1 + Math.floor(Math.random() * 3);
          for (let s = 0; s < swapCount; s++) {
            const idx = Math.floor(Math.random() * drop.chars.length);
            drop.chars[idx] = randomChar();
          }
          drop.nextSwap = 1 + Math.random() * 5;
        }

        for (let j = 0; j < drop.length; j++) {
          const row = Math.floor(drop.y) - j;
          const py = row * FONT_SIZE;
          if (py < -FONT_SIZE || py > h) continue;

          const fade = j / drop.length;

          if (j === 0) {
            // Blazing white-green head
            const headAlpha = 0.9 + b * 0.1;
            ctx.fillStyle = `rgba(220, 255, 220, ${headAlpha})`;
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 18 * b;
          } else if (j === 1) {
            ctx.fillStyle = `rgba(150, 255, 150, ${0.85 * b})`;
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 10 * b;
          } else if (j < 4) {
            const a = (0.8 - fade * 0.2) * b;
            ctx.fillStyle = `rgba(0, 255, 65, ${a})`;
            ctx.shadowColor = '#00ff41';
            ctx.shadowBlur = 5 * b;
          } else {
            const a = Math.max(0, (0.65 - fade * 0.7)) * b;
            ctx.fillStyle = `rgba(0, 255, 65, ${a})`;
            ctx.shadowBlur = 0;
          }

          ctx.fillText(drop.chars[j % drop.chars.length], x, py);
          ctx.shadowBlur = 0;
        }

        drop.y += drop.speed;

        if ((Math.floor(drop.y) - drop.length) * FONT_SIZE > h) {
          drops[i] = createDrop(h / FONT_SIZE);
          drops[i].y = -Math.floor(Math.random() * 6);
        }
      }

      animRef.current = requestAnimationFrame(draw);
    };

    animRef.current = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animRef.current);
      window.removeEventListener('resize', resize);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 99990,
        pointerEvents: 'none',
        opacity: 0.55,
        mixBlendMode: 'screen',
      }}
    />
  );
};

export default MatrixRain;
