"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEngine } from "../hooks/useLayoutEngine";
import { useRef, useState, useEffect, useMemo } from "react";
import { MediaItem } from "@/lib/media";
import { usePathname } from "next/navigation";
import { useRouterState } from "../hooks/useRouterState";
import { useScaleFactor } from "../hooks/useScaleFactor";

interface GalleryProps {
  items: MediaItem[];
}

const GALLERY_CONFIG = {
  horizontalSpacing: 0, // pixels between photos in a row
  verticalSpacing: 0,   // pixels between rows
  targetRowHeight: 300  // target height for each row
};

export function Gallery({ items }: GalleryProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const DESKTOP_WIDTH = 1200; // Match with useScaleFactor
  const pathname = usePathname();
  const [getLastViewedImage] = useRouterState<string>('lastViewedImage');

  // Calculate layout using fixed desktop width
  const { rows, totalHeight } = useLayoutEngine(items, DESKTOP_WIDTH, {
    targetRowHeight: GALLERY_CONFIG.targetRowHeight,
    spacing: GALLERY_CONFIG.horizontalSpacing,
    tolerance: 20
  });

  // Get image ID from either pathname or last viewed state
  const currentImageId = pathname.split('/').slice(1).join('/') || getLastViewedImage();

  // Check if the target image is in our items list
  const targetImageInItems = items.some(item => item.id === currentImageId);

  const scale = useScaleFactor();
  
  // Calculate and set scroll position when current image changes
  useEffect(() => {
    if (!currentImageId || rows.length === 0 || !targetImageInItems) {
      return;
    }

    // Delay scroll calculation to ensure layout is complete
    const timeoutId = setTimeout(() => {
      let position = 0;
      let found = false;

      for (const row of rows) {
        const matchingItem = row.items.find(item => item.id === currentImageId);
        if (matchingItem) {
          found = true;
          break;
        }
        position += (row.height + GALLERY_CONFIG.verticalSpacing) * scale;
      }

      if (found) {
        window.scrollTo({
          top: position,
          behavior: 'instant'
        });
      } else {
      }
    }, 0);

    return () => clearTimeout(timeoutId);
  }, [rows, currentImageId, targetImageInItems, scale]);

  // Calculate styles with scaling
  const [windowWidth, setWindowWidth] = useState(0);

  // Handle window width updates
  useEffect(() => {
    const updateWidth = () => setWindowWidth(window.innerWidth);
    updateWidth();

    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  const styles = useMemo(() => {
    const scaledWidth = Math.round(DESKTOP_WIDTH * scale);
    const scaledHeight = Math.round(totalHeight * scale);
    const scaledVerticalSpacing = Math.round(GALLERY_CONFIG.verticalSpacing * scale);

    return {
      wrapper: {
        width: '100%',
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'flex-start',
        padding: '20px 0',
        overflow: 'hidden',
        opacity: windowWidth ? 1 : 0,
        transition: 'opacity 0.2s ease-in',
        minHeight: '100vh'
      },
      container: {
        display: 'flex',
        flexDirection: 'column' as const,
        gap: `${scaledVerticalSpacing}px`,
        width: `${scaledWidth}px`,
        height: `${scaledHeight}px`,
        position: 'relative' as const,
      }
    };
  }, [scale, windowWidth, totalHeight]);

  return (
    <div style={styles.wrapper}>
      <div 
        ref={containerRef}
        style={styles.container}
      >
      {rows.map((row, rowIndex) => (
        <div 
          key={rowIndex}
          className="flex"
          style={{ 
            height: Math.round(row.height * scale), 
            gap: `${Math.round(GALLERY_CONFIG.horizontalSpacing * scale)}px`,
          }}
        >
          {row.items.map((item) => (
            <div 
              key={item.id}
              className="relative bg-gray-100 overflow-hidden"
              style={{ width: Math.round(item.width * scale) }}
            >
              <Link href={`/${item.id}`} className="block w-full h-full">
                {item.type === 'image' ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt={item.filename}
                    width={Math.round(item.width * scale)}
                    height={Math.round(item.height * scale)}
                    priority={rowIndex === 0}
                    className="object-cover w-full h-full hover:opacity-95 transition-opacity duration-300"
                    sizes="100vw"
                  />
                ) : (
                  <div className="relative h-full">
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.filename}
                      width={Math.round(item.width * scale)}
                      height={Math.round(item.height * scale)}
                      priority={rowIndex === 0}
                      className="object-cover w-full h-full hover:opacity-95 transition-opacity duration-300"
                      sizes="100vw"
                    />
                    <div className="absolute inset-0 flex items-center justify-center bg-black/20 pointer-events-none">
                      <svg className="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M8 5v14l11-7z" />
                      </svg>
                    </div>
                  </div>
                )}
              </Link>
            </div>
          ))}
        </div>
      ))}
      </div>
    </div>
  );
}
