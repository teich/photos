"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEngine } from "../hooks/useLayoutEngine";
import { useRef, useState, useEffect } from "react";
import { MediaItem } from "@/lib/media";
import { usePathname } from "next/navigation";
import { useRouterState } from "../hooks/useRouterState";

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
  const [containerWidth, setContainerWidth] = useState(0);
  const pathname = usePathname();
  const [getLastViewedImage] = useRouterState<string>('lastViewedImage');

  // Calculate layout
  const { rows } = useLayoutEngine(items, containerWidth, {
    targetRowHeight: GALLERY_CONFIG.targetRowHeight,
    spacing: GALLERY_CONFIG.horizontalSpacing,
    tolerance: 20
  });

  // Get image ID from either pathname or last viewed state
  const currentImageId = pathname.split('/').slice(1).join('/') || getLastViewedImage();

  // Check if the target image is in our items list
  const targetImageInItems = items.some(item => item.id === currentImageId);

  // Update container width on resize
  useEffect(() => {
    const updateWidth = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.offsetWidth);
      }
    };

    updateWidth();
    window.addEventListener('resize', updateWidth);
    return () => window.removeEventListener('resize', updateWidth);
  }, []);

  // Calculate and set scroll position when current image changes
  useEffect(() => {
    if (!currentImageId || !containerWidth || rows.length === 0 || !targetImageInItems) {
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
        position += row.height + GALLERY_CONFIG.verticalSpacing;
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
  }, [rows, currentImageId, containerWidth, targetImageInItems]);

  return (
    <div 
      ref={containerRef} 
      style={{ display: 'flex', flexDirection: 'column', gap: `${GALLERY_CONFIG.verticalSpacing}px` }}
    >
      {rows.map((row, rowIndex) => (
        <div 
          key={rowIndex}
          className="flex"
          style={{ 
            height: row.height, 
            gap: `${GALLERY_CONFIG.horizontalSpacing}px` 
          }}
        >
          {row.items.map((item) => (
            <div 
              key={item.id}
              className="relative bg-gray-100 overflow-hidden"
              style={{ width: item.width }}
            >
              <Link href={`/${item.id}`} className="block w-full h-full">
                {item.type === 'image' ? (
                  <Image
                    src={item.thumbnailUrl}
                    alt={item.filename}
                    width={Math.round(item.width)}
                    height={Math.round(item.height)}
                    priority={rowIndex === 0}
                    className="object-cover w-full h-full hover:opacity-95 transition-opacity duration-300"
                    sizes={`${Math.round((item.width / containerWidth) * 100)}vw`}
                  />
                ) : (
                  <div className="relative h-full">
                    <Image
                      src={item.thumbnailUrl}
                      alt={item.filename}
                      width={Math.round(item.width)}
                      height={Math.round(item.height)}
                      priority={rowIndex === 0}
                      className="object-cover w-full h-full hover:opacity-95 transition-opacity duration-300"
                      sizes={`${Math.round((item.width / containerWidth) * 100)}vw`}
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
  );
}
