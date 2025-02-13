"use client";

import { MediaItem } from "@/lib/media";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useEffect, useCallback } from "react";

interface LightboxProps {
  item: MediaItem;
  allItems: MediaItem[];
}

export function Lightbox({ item, allItems }: LightboxProps) {
  const router = useRouter();

  // Get current index for navigation
  const currentIndex = allItems.findIndex(i => i.id === item.id);

  const close = useCallback(() => {
    router.replace('/'); // Use replace instead of push to handle modal context
  }, [router]);

  const navigateToItem = useCallback((index: number) => {
    if (index >= 0 && index < allItems.length) {
      router.push(`/media/${allItems[index].id}`);
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

  return (
    <div 
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
      onClick={close}
    >
      <div className="relative w-full h-full flex items-center justify-center group">
        {item.type === "image" ? (
          <Image
            src={item.url}
            alt={item.filename}
            className="max-h-screen max-w-full w-auto h-auto object-contain"
            width={2000}
            height={2000}
            onClick={(e) => e.stopPropagation()}
            priority
          />
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
