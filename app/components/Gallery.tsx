"use client";

import Image from "next/image";
import Link from "next/link";
import { useLayoutEngine } from "../hooks/useLayoutEngine";
import { useRef, useState, useEffect } from "react";
import { MediaItem } from "@/lib/media";

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

  // Calculate layout
  const { rows } = useLayoutEngine(items, containerWidth, {
    targetRowHeight: GALLERY_CONFIG.targetRowHeight,
    spacing: GALLERY_CONFIG.horizontalSpacing,
    tolerance: 20
  });
  
  if (rows.length > 0) {
    console.log('First row:', {
      height: rows[0].height,
      items: rows[0].items.length,
      sampleItemWidth: rows[0].items[0]?.width
    });
  }

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
