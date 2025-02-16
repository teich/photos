"use client";

import { MediaItem } from "@/lib/media";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useCallback, useRef, useState } from "react";
import { useRouterState } from "../hooks/useRouterState";

interface LightboxProps {
  item: MediaItem;
  allItems: MediaItem[];
}

export function Lightbox({ item, allItems }: LightboxProps) {
  const router = useRouter();
  // Sliding window of preloaded images with loading states
  const preloadQueue = useRef<Map<string, {
    loading: boolean;
    image: HTMLImageElement | null;
    error: boolean;
  }>>(new Map());
  
  // Navigation state management
  const [isNavigating, setIsNavigating] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchMove, setTouchMove] = useState<number | null>(null);
  const [isSwiping, setIsSwiping] = useState(false);
  
  // Constants for swipe handling
  const SWIPE_THRESHOLD = 50; // Minimum distance for a swipe
  const navigationState = useRef({
    isProcessing: false,
    lastRequestTime: 0,
    minimumInterval: 200 // ms between navigations
  });
  
  // Get current index for navigation
  const currentIndex = allItems.findIndex(i => i.id === item.id);

  // Preload images in a sliding window
  useEffect(() => {
    const PRELOAD_WINDOW = 2; // Preload 2 images before and after
    const imagesToPreload: MediaItem[] = [];
    
    // Calculate preload range
    for (let i = Math.max(0, currentIndex - PRELOAD_WINDOW); 
         i <= Math.min(allItems.length - 1, currentIndex + PRELOAD_WINDOW); 
         i++) {
      imagesToPreload.push(allItems[i]);
    }

    // Remove items outside the window to manage memory
    const validIds = new Set(imagesToPreload.map(item => item.id));
    for (const [id] of preloadQueue.current) {
      if (!validIds.has(id)) {
        const item = preloadQueue.current.get(id);
        if (item?.image) {
          item.image.src = ''; // Clear src to help garbage collection
          item.image = null;
        }
        preloadQueue.current.delete(id);
      }
    }

    // Preload new images
    imagesToPreload.forEach(mediaItem => {
      if (mediaItem.type === 'image' && !preloadQueue.current.has(mediaItem.id)) {
        const img = new window.Image();
        
        preloadQueue.current.set(mediaItem.id, {
          loading: true,
          image: img,
          error: false
        });

        img.onload = () => {
          preloadQueue.current.set(mediaItem.id, {
            loading: false,
            image: img,
            error: false
          });
        };

        img.onerror = () => {
          preloadQueue.current.set(mediaItem.id, {
            loading: false,
            image: null,
            error: true
          });
        };

        img.src = mediaItem.url;
      }
    });

    // Capture ref value for cleanup
    const queue = preloadQueue.current;
    
    // Cleanup function
    return () => {
      queue.forEach((item) => {
        if (item.image) {
          item.image.src = '';
          item.image = null;
        }
      });
      queue.clear();
    };
  }, [currentIndex, allItems]);

  const [, setLastViewedImage] = useRouterState<string>('lastViewedImage');

  // Update last viewed image whenever it changes
  useEffect(() => {
    setLastViewedImage(item.id);
  }, [item.id, setLastViewedImage]);

  const close = useCallback(() => {
    // Ensure the state is set before navigation
    setLastViewedImage(item.id);
    // Use setTimeout to ensure state is set before navigation
    setTimeout(() => {
      router.push('/');
    }, 0);
  }, [router, item.id, setLastViewedImage]);

  // Navigation with queue management
  const navigateToItem = useCallback(async (index: number) => {
    if (index < 0 || index >= allItems.length) return;
    
    const now = Date.now();
    if (navigationState.current.isProcessing || 
        (now - navigationState.current.lastRequestTime) < navigationState.current.minimumInterval) {
      return;
    }

    navigationState.current.isProcessing = true;
    navigationState.current.lastRequestTime = now;
    
    try {
      setIsNavigating(true);
      await router.push(`/${allItems[index].id}`);
    } finally {
      // Use a timeout to ensure the loading state is visible long enough
      // to prevent flickering
      setTimeout(() => {
        navigationState.current.isProcessing = false;
        setIsNavigating(false);
      }, 100);
    }
  }, [allItems, router]);

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case "Escape":
          close();
          break;
        case "ArrowLeft":
          navigateToItem(currentIndex - 1);
          break;
        case "ArrowRight":
          navigateToItem(currentIndex + 1);
          break;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [close, navigateToItem, currentIndex]);

  // Touch event handlers
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    setTouchStart(e.touches[0].clientX);
    setIsSwiping(true);
  }, []);

  const handleTouchMove = useCallback((e: React.TouchEvent) => {
    if (!touchStart) return;
    setTouchMove(e.touches[0].clientX);
  }, [touchStart]);

  const handleTouchEnd = useCallback(() => {
    if (!touchStart || !touchMove) {
      setIsSwiping(false);
      setTouchStart(null);
      setTouchMove(null);
      return;
    }

    const swipeDistance = touchMove - touchStart;
    const isSignificantSwipe = Math.abs(swipeDistance) >= SWIPE_THRESHOLD;

    if (isSignificantSwipe) {
      if (swipeDistance > 0 && currentIndex > 0) {
        // Swipe right -> previous image
        navigateToItem(currentIndex - 1);
      } else if (swipeDistance < 0 && currentIndex < allItems.length - 1) {
        // Swipe left -> next image
        navigateToItem(currentIndex + 1);
      }
    }

    setIsSwiping(false);
    setTouchStart(null);
    setTouchMove(null);
  }, [touchStart, touchMove, currentIndex, allItems.length, navigateToItem]);

  return (
    <div 
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
      onClick={close}
    >
      <div className="relative w-full h-full flex items-center justify-center group">
        {item.type === "image" ? (
          <div 
            className="relative h-screen w-screen"
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {isNavigating && (
              <div className="absolute inset-0 z-10 flex items-center justify-center bg-black/50">
                <div className="animate-spin rounded-full h-12 w-12 border-4 border-white border-t-transparent"></div>
              </div>
            )}
            <Image
              src={item.url}
              alt={item.filename}
              className={`transition-all duration-300 ${
                isNavigating ? 'opacity-50' : 'opacity-100'
              } ${isSwiping && touchMove && touchStart ? `translate-x-[${Math.round((touchMove - touchStart) / 2)}px]` : 'translate-x-0'}`}
              fill
              style={{ objectFit: 'contain' }}
              onClick={(e) => e.stopPropagation()}
              draggable={false}
              priority={true}
              sizes="100vw"
              quality={90}
            />
          </div>
        ) : (
          <video
            src={item.url}
            className="max-h-screen max-w-full w-auto h-auto"
            controls
            autoPlay
            onClick={(e) => e.stopPropagation()}
          />
        )}
        
        {/* Navigation buttons */}
        {currentIndex > 0 && (
          <button
            className="absolute left-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              navigateToItem(currentIndex - 1);
            }}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-8 w-8" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M15 19l-7-7 7-7" 
              />
            </svg>
          </button>
        )}
        
        {currentIndex < allItems.length - 1 && (
          <button
            className="absolute right-4 top-1/2 -translate-y-1/2 text-white hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
            onClick={(e) => {
              e.stopPropagation();
              navigateToItem(currentIndex + 1);
            }}
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              className="h-8 w-8" 
              fill="none" 
              viewBox="0 0 24 24" 
              stroke="currentColor"
            >
              <path 
                strokeLinecap="round" 
                strokeLinejoin="round" 
                strokeWidth={2} 
                d="M9 5l7 7-7 7" 
              />
            </svg>
          </button>
        )}

        {/* Close button */}
        <button
          className="absolute top-4 right-4 text-white hover:text-gray-300 transition-colors opacity-0 group-hover:opacity-100"
          onClick={(e) => {
            e.stopPropagation();
            close();
          }}
        >
          <svg 
            xmlns="http://www.w3.org/2000/svg" 
            className="h-8 w-8" 
            fill="none" 
            viewBox="0 0 24 24" 
            stroke="currentColor"
          >
            <path 
              strokeLinecap="round" 
              strokeLinejoin="round" 
              strokeWidth={2} 
              d="M6 18L18 6M6 6l12 12" 
            />
          </svg>
        </button>
      </div>
    </div>
  );
}
