/**
 * Performance Optimization Hooks
 * 
 * Provides utilities for:
 * - Debouncing
 * - Throttling
 * - Virtual scrolling helpers
 * - Memory-efficient state updates
 */

import { useState, useCallback, useRef, useEffect, useMemo } from 'react';

/**
 * Debounced value - delays updates until typing stops
 */
export function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return debouncedValue;
}

/**
 * Debounced callback - prevents rapid function calls
 */
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  callback: T,
  delay: number
): (...args: Parameters<T>) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Keep callback ref up to date
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args: Parameters<T>) => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    timeoutRef.current = setTimeout(() => {
      callbackRef.current(...args);
    }, delay);
  }, [delay]);
}

/**
 * Throttled callback - limits function calls to once per interval
 */
export function useThrottledCallback<T extends (...args: any[]) => any>(
  callback: T,
  limit: number
): (...args: Parameters<T>) => void {
  const lastRanRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback((...args: Parameters<T>) => {
    const now = Date.now();

    if (now - lastRanRef.current >= limit) {
      callbackRef.current(...args);
      lastRanRef.current = now;
    } else {
      // Schedule for end of throttle period
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
        lastRanRef.current = Date.now();
      }, limit - (now - lastRanRef.current));
    }
  }, [limit]);
}

/**
 * Virtual scroll helper - only renders visible items
 */
export function useVirtualScroll<T>(
  items: T[],
  containerRef: React.RefObject<HTMLElement>,
  itemHeight: number,
  overscan: number = 3
): {
  virtualItems: { item: T; index: number; style: React.CSSProperties }[];
  totalHeight: number;
  scrollTo: (index: number) => void;
} {
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);

  // Calculate visible range
  const visibleStart = Math.floor(scrollTop / itemHeight);
  const visibleEnd = Math.min(
    items.length - 1,
    Math.ceil((scrollTop + containerHeight) / itemHeight)
  );

  // Add overscan
  const startIndex = Math.max(0, visibleStart - overscan);
  const endIndex = Math.min(items.length - 1, visibleEnd + overscan);

  // Setup scroll listener
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const handleScroll = () => {
      setScrollTop(container.scrollTop);
    };

    const handleResize = () => {
      setContainerHeight(container.clientHeight);
    };

    // Initial setup
    setContainerHeight(container.clientHeight);
    container.addEventListener('scroll', handleScroll, { passive: true });
    window.addEventListener('resize', handleResize);

    return () => {
      container.removeEventListener('scroll', handleScroll);
      window.removeEventListener('resize', handleResize);
    };
  }, [containerRef]);

  // Generate virtual items
  const virtualItems = useMemo(() => {
    const result: { item: T; index: number; style: React.CSSProperties }[] = [];
    
    for (let i = startIndex; i <= endIndex; i++) {
      if (items[i] !== undefined) {
        result.push({
          item: items[i],
          index: i,
          style: {
            position: 'absolute',
            top: i * itemHeight,
            height: itemHeight,
            left: 0,
            right: 0
          }
        });
      }
    }
    
    return result;
  }, [items, startIndex, endIndex, itemHeight]);

  const totalHeight = items.length * itemHeight;

  const scrollTo = useCallback((index: number) => {
    const container = containerRef.current;
    if (!container) return;
    container.scrollTop = index * itemHeight;
  }, [containerRef, itemHeight]);

  return { virtualItems, totalHeight, scrollTo };
}

/**
 * Intersection observer hook - triggers when element becomes visible
 */
export function useIntersectionObserver(
  ref: React.RefObject<HTMLElement>,
  options?: IntersectionObserverInit
): boolean {
  const [isIntersecting, setIsIntersecting] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(([entry]) => {
      setIsIntersecting(entry.isIntersecting);
    }, options);

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [ref, options?.root, options?.rootMargin, options?.threshold]);

  return isIntersecting;
}

/**
 * Lazy state - only updates when the component is mounted
 * Prevents updates on unmounted components
 */
export function useSafeState<T>(initialValue: T): [T, React.Dispatch<React.SetStateAction<T>>] {
  const [state, setState] = useState<T>(initialValue);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  const safeSetState = useCallback((value: React.SetStateAction<T>) => {
    if (mountedRef.current) {
      setState(value);
    }
  }, []);

  return [state, safeSetState];
}

/**
 * Previous value hook - stores the previous value of a state
 */
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  
  useEffect(() => {
    ref.current = value;
  }, [value]);
  
  return ref.current;
}

/**
 * Stable callback - memoizes callback without deps array gymnastics
 */
export function useStableCallback<T extends (...args: any[]) => any>(callback: T): T {
  const callbackRef = useRef(callback);
  
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  return useCallback((...args: Parameters<T>) => {
    return callbackRef.current(...args);
  }, []) as T;
}

/**
 * Request idle callback - runs function during browser idle time
 */
export function useIdleCallback(
  callback: () => void,
  deps: React.DependencyList
): void {
  useEffect(() => {
    if ('requestIdleCallback' in window) {
      const id = (window as any).requestIdleCallback(callback);
      return () => (window as any).cancelIdleCallback(id);
    } else {
      // Fallback for browsers that don't support requestIdleCallback
      const id = setTimeout(callback, 100);
      return () => clearTimeout(id);
    }
  }, deps);
}

/**
 * File size guard - warns if content is too large
 */
export function useLargeFileWarning(
  content: string,
  threshold: number = 500000 // 500KB
): { isLarge: boolean; sizeKB: number; warning: string | null } {
  return useMemo(() => {
    const sizeBytes = new Blob([content]).size;
    const sizeKB = Math.round(sizeBytes / 1024);
    const isLarge = sizeBytes > threshold;
    
    return {
      isLarge,
      sizeKB,
      warning: isLarge 
        ? `This file is ${sizeKB}KB. Large files may affect performance.`
        : null
    };
  }, [content, threshold]);
}

