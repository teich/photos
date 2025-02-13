"use client";

import { useCallback, useRef, useEffect } from 'react';

// Global state that persists across route changes
const globalState = new Map<string, unknown>();

export function useRouterState<T>(key: string) {
  const stateRef = useRef<T | null>(null);

  // Initialize from global state if it exists
  useEffect(() => {
    if (globalState.has(key)) {
      stateRef.current = globalState.get(key) as T;
    }
  }, [key]);

  const setState = useCallback((value: T) => {
    stateRef.current = value;
    globalState.set(key, value);
  }, [key]);

  const getState = useCallback(() => {
    return stateRef.current ?? (globalState.get(key) as T);
  }, [key]);

  // Clear state when component unmounts
  useEffect(() => {
    return () => {
      // Don't clear global state on unmount, only clear ref
      stateRef.current = null;
    };
  }, [key]);

  return [getState, setState] as const;
}
