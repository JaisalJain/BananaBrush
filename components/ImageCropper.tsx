import React, { useState, useRef, useCallback, CSSProperties, MouseEvent as ReactMouseEvent, TouchEvent as ReactTouchEvent } from 'react';
import { CheckIcon } from './icons/Icons';

interface Crop {
  x: number;
  y: number;
  width: number;
  height: number;
}

interface ImageCropperProps {
  imageSrc: string;
  onCrop: (dataUrl: string) => void;
  onCancel: () => void;
  onRestore: () => void;
  showRestoreButton: boolean;
}

const ImageCropper: React.FC<ImageCropperProps> = ({ imageSrc, onCrop, onCancel, onRestore, showRestoreButton }) => {
  const [crop, setCrop] = useState<Crop | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const startPointRef = useRef<{ x: number; y: number } | null>(null);

  const getCoords = (e: ReactMouseEvent | ReactTouchEvent): { x: number; y: number } | null => {
    const container = containerRef.current;
    if (!container) return null;
    const rect = container.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e.nativeEvent) {
      if (e.nativeEvent.touches.length === 0) return null;
      clientX = e.nativeEvent.touches[0].clientX;
      clientY = e.nativeEvent.touches[0].clientY;
    } else {
      clientX = (e as ReactMouseEvent).clientX;
      clientY = (e as ReactMouseEvent).clientY;
    }

    return { 
      x: clientX - rect.left, 
      y: clientY - rect.top 
    };
  };

  const handleDragStart = (e: ReactMouseEvent | ReactTouchEvent) => {
    e.preventDefault();
    const coords = getCoords(e);
    if (coords) {
      setIsDragging(true);
      startPointRef.current = coords;
      setCrop({ x: coords.x, y: coords.y, width: 0, height: 0 });
    }
  };

  const handleDragMove = (e: ReactMouseEvent | ReactTouchEvent) => {
    if (!isDragging || !startPointRef.current) return;
    e.preventDefault();
    const coords = getCoords(e);
    if (!coords) return;

    const newX = Math.min(coords.x, startPointRef.current.x);
    const newY = Math.min(coords.y, startPointRef.current.y);
    const newWidth = Math.abs(coords.x - startPointRef.current.x);
    const newHeight = Math.abs(coords.y - startPointRef.current.y);
    
    setCrop({ x: newX, y: newY, width: newWidth, height: newHeight });
  };

  const handleDragEnd = (e: ReactMouseEvent | ReactTouchEvent) => {
    if (!isDragging) return;
    e.preventDefault();
    setIsDragging(false);
    startPointRef.current = null;
    if (crop && (crop.width < 5 || crop.height < 5)) {
      setCrop(null); // Discard tiny, likely accidental crops
    }
  };
  
  const handleApplyCrop = useCallback(() => {
    const image = imageRef.current;
    if (!image || !crop || crop.width === 0 || crop.height === 0) return;

    const canvas = document.createElement('canvas');
    const scaleX = image.naturalWidth / image.clientWidth;
    const scaleY = image.naturalHeight / image.clientHeight;
    
    const cropX = crop.x * scaleX;
    const cropY = crop.y * scaleY;
    const cropWidth = crop.width * scaleX;
    const cropHeight = crop.height * scaleY;

    canvas.width = cropWidth;
    canvas.height = cropHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    
    ctx.drawImage(
      image,
      cropX,
      cropY,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight
    );
    
    const base64Image = canvas.toDataURL(image.src.startsWith('data:image/png') ? 'image/png' : 'image/jpeg');
    onCrop(base64Image);
  }, [crop, onCrop]);
  
  const cropStyle: CSSProperties = crop ? {
    left: `${crop.x}px`,
    top: `${crop.y}px`,
    width: `${crop.width}px`,
    height: `${crop.height}px`,
    boxShadow: '0 0 0 9999px rgba(0, 0, 0, 0.7)',
  } : {};

  return (
    <div className="w-full max-w-4xl flex flex-col items-center gap-6">
        <div className="text-center">
            <h2 className="text-2xl font-bold">Crop Image</h2>
            <p className="text-slate-400 mt-1">Click and drag on the image to select an area.</p>
        </div>
      
      <div 
        ref={containerRef} 
        className="relative w-full max-w-2xl touch-none cursor-crosshair select-none rounded-lg overflow-hidden"
        style={{lineHeight: 0}}
        onMouseDown={handleDragStart}
        onMouseMove={handleDragMove}
        onMouseUp={handleDragEnd}
        onMouseLeave={handleDragEnd}
        onTouchStart={handleDragStart}
        onTouchMove={handleDragMove}
        onTouchEnd={handleDragEnd}
      >
        <img 
          ref={imageRef} 
          src={imageSrc} 
          alt="Original to crop" 
          className="w-full h-auto pointer-events-none" 
          draggable="false"
        />
        {crop && crop.width > 0 && crop.height > 0 && (
          <div 
            className="absolute border-2 border-dashed border-white"
            style={cropStyle}
          />
        )}
      </div>

      <div className="flex flex-wrap justify-center items-center gap-4">
        <button onClick={onCancel} className="px-6 py-2 font-semibold bg-slate-600 text-white rounded-md hover:bg-slate-500 transition-colors">Cancel</button>
        {showRestoreButton && (
          <button onClick={onRestore} className="px-6 py-2 font-semibold bg-amber-600 text-white rounded-md hover:bg-amber-500 transition-colors">Restore Original</button>
        )}
        <button 
          onClick={handleApplyCrop} 
          disabled={!crop || crop.width === 0 || crop.height === 0} 
          className="flex items-center gap-2 px-6 py-2 font-semibold bg-green-600 text-white rounded-md hover:bg-green-500 disabled:bg-slate-500 disabled:cursor-not-allowed transition-colors"
        >
          <CheckIcon className="w-5 h-5" />
          Apply Crop
        </button>
      </div>
    </div>
  );
};

export default ImageCropper;