import { useState, useEffect } from 'react';

const DESKTOP_WIDTH = 1200; // Our target "desktop" width
const MIN_SCALE = 0.3; // Prevent gallery from becoming too small
const PADDING = 40; // Total horizontal padding (20px on each side)

export function useScaleFactor() {
  const [scale, setScale] = useState(1);
  const [windowWidth, setWindowWidth] = useState(
    typeof window !== 'undefined' ? window.innerWidth : DESKTOP_WIDTH
  );

  useEffect(() => {
    const updateDimensions = () => {
      setWindowWidth(window.innerWidth);
    };

    // Initial calculation
    updateDimensions();

    // Update on resize with debounce
    let timeoutId: NodeJS.Timeout;
    const debouncedUpdate = () => {
      clearTimeout(timeoutId);
      timeoutId = setTimeout(updateDimensions, 100);
    };

    window.addEventListener('resize', debouncedUpdate);
    return () => {
      window.removeEventListener('resize', debouncedUpdate);
      clearTimeout(timeoutId);
    };
  }, []);

  // Calculate scale based on available width
  useEffect(() => {
    const availableWidth = windowWidth - PADDING;
    if (availableWidth >= DESKTOP_WIDTH) {
      setScale(1);
    } else {
      const calculatedScale = availableWidth / DESKTOP_WIDTH;
      setScale(Math.max(calculatedScale, MIN_SCALE));
    }
  }, [windowWidth]);

  return scale;
}
