
import React, { useRef, useEffect, useState, useImperativeHandle, forwardRef } from 'react';

interface ImageEditorProps {
  imageSrc: string;
  brushSize: number;
}

export interface ImageEditorRef {
  getMaskAsBase64: () => string;
  clearMask: () => void;
}

const ImageEditor = forwardRef<ImageEditorRef, ImageEditorProps>(({ imageSrc, brushSize }, ref) => {
  const imageCanvasRef = useRef<HTMLCanvasElement>(null);
  const drawingCanvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [aspectRatio, setAspectRatio] = useState('auto');
  const lastPoint = useRef<{x: number, y: number} | null>(null);

  const drawImage = () => {
    const image = new Image();
    image.src = imageSrc;
    image.onload = () => {
      setAspectRatio(`${image.naturalWidth} / ${image.naturalHeight}`);

      requestAnimationFrame(() => {
        const imageCanvas = imageCanvasRef.current;
        const drawingCanvas = drawingCanvasRef.current;
        if (imageCanvas && drawingCanvas) {
            const width = image.naturalWidth;
            const height = image.naturalHeight;

            imageCanvas.width = width;
            imageCanvas.height = height;
            drawingCanvas.width = width;
            drawingCanvas.height = height;

            const ctx = imageCanvas.getContext('2d');
            ctx?.drawImage(image, 0, 0, width, height);
        }
      });
    };
  };

  useEffect(() => {
    drawImage();
    const debouncedDrawImage = () => {
        let timeoutId: number;
        return () => {
            clearTimeout(timeoutId);
            timeoutId = window.setTimeout(drawImage, 100);
        };
    };
    const handleResize = debouncedDrawImage();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [imageSrc]);

  const getCoords = (e: React.MouseEvent | React.TouchEvent): { x: number; y: number } | null => {
    const canvas = drawingCanvasRef.current;
    if (!canvas) return null;
    const rect = canvas.getBoundingClientRect();
    
    let clientX, clientY;
    if ('touches' in e.nativeEvent) {
      if (e.nativeEvent.touches.length === 0) return null;
      clientX = e.nativeEvent.touches[0].clientX;
      clientY = e.nativeEvent.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }

    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;

    const canvasX = (clientX - rect.left) * scaleX;
    const canvasY = (clientY - rect.top) * scaleY;

    return { x: canvasX, y: canvasY };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    setIsDrawing(true);
    const coords = getCoords(e);
    if(coords) {
        lastPoint.current = coords;
        // Draw a dot on start to handle clicks without drags
        draw(e); 
    }
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    const canvas = drawingCanvasRef.current;
    const ctx = canvas?.getContext('2d');
    const coords = getCoords(e);

    if (!ctx || !coords || !lastPoint.current) return;
    
    const scale = canvas.width / canvas.getBoundingClientRect().width;
    
    ctx.beginPath();
    ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
    ctx.lineTo(coords.x, coords.y);
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.lineWidth = brushSize * scale;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.stroke();

    lastPoint.current = coords;
  };

  const stopDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing) return;
    e.preventDefault();
    setIsDrawing(false);
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const canvas = drawingCanvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext('2d');
      ctx?.clearRect(0, 0, canvas.width, canvas.height);
    }
  };

  useImperativeHandle(ref, () => ({
    getMaskAsBase64: () => {
      const canvas = drawingCanvasRef.current;
      if (!canvas) return '';

      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return '';
      
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const data = imageData.data;
      
      let hasMask = false;
      const maskData = new Uint8ClampedArray(data.length);
      for (let i = 0; i < data.length; i += 4) {
          // If the pixel on the drawing canvas is not transparent, make the mask pixel white.
          if (data[i + 3] > 0) {
              maskData[i] = 255;     // R
              maskData[i + 1] = 255; // G
              maskData[i + 2] = 255; // B
              maskData[i + 3] = 255; // A (Opaque)
              hasMask = true;
          } else {
          // Otherwise, make it black.
              maskData[i] = 0;       // R
              maskData[i + 1] = 0;   // G
              maskData[i + 2] = 0;   // B
              maskData[i + 3] = 255; // A (Opaque)
          }
      }

      if (!hasMask) return ''; // Don't submit if no mask was drawn

      const maskCanvas = document.createElement('canvas');
      maskCanvas.width = canvas.width;
      maskCanvas.height = canvas.height;
      const maskCtx = maskCanvas.getContext('2d');
      if (!maskCtx) return '';
      
      const maskImageData = new ImageData(maskData, canvas.width, canvas.height);
      maskCtx.putImageData(maskImageData, 0, 0);

      return maskCanvas.toDataURL('image/png').split(',')[1];
    },
    clearMask: clearCanvas,
  }));

  return (
    <div 
        className="relative w-full shadow-lg rounded-lg overflow-hidden" 
        style={{ aspectRatio }}
    >
        <canvas ref={imageCanvasRef} className="absolute top-0 left-0 w-full h-full" />
        <canvas
          ref={drawingCanvasRef}
          className="absolute top-0 left-0 w-full h-full cursor-crosshair touch-none"
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
        />
    </div>
  );
});

export default ImageEditor;
