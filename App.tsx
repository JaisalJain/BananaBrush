import React, { useState, useRef, useCallback, CSSProperties } from 'react';
import { AppState, Tool } from './types';
import { editImageWithText, blendImages, generateImage, expandImage } from './services/geminiService';
import ImageEditor, { ImageEditorRef } from './components/ImageEditor';
import ImageCropper from './components/ImageCropper';
import Loader from './components/Loader';
import { UploadIcon, SparklesIcon, BrushIcon, DownloadIcon, BackIcon, PhotoIcon, HomeIcon, ChevronDownIcon, ExpandIcon, ArrowUpLeftIcon, ArrowUpIcon, ArrowUpRightIcon, ArrowLeftIcon, ArrowRightIcon, ArrowDownLeftIcon, ArrowDownIcon, ArrowDownRightIcon, UndoIcon, CropIcon } from './components/icons/Icons';

interface ImageTransform {
  x: number;
  y: number;
  scale: number;
  rotation: number; // z-axis
  opacity: number;
  perspective: number;
  rotateX: number;
  rotateY: number;
}

const getMainClasses = (currentAppState: AppState) => {
  switch (currentAppState) {
    case AppState.HOME:
    case AppState.IDLE:
    case AppState.GENERATE_PROMPT:
    case AppState.LOADING:
      return 'flex items-center justify-center';
    case AppState.TOOL_SELECTION:
    case AppState.EDITING:
    case AppState.EXPANDING:
    case AppState.RESULT:
      return 'flex justify-center';
    default: return '';
  }
}

function App() {
  const [appState, setAppState] = useState<AppState>(AppState.HOME);
  const [originalImage, setOriginalImage] = useState<{ url: string; file: File, width: number, height: number } | null>(null);
  const [uncroppedOriginalImage, setUncroppedOriginalImage] = useState<{ url: string; file: File, width: number, height: number } | null>(null);
  const [insertImage, setInsertImage] = useState<{ url: string; file: File } | null>(null);
  const [resultData, setResultData] = useState<{ url: string; type: 'image' } | null>(null);
  const [prompt, setPrompt] = useState<string>('');
  const [generationPrompt, setGenerationPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isSelectionDone, setIsSelectionDone] = useState(false);
  const [finalSelection, setFinalSelection] = useState<string | null>(null);
  const [brushSize, setBrushSize] = useState(30);
  const [loadingMessage, setLoadingMessage] = useState('');
  const [systemContext, setSystemContext] = useState('');
  const [tool, setTool] = useState<Tool | null>(null);

  const [isPlacingImage, setIsPlacingImage] = useState(false);
  const [insertImageTransform, setInsertImageTransform] = useState<ImageTransform>({
    x: 50, y: 50, scale: 50, rotation: 0, opacity: 100,
    perspective: 1000, rotateX: 0, rotateY: 0,
  });
  const [isDragging, setIsDragging] = useState(false);
  
  // State for button-based expand
  const MAX_EXPANSION_CLICKS = 6;
  const [expansionStepSize, setExpansionStepSize] = useState(128);
  const [expandSteps, setExpandSteps] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [expandHistory, setExpandHistory] = useState<typeof expandSteps[]>([]);
  
  // State for cropping
  const [isCropping, setIsCropping] = useState(false);


  const editorRef = useRef<ImageEditorRef>(null);
  const editorContainerRef = useRef<HTMLDivElement>(null);
  const dragStartPos = useRef({ clientX: 0, clientY: 0 });
  const dragStartTransform = useRef({ x: 0, y: 0 });

  const fileToDataUrl = (file: File): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  };

  const getImageDimensions = (url: string): Promise<{ width: number, height: number }> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.src = url;
    });
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please upload a valid image file (PNG, JPG, etc.).');
        return;
      }
      const reader = new FileReader();
      reader.onload = async (event) => {
        const url = event.target?.result as string;
        const { width, height } = await getImageDimensions(url);
        setOriginalImage({ url, file, width, height });
        setAppState(AppState.TOOL_SELECTION);
        setError(null);
        setResultData(null);
        setUncroppedOriginalImage(null);
      };
      reader.readAsDataURL(file);
    }
  };

  const handleInsertFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      if (!file.type.startsWith('image/')) {
        setError('Please upload a valid image file.');
        return;
      }
      const reader = new FileReader();
      reader.onload = (event) => {
        setInsertImage({ url: event.target?.result as string, file });
        setError(null);
        setIsPlacingImage(true);
        setInsertImageTransform({
          x: 50, y: 50, scale: 50, rotation: 0, opacity: 100,
          perspective: 1000, rotateX: 0, rotateY: 0,
        });
      };
      reader.readAsDataURL(file);
    }
  };

  const handleToolSelect = (selectedTool: Tool) => {
    setTool(selectedTool);
    setError(null); // Clear previous errors when selecting a new tool
    if (selectedTool === 'expand' && originalImage) {
        const step = Math.round(Math.min(originalImage.width, originalImage.height) * 0.25);
        setExpansionStepSize(step);
        setAppState(AppState.EXPANDING);
        setExpandSteps({ top: 0, right: 0, bottom: 0, left: 0 });
        setExpandHistory([]);
    } else if (selectedTool !== 'expand') {
        setAppState(AppState.EDITING);
        setIsSelectionDone(false);
        setFinalSelection(null);
    }
  };
  
  const handleExpandClick = (direction: 'top' | 'right' | 'bottom' | 'left' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right') => {
    const totalClicks = Object.values(expandSteps).reduce((sum, val) => sum + val, 0);
    if (totalClicks >= MAX_EXPANSION_CLICKS) {
      setError(`You can expand up to ${MAX_EXPANSION_CLICKS} times per generation.`);
      setTimeout(() => setError(null), 3000);
      return;
    }
    
    setExpandHistory(h => [...h, expandSteps]);

    setExpandSteps(steps => {
        const newSteps = { ...steps };
        if (direction.includes('top')) newSteps.top++;
        if (direction.includes('bottom')) newSteps.bottom++;
        if (direction.includes('left')) newSteps.left++;
        if (direction.includes('right')) newSteps.right++;
        return newSteps;
    });
  };

  const handleUndoExpand = () => {
    if (expandHistory.length === 0) return;
    const previousSteps = expandHistory[expandHistory.length - 1];
    setExpandSteps(previousSteps);
    setExpandHistory(h => h.slice(0, -1));
  };

  const handleExpandSubmit = useCallback(async () => {
    if (!originalImage) return;

    setError(null);
    setAppState(AppState.LOADING);
    setLoadingMessage('Expanding your canvas...');

    try {
        const { width: originalWidth, height: originalHeight } = originalImage;
        const finalWidth = originalWidth + (expandSteps.left + expandSteps.right) * expansionStepSize;
        const finalHeight = originalHeight + (expandSteps.top + expandSteps.bottom) * expansionStepSize;

        const canvas = document.createElement('canvas');
        canvas.width = finalWidth;
        canvas.height = finalHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error("Could not create canvas for expansion");
        
        ctx.fillStyle = '#808080';
        ctx.fillRect(0, 0, finalWidth, finalHeight);

        const img = new Image();
        img.src = originalImage.url;
        await new Promise(r => img.onload = r);
        
        const imgDrawX = expandSteps.left * expansionStepSize;
        const imgDrawY = expandSteps.top * expansionStepSize;
        ctx.drawImage(img, imgDrawX, imgDrawY, originalWidth, originalHeight);
        
        const compositeDataUrl = canvas.toDataURL(originalImage.file.type);
        const compositeBase64 = compositeDataUrl.split(',')[1];
        
        const resultImageUrl = await expandImage(prompt, compositeBase64, originalImage.file.type);
        setResultData({ url: resultImageUrl, type: 'image' });
        setAppState(AppState.RESULT);

    } catch (err: any) {
        setError(err.message || 'An unexpected error occurred.');
        setAppState(AppState.EXPANDING);
    }
  }, [originalImage, expandSteps, prompt, expansionStepSize]);


  const handleEditSubmit = useCallback(async () => {
    if (!originalImage || !tool) {
      setError("An unexpected error occurred. Please start over.");
      return;
    }
    
    if (tool !== 'insert' && tool !== 'magicFill') {
      setError("Invalid tool for this action.");
      return;
    }

    if (!finalSelection && tool !== 'insert') {
      setError("Selection is missing. Please select an area on the image.");
      setAppState(AppState.EDITING);
      return;
    }

    setError(null);
    setAppState(AppState.LOADING);

    try {
      const originalDataUrl = await fileToDataUrl(originalImage.file);
      const originalBase64 = originalDataUrl.split(',')[1];
      let resultImageUrl: string;

      if (tool === 'magicFill') {
        if (!prompt) {
          setError("Please enter a text prompt to describe your edit.");
          setAppState(AppState.EDITING);
          return;
        }
        if (!finalSelection) {
            setError("Selection is missing. Please select an area on the image.");
            setAppState(AppState.EDITING);
            return;
        }
        setLoadingMessage('Applying AI magic...');
        resultImageUrl = await editImageWithText(
          prompt,
          originalBase64,
          finalSelection,
          originalImage.file.type,
          systemContext
        );
      } else if (tool === 'insert') {
        if (!insertImage) {
          setError("Please upload an image to insert.");
          setAppState(AppState.EDITING);
          return;
        }
        setLoadingMessage('Blending image...');
        const originalImg = new Image(); originalImg.src = originalImage.url;
        const insertImg = new Image(); insertImg.src = insertImage.url;
        await Promise.all([new Promise(r => originalImg.onload = r), new Promise(r => insertImg.onload = r)]);

        const { naturalWidth: imgWidth, naturalHeight: imgHeight } = insertImg;

        const buildTransformMatrix = (canvas: HTMLCanvasElement): DOMMatrix => {
            const { x, y, scale, rotation, rotateX, rotateY } = insertImageTransform;
            const matrix = new DOMMatrix();
            matrix.translateSelf((x / 100) * canvas.width, (y / 100) * canvas.height);
            matrix.rotateSelf(rotateX, rotateY, rotation);
            matrix.scaleSelf(scale / 100);
            matrix.translateSelf(-imgWidth / 2, -imgHeight / 2);
            return matrix;
        }

        const compositeCanvas = document.createElement('canvas');
        compositeCanvas.width = originalImage.width;
        compositeCanvas.height = originalImage.height;
        const ctx = compositeCanvas.getContext('2d');
        if (!ctx) throw new Error("Could not create canvas context");
        ctx.drawImage(originalImg, 0, 0);
        ctx.save();
        ctx.globalAlpha = insertImageTransform.opacity / 100;
        ctx.setTransform(buildTransformMatrix(compositeCanvas));
        ctx.drawImage(insertImg, 0, 0, imgWidth, imgHeight);
        ctx.restore();
        const compositeDataUrl = compositeCanvas.toDataURL(insertImage.file.type);
        const compositeBase64 = compositeDataUrl.split(',')[1];
        
        const maskCanvas = document.createElement('canvas');
        maskCanvas.width = originalImage.width;
        maskCanvas.height = originalImage.height;
        const maskCtx = maskCanvas.getContext('2d');
        if (!maskCtx) throw new Error("Could not create mask canvas context");
        maskCtx.fillStyle = 'black';
        maskCtx.fillRect(0, 0, maskCanvas.width, maskCanvas.height);
        maskCtx.save();
        maskCtx.fillStyle = 'white';
        maskCtx.setTransform(buildTransformMatrix(maskCanvas));
        maskCtx.fillRect(0, 0, imgWidth, imgHeight);
        maskCtx.restore();
        const preciseMaskDataUrl = maskCanvas.toDataURL('image/png');
        const preciseMaskBase64 = preciseMaskDataUrl.split(',')[1];

        resultImageUrl = await blendImages(
          originalBase64, compositeBase64, preciseMaskBase64,
          originalImage.file.type, insertImage.file.type
        );
      } else {
        throw new Error("Invalid edit mode selected.");
      }

      setResultData({ url: resultImageUrl, type: 'image' });
      setAppState(AppState.RESULT);

    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setAppState(AppState.EDITING);
    }
  }, [prompt, originalImage, systemContext, tool, insertImage, insertImageTransform, finalSelection]);

  const handleGenerateSubmit = useCallback(async () => {
    if (!generationPrompt) return;
    setError(null);
    setLoadingMessage('Creating your image...');
    setAppState(AppState.LOADING);
    try {
      const resultImageUrl = await generateImage(generationPrompt);
      setResultData({ url: resultImageUrl, type: 'image' });
      setOriginalImage(null);
      setAppState(AppState.RESULT);
    } catch (err: any) {
      setError(err.message || 'An unexpected error occurred.');
      setAppState(AppState.GENERATE_PROMPT);
    }
  }, [generationPrompt]);

  const handleReset = () => {
    setAppState(AppState.HOME);
    setOriginalImage(null);
    setUncroppedOriginalImage(null);
    setInsertImage(null);
    setResultData(null);
    setPrompt('');
    setGenerationPrompt('');
    setError(null);
    setIsSelectionDone(false);
    setFinalSelection(null);
    setSystemContext('');
    setTool(null);
    setIsPlacingImage(false);
    setExpandSteps({ top: 0, right: 0, bottom: 0, left: 0 });
    setExpandHistory([]);
  };

  const handleEditAgain = () => {
    setAppState(AppState.TOOL_SELECTION);
    setResultData(null);
    setPrompt('');
    setInsertImage(null);
    setIsPlacingImage(false);
    setUncroppedOriginalImage(null);
  };

  const handleBackToUpload = () => {
    setAppState(AppState.IDLE);
    setOriginalImage(null);
    setUncroppedOriginalImage(null);
    setResultData(null);
    setPrompt('');
    setError(null);
    setIsSelectionDone(false);
    setFinalSelection(null);
  };
  
  const handleBackToToolSelection = () => {
      setAppState(AppState.TOOL_SELECTION);
      setPrompt('');
      setInsertImage(null);
      setIsPlacingImage(false);
      setExpandSteps({ top: 0, right: 0, bottom: 0, left: 0 });
      setExpandHistory([]);
  }

  const handleImageResultForEditing = async (imageUrl: string, fileName: string) => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const file = new File([blob], fileName, { type: blob.type });
      const dataUrl = await fileToDataUrl(file);
      const { width, height } = await getImageDimensions(dataUrl);

      setOriginalImage({ url: dataUrl, file, width, height });
      setUncroppedOriginalImage(null);
      setAppState(AppState.TOOL_SELECTION);
      setResultData(null);
      setPrompt('');
      setInsertImage(null);
      setError(null);
      setIsSelectionDone(false);
      setFinalSelection(null);
      setTool(null);
      setIsPlacingImage(false);
      setExpandSteps({ top: 0, right: 0, bottom: 0, left: 0 });
      setExpandHistory([]);

    } catch (err) {
      setError("Could not prepare image for editing. Please try again.");
      setAppState(AppState.RESULT);
    }
  };

  const handleDragMove = useCallback((e: MouseEvent) => {
    const container = editorContainerRef.current;
    if (!container) return;

    const { width, height } = container.getBoundingClientRect();
    const deltaX = e.clientX - dragStartPos.current.clientX;
    const deltaY = e.clientY - dragStartPos.current.clientY;

    const deltaXPercent = (deltaX / width) * 100;
    const deltaYPercent = (deltaY / height) * 100;

    setInsertImageTransform(t => ({
      ...t,
      x: Math.max(0, Math.min(100, dragStartTransform.current.x + deltaXPercent)),
      y: Math.max(0, Math.min(100, dragStartTransform.current.y + deltaYPercent)),
    }));
  }, []);

  const handleDragEnd = useCallback(() => {
    setIsDragging(false);
    window.removeEventListener('mousemove', handleDragMove);
    window.removeEventListener('mouseup', handleDragEnd);
  }, [handleDragMove]);

  const handleDragStart = useCallback((e: React.MouseEvent) => {
    if (!isPlacingImage || !insertImage) return;
    e.preventDefault();
    setIsDragging(true);
    dragStartPos.current = { clientX: e.clientX, clientY: e.clientY };
    dragStartTransform.current = { x: insertImageTransform.x, y: insertImageTransform.y };
    window.addEventListener('mousemove', handleDragMove);
    window.addEventListener('mouseup', handleDragEnd);
  }, [isPlacingImage, insertImage, insertImageTransform.x, insertImageTransform.y, handleDragMove, handleDragEnd]);
  
  const handleStartCropping = () => {
    if (!uncroppedOriginalImage && originalImage) {
      setUncroppedOriginalImage(originalImage);
    }
    setIsCropping(true);
  };

  const handleRestoreOriginal = () => {
    if (uncroppedOriginalImage) {
      setOriginalImage(uncroppedOriginalImage);
      setUncroppedOriginalImage(null);
      
      // Reset dependant states
      setIsSelectionDone(false);
      setFinalSelection(null);
      editorRef.current?.clearMask();
    }
    setIsCropping(false);
  };

  const handleSaveCrop = async (croppedDataUrl: string) => {
    try {
        const response = await fetch(croppedDataUrl);
        const blob = await response.blob();
        const file = new File([blob], `cropped_${originalImage?.file.name}`, { type: blob.type });
        const { width, height } = await getImageDimensions(croppedDataUrl);

        setOriginalImage({ url: croppedDataUrl, file, width, height });
        
        // Reset dependant states
        setIsSelectionDone(false);
        setFinalSelection(null);
        editorRef.current?.clearMask();
        
        setIsCropping(false);
    } catch (err) {
        setError("Could not apply crop. Please try again.");
        setIsCropping(false);
    }
  };

  const renderPlacementUI = () => {
    if (!isPlacingImage || !insertImage) return null;
    const { x, y, scale, rotation, opacity, rotateX, rotateY } = insertImageTransform;
    const style: CSSProperties = {
      position: 'absolute', top: `${y}%`, left: `${x}%`,
      width: 'auto', height: 'auto', maxWidth: '200%', maxHeight: '200%',
      transform: `translate(-50%, -50%) rotateX(${rotateX}deg) rotateY(${rotateY}deg) rotate(${rotation}deg) scale(${scale / 100})`,
      opacity: opacity / 100, cursor: isDragging ? 'grabbing' : 'grab', touchAction: 'none',
    };
    return (
      <div onMouseDown={handleDragStart} style={style}>
        <img src={insertImage.url} alt="Object to insert" style={{ pointerEvents: 'none', userSelect: 'none' }} draggable="false" />
      </div>
    );
  };
  
  const ToolButton: React.FC<{onClick: () => void, icon: React.ReactNode, title: string, description: string, color: string}> = ({onClick, icon, title, description, color}) => (
      <div onClick={onClick} className={`bg-slate-800 p-8 rounded-lg shadow-lg hover:shadow-${color}-500/30 border border-slate-700 hover:border-${color}-500 transition-all duration-300 cursor-pointer transform hover:-translate-y-1`}>
          {icon}
          <h2 className="text-2xl font-bold mb-2 mt-4">{title}</h2>
          <p className="text-slate-400">{description}</p>
      </div>
  );

  const renderContent = () => {
    switch (appState) {
      case AppState.HOME:
        return (
          <div className="w-full max-w-4xl grid grid-cols-1 md:grid-cols-2 gap-8 text-center">
            <ToolButton onClick={() => setAppState(AppState.IDLE)} icon={<BrushIcon className="w-16 h-16 mx-auto text-indigo-400" />} title="Edit an Image" description="Upload your own photo to edit, insert objects, or expand the canvas." color="indigo" />
            <ToolButton onClick={() => setAppState(AppState.GENERATE_PROMPT)} icon={<PhotoIcon className="w-16 h-16 mx-auto text-teal-400" />} title="Create an Image" description="Generate a brand new image from a text description using AI." color="teal" />
          </div>
        )
      case AppState.GENERATE_PROMPT:
        return (
          <div className="w-full max-w-lg space-y-6">
            <h2 className="text-2xl font-bold text-center">Describe the image you want to create</h2>
            <textarea value={generationPrompt} onChange={(e) => setGenerationPrompt(e.target.value)} placeholder="e.g., a photorealistic portrait of a cat wearing a monocle" className="w-full h-32 bg-slate-800 border border-slate-700 rounded-md px-4 py-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" rows={4} />
            <button onClick={handleGenerateSubmit} disabled={!generationPrompt} className="w-full flex items-center justify-center gap-2 px-5 py-3 font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:bg-slate-500 disabled:cursor-not-allowed transition-colors"><SparklesIcon className="w-5 h-5" /> Generate</button>
            {error && <p className="mt-4 text-center text-red-400">{error}</p>}
          </div>
        );
      case AppState.IDLE:
        return (
          <div className="w-full max-w-md"><div className="w-full space-y-8">
            <div><label htmlFor="context-input" className="block text-sm font-medium text-slate-300 mb-2">Step 1: What's your goal? (Optional)</label><input id="context-input" type="text" value={systemContext} onChange={(e) => setSystemContext(e.target.value)} placeholder="e.g., photo restoration, marketing image" className="w-full bg-slate-800 border border-slate-700 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" /><p className="text-xs text-slate-500 mt-2">Providing context helps the AI understand your task better.</p></div>
            <div className="relative"><div className="absolute inset-0 flex items-center" aria-hidden="true"><div className="w-full border-t border-slate-700" /></div><div className="relative flex justify-center"><span className="bg-slate-900 px-2 text-sm text-slate-400">Step 2: Upload Image</span></div></div>
            <label htmlFor="file-upload" className="relative block w-full h-64 border-2 border-dashed border-slate-600 rounded-lg p-12 text-center cursor-pointer hover:border-indigo-500 transition-colors"><UploadIcon className="mx-auto h-12 w-12 text-slate-500" /><span className="mt-2 block text-sm font-semibold text-slate-300">Click to upload</span><span className="mt-1 block text-xs text-slate-400">PNG, JPG, GIF up to 10MB</span><input id="file-upload" name="file-upload" type="file" accept='image/*' className="sr-only" onChange={handleFileChange} /></label>
            {error && <p className="mt-4 text-center text-red-400">{error}</p>}
          </div></div>
        );
      case AppState.TOOL_SELECTION:
        return (
            <div className="w-full max-w-5xl flex flex-col items-center gap-6">
                <h2 className="text-2xl font-bold text-center">Choose Your Tool</h2>
                <div className="w-full grid grid-cols-1 md:grid-cols-3 gap-6 text-center">
                    <ToolButton onClick={() => handleToolSelect('magicFill')} icon={<BrushIcon className="w-12 h-12 mx-auto text-indigo-400" />} title="Magic Fill" description="Replace part of your image by selecting it and providing a prompt." color="indigo" />
                    <ToolButton onClick={() => handleToolSelect('insert')} icon={<PhotoIcon className="w-12 h-12 mx-auto text-teal-400" />} title="Insert Image" description="Add a new object to your image by uploading a second image." color="teal" />
                    <ToolButton onClick={() => handleToolSelect('expand')} icon={<ExpandIcon className="w-12 h-12 mx-auto text-purple-400" />} title="Magic Expand" description="Extend the canvas of your image and let AI fill in the details." color="purple" />
                </div>
                 <button onClick={handleBackToUpload} className="mt-4 flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"><BackIcon className="w-4 h-4" /> Change Image</button>
            </div>
        );
      case AppState.EXPANDING: {
        if (!originalImage) return null;
        
        const hasExpanded = Object.values(expandSteps).some(v => v > 0);
        const totalClicks = Object.values(expandSteps).reduce((sum, val) => sum + val, 0);
        const isAtLimit = totalClicks >= MAX_EXPANSION_CLICKS;

        const expandedWidth = originalImage.width + (expandSteps.left + expandSteps.right) * expansionStepSize;
        const expandedHeight = originalImage.height + (expandSteps.top + expandSteps.bottom) * expansionStepSize;

        const MAX_VIEWPORT_DIM = 550;
        
        const scaleX = MAX_VIEWPORT_DIM / expandedWidth;
        const scaleY = MAX_VIEWPORT_DIM / expandedHeight;
        const scale = Math.min(scaleX, scaleY, 1);

        const previewImageWidth = originalImage.width * scale;
        const previewImageHeight = originalImage.height * scale;

        const canvasStyle: CSSProperties = {
            width: `${expandedWidth * scale}px`,
            height: `${expandedHeight * scale}px`,
        };

        const imageStyle: CSSProperties = {
          position: 'absolute',
          width: `${previewImageWidth}px`,
          height: `${previewImageHeight}px`,
          top: `${expandSteps.top * expansionStepSize * scale}px`,
          left: `${expandSteps.left * expansionStepSize * scale}px`,
        };
        
        const ExpanderButton = ({ direction, icon, className }: { direction: any, icon: React.ReactNode, className: string }) => (
          <button 
            onClick={() => handleExpandClick(direction)} 
            disabled={isAtLimit}
            className={`z-10 bg-slate-700/80 hover:bg-slate-600 text-white rounded-full w-8 h-8 flex items-center justify-center transition-colors disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed ${className}`}>
            {icon}
          </button>
        );

        return (
            <div className="w-full max-w-6xl flex flex-col lg:flex-row items-start gap-8">
                <div className="flex-grow w-full bg-slate-800/50 rounded-lg p-4">
                    <div className="flex items-center gap-4 mb-4">
                        <button onClick={handleBackToToolSelection} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"><BackIcon className="w-4 h-4" /> Change Tool</button>
                        <button onClick={handleUndoExpand} disabled={expandHistory.length === 0} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-md transition-colors disabled:bg-slate-800 disabled:text-slate-500 disabled:cursor-not-allowed"><UndoIcon className="w-4 h-4" /> Undo</button>
                    </div>
                    <div className="relative w-full aspect-[4/3] rounded-lg flex items-center justify-center overflow-hidden p-4 select-none bg-slate-900/50">
                        <div style={canvasStyle} className="relative transition-all duration-300 shadow-lg" >
                          <div className="absolute inset-0" style={{ backgroundSize: '20px 20px', backgroundImage: 'linear-gradient(to right, rgba(255,255,255,0.05) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.05) 1px, transparent 1px)' }}></div>
                          <img src={originalImage.url} alt="Original content" style={imageStyle} className="pointer-events-none transition-all duration-300" />
                        </div>
                        <ExpanderButton direction="top-left" icon={<ArrowUpLeftIcon className="w-5 h-5" />} className="absolute top-4 left-4" />
                        <ExpanderButton direction="top" icon={<ArrowUpIcon className="w-5 h-5" />} className="absolute top-4 left-1/2 -translate-x-1/2" />
                        <ExpanderButton direction="top-right" icon={<ArrowUpRightIcon className="w-5 h-5" />} className="absolute top-4 right-4" />
                        <ExpanderButton direction="left" icon={<ArrowLeftIcon className="w-5 h-5" />} className="absolute top-1/2 left-4 -translate-y-1/2" />
                        <ExpanderButton direction="right" icon={<ArrowRightIcon className="w-5 h-5" />} className="absolute top-1/2 right-4 -translate-y-1/2" />
                        <ExpanderButton direction="bottom-left" icon={<ArrowDownLeftIcon className="w-5 h-5" />} className="absolute bottom-4 left-4" />
                        <ExpanderButton direction="bottom" icon={<ArrowDownIcon className="w-5 h-5" />} className="absolute bottom-4 left-1/2 -translate-x-1/2" />
                        <ExpanderButton direction="bottom-right" icon={<ArrowDownRightIcon className="w-5 h-5" />} className="absolute bottom-4 right-4" />
                    </div>
                </div>
                <div className="w-full lg:w-96 flex-shrink-0 bg-slate-800 rounded-lg shadow-lg p-6">
                    <h3 className="text-lg font-bold mb-1 text-purple-400">Magic Expand</h3>
                    <p className="text-sm text-slate-400 mb-4">Click the arrows to add space around your image (max {MAX_EXPANSION_CLICKS} expansions), then describe what the AI should create in the new area.</p>
                    <div className="border-t border-slate-700 my-4"></div>
                    <textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., a beautiful sunset, a bustling city street" className="w-full h-24 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-2 focus:ring-purple-500 focus:outline-none transition" rows={3} />
                    <button onClick={handleExpandSubmit} disabled={!prompt || !hasExpanded} className="mt-4 w-full flex items-center justify-center gap-2 px-5 py-2 font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-500 disabled:bg-slate-500 disabled:cursor-not-allowed transition-colors"><SparklesIcon className="w-5 h-5" /> Generate</button>
                    {error && <p className="mt-4 text-center text-red-400">{error}</p>}
                </div>
            </div>
        );
      }
      case AppState.EDITING: {
        if (!originalImage) return null;
        if (isCropping) {
            return (
                <ImageCropper 
                    imageSrc={(uncroppedOriginalImage ?? originalImage)!.url} 
                    onCrop={handleSaveCrop}
                    onCancel={() => setIsCropping(false)}
                    onRestore={handleRestoreOriginal}
                    showRestoreButton={!!uncroppedOriginalImage}
                />
            );
        }

        const editorContainerStyle: CSSProperties = isPlacingImage ? { perspective: `${insertImageTransform.perspective}px` } : {};
        const isReadyForSubmit = (tool === 'magicFill' && !!prompt) || (tool === 'insert' && !!insertImage && !isPlacingImage);
        return (
          <div className="w-full max-w-6xl flex flex-col lg:flex-row items-start gap-8">
            <div ref={editorContainerRef} className="flex-grow w-full relative" style={editorContainerStyle}>
              <div className="flex items-center justify-between gap-4 mb-4">
                <button onClick={handleBackToToolSelection} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"><BackIcon className="w-4 h-4" /> Change Tool</button>
                {(tool === 'magicFill' || tool === 'insert') && (
                    <button onClick={handleStartCropping} className="flex items-center gap-2 px-3 py-1.5 text-sm font-semibold bg-slate-700 hover:bg-slate-600 rounded-md transition-colors"><CropIcon className="w-4 h-4" /> Crop Image</button>
                )}
              </div>
              <ImageEditor key={originalImage.url} ref={editorRef} imageSrc={originalImage.url} brushSize={brushSize} />
              {renderPlacementUI()}
            </div>
            <div className="w-full lg:w-96 flex-shrink-0 bg-slate-800 rounded-lg shadow-lg">
              {!isSelectionDone ? (<div className="p-6">
                <h3 className="text-lg font-bold mb-1 text-indigo-400">Step 1: Select Area</h3><p className="text-sm text-slate-400 mb-4">Brush over the area you want to edit.</p><div className="space-y-4"><div className="space-y-2"><label htmlFor="brush-size" className="flex justify-between items-center text-sm font-medium text-slate-300"><span>Brush Size</span><span>{brushSize}px</span></label><div className="flex items-center gap-3"><BrushIcon className="w-5 h-5 text-slate-400 flex-shrink-0" /><input id="brush-size" type="range" min="5" max="100" value={brushSize} onChange={(e) => setBrushSize(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-indigo-500" /></div></div><button onClick={() => editorRef.current?.clearMask()} className="w-full px-4 py-2 text-sm font-semibold bg-slate-600 hover:bg-slate-500 rounded-md transition-colors">Clear Selection</button><button onClick={() => { const selection = editorRef.current?.getMaskAsBase64(); if (selection) { setFinalSelection(selection); setIsSelectionDone(true); setError(null); } else { setError("Please select an area before proceeding."); } }} className="w-full px-4 py-2 font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors">Next Step</button></div>
              </div>) : isPlacingImage ? (<div className="p-6">
                <h3 className="text-lg font-bold mb-1 text-teal-400">Step 2: Place Image</h3><p className="text-sm text-slate-400 mb-4">Drag image to position or use sliders for details.</p>
                <div className="space-y-1"><details className="group" open><summary className="flex justify-between items-center p-2 font-medium cursor-pointer list-none hover:bg-slate-700 rounded-md">Transform<ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" /></summary><div className="p-2 space-y-4">{[{ label: 'X-Position', value: insertImageTransform.x, setter: (v: number) => setInsertImageTransform(t => ({ ...t, x: v })) }, { label: 'Y-Position', value: insertImageTransform.y, setter: (v: number) => setInsertImageTransform(t => ({ ...t, y: v })) }, { label: 'Scale', value: insertImageTransform.scale, setter: (v: number) => setInsertImageTransform(t => ({ ...t, scale: v })), min: 1, max: 200 }, { label: 'Rotation', value: insertImageTransform.rotation, setter: (v: number) => setInsertImageTransform(t => ({ ...t, rotation: v })), min: 0, max: 360 },].map(({ label, value, setter, min = 0, max = 100 }) => (<div key={label}><label className="flex justify-between items-center text-sm font-medium text-slate-300"><span>{label}</span><span>{Math.round(value)}</span></label><input type="range" min={min} max={max} value={value} onChange={e => setter(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500 mt-1" /></div>))}</div></details><details className="group"><summary className="flex justify-between items-center p-2 font-medium cursor-pointer list-none hover:bg-slate-700 rounded-md">Perspective<ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" /></summary><div className="p-2 space-y-4">{[{ label: 'Perspective', value: insertImageTransform.perspective, setter: (v: number) => setInsertImageTransform(t => ({ ...t, perspective: v })), min: 300, max: 2000 }, { label: 'Tilt (Vertical)', value: insertImageTransform.rotateX, setter: (v: number) => setInsertImageTransform(t => ({ ...t, rotateX: v })), min: -90, max: 90 }, { label: 'Tilt (Horizontal)', value: insertImageTransform.rotateY, setter: (v: number) => setInsertImageTransform(t => ({ ...t, rotateY: v })), min: -90, max: 90 },].map(({ label, value, setter, min = 0, max = 100 }) => (<div key={label}><label className="flex justify-between items-center text-sm font-medium text-slate-300"><span>{label}</span><span>{Math.round(value)}</span></label><input type="range" min={min} max={max} value={value} onChange={e => setter(parseInt(e.target.value, 10))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500 mt-1" /></div>))}</div></details><details className="group" open><summary className="flex justify-between items-center p-2 font-medium cursor-pointer list-none hover:bg-slate-700 rounded-md">Appearance<ChevronDownIcon className="w-5 h-5 transition-transform duration-300 group-open:rotate-180" /></summary><div className="p-2 space-y-4"><div><label className="flex justify-between items-center text-sm font-medium text-slate-300"><span>Opacity</span><span>{Math.round(insertImageTransform.opacity)}</span></label><input type="range" min={0} max={100} value={insertImageTransform.opacity} onChange={e => setInsertImageTransform(t => ({ ...t, opacity: parseInt(e.target.value, 10) }))} className="w-full h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer accent-teal-500 mt-1" /></div></div></details></div>
                <div className="mt-6 space-y-2 p-6 pt-0"><button onClick={() => { setIsPlacingImage(false); handleEditSubmit(); }} className="w-full flex items-center justify-center gap-2 px-5 py-2 font-semibold bg-teal-600 text-white rounded-md hover:bg-teal-500 transition-colors"><SparklesIcon className="w-5 h-5" /> Insert & Blend</button><button onClick={() => { setIsPlacingImage(false); setInsertImage(null); }} className="w-full px-4 py-2 text-sm font-semibold bg-slate-600 hover:bg-slate-500 rounded-md transition-colors">Cancel</button></div>
              </div>) : (<div className="p-6">
                 <h3 className={`text-lg font-bold mb-1 ${tool === 'insert' ? 'text-teal-400' : 'text-indigo-400'}`}>
                    {tool === 'insert' ? 'Step 2: Insert an Image' : 'Step 2: Describe Your Edit'}
                 </h3>
                  <div className="space-y-4">
                    {tool === 'magicFill' && (<><p className="text-sm text-slate-400 mb-4">Tell the AI what to create in the selected area.</p><textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="e.g., a photorealistic tiger" className="w-full h-24 bg-slate-700 border border-slate-600 rounded-md px-3 py-2 focus:ring-2 focus:ring-indigo-500 focus:outline-none transition" rows={3} /></>)}
                    {tool === 'insert' && (
                      <>
                        <p className="text-sm text-slate-400 mb-4">Upload the image you want to place.</p>
                        <div className="space-y-3">{insertImage ? (<div className="bg-slate-700 p-3 rounded-md"><p className="text-sm font-medium text-slate-300 mb-2">Image to Insert:</p><div className="flex items-center gap-3"><img src={insertImage.url} alt="Insert preview" className="w-16 h-16 rounded-md object-cover" /><div className="flex-grow text-sm"><p className="font-semibold text-green-400">Ready to place</p><button onClick={() => setIsPlacingImage(true)} className="text-indigo-400 hover:underline text-xs">Adjust Placement</button></div></div></div>) : (<label htmlFor="insert-file-upload" className="relative block w-full border-2 border-dashed border-slate-600 rounded-lg p-6 text-center cursor-pointer hover:border-teal-500 transition-colors"><UploadIcon className="mx-auto h-8 w-8 text-slate-500" /><span className="mt-2 block text-xs font-semibold text-slate-300">Click to upload image</span><input id="insert-file-upload" name="insert-file-upload" type="file" accept='image/*' className="sr-only" onChange={handleInsertFileChange} /></label>)}</div>
                      </>
                    )}
                    <button onClick={handleEditSubmit} disabled={!isReadyForSubmit} className="w-full flex items-center justify-center gap-2 px-5 py-2 font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-500 disabled:bg-slate-500 disabled:cursor-not-allowed transition-colors"><SparklesIcon className="w-5 h-5" /> {tool === 'insert' ? 'Set Placement' : 'Generate'}</button>
                  </div>
              </div>)}
              {error && <p className="mt-4 text-center text-red-400 px-6 pb-4">{error}</p>}
            </div>
          </div>
        );
      }
      case AppState.LOADING: return <Loader message={loadingMessage} />;
      case AppState.RESULT:
        return (
          <div className="w-full max-w-4xl flex flex-col items-center gap-8">
            <h2 className="text-2xl font-bold text-center">{originalImage ? "Your Edited Image" : "Your Generated Image"}</h2>
            {originalImage ? (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 w-full">
                <div className="flex flex-col items-center"><h3 className="text-lg font-semibold text-slate-400 mb-2">Original</h3><img src={uncroppedOriginalImage?.url ?? originalImage.url} alt="Original" className="rounded-lg shadow-lg w-full object-contain" /></div>
                <div className="flex flex-col items-center"><h3 className="text-lg font-semibold text-slate-400 mb-2">Edited</h3><div className="relative group w-full">{resultData?.url && <img src={resultData.url} alt="Edited" className="rounded-lg shadow-lg w-full object-contain" />}<a href={resultData?.url} download={`edited-${originalImage.file.name}`} className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg cursor-pointer" aria-label="Download edited image"><DownloadIcon className="w-10 h-10 text-white" /></a></div></div>
              </div>
            ) : (
              <div className="w-full max-w-lg"><div className="relative group">{resultData?.url && <img src={resultData.url} alt="Generated" className="rounded-lg shadow-lg w-full object-contain" />}<a href={resultData?.url} download={`generated-image.png`} className="absolute inset-0 bg-black bg-opacity-60 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity rounded-lg cursor-pointer" aria-label="Download generated image"><DownloadIcon className="w-10 h-10 text-white" /></a></div></div>
            )}
            {(tool === 'magicFill' || tool === 'expand' || generationPrompt) && (
              <p className="text-center text-slate-300 bg-slate-800 p-3 rounded-md max-w-xl"><span className="font-semibold">Prompt:</span> {originalImage ? prompt : generationPrompt}</p>
            )}
            <div className="flex flex-wrap justify-center gap-4">
              {resultData && (<a href={resultData.url} download={`result-${originalImage?.file.name || 'image.png'}`} className="flex items-center gap-2 px-6 py-2 font-semibold bg-green-600 text-white rounded-md hover:bg-green-500 transition-colors"><DownloadIcon className="w-5 h-5" /> Download</a>)}
              {originalImage ? (<><button onClick={() => handleImageResultForEditing(resultData!.url, `edited-${originalImage.file.name}`)} className="flex items-center gap-2 px-6 py-2 font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-500 transition-colors"><SparklesIcon className="w-5 h-5" /> Continue Editing</button><button onClick={handleEditAgain} className="px-6 py-2 font-semibold bg-slate-600 text-white rounded-md hover:bg-slate-500 transition-colors">Edit Original Again</button></>) : (<button onClick={() => handleImageResultForEditing(resultData!.url, 'generated-image.png')} className="flex items-center gap-2 px-6 py-2 font-semibold bg-purple-600 text-white rounded-md hover:bg-purple-500 transition-colors"><BrushIcon className="w-5 h-5" /> Edit This Image</button>)}
              <button onClick={handleReset} className="px-6 py-2 font-semibold bg-indigo-600 text-white rounded-md hover:bg-indigo-500 transition-colors">Start Over</button>
            </div>
          </div>
        );
      default: return null;
    }
  };

  return (
    <div className="min-h-screen w-full flex flex-col items-center p-4 md:p-8">
      <header className="w-full max-w-6xl mx-auto flex justify-between items-center mb-10">
        <div className="w-24 flex-shrink-0"></div>
        <div className="flex-1 text-center">
            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold tracking-tight">Banana <span className="text-indigo-400">Brush</span></h1>
            <p className="mt-2 sm:mt-3 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto">Your AI-powered creative studio. Generate a new image from text, or upload your own to edit and transform with AI.</p>
        </div>
        <div className="w-24 flex-shrink-0 flex justify-end">
            {appState !== AppState.HOME && (
                <button onClick={handleReset} className="flex items-center gap-2 px-4 py-2 text-sm font-semibold bg-slate-700 text-white rounded-md hover:bg-slate-600 transition-colors" aria-label="Go to homepage">
                    <HomeIcon className="w-5 h-5" />
                    <span className="hidden sm:inline">Home</span>
                </button>
            )}
        </div>
      </header>
      <main className={`flex-grow w-full ${getMainClasses(appState)}`}>
        {renderContent()}
      </main>
      <footer className="text-center mt-auto pt-8 text-slate-500 text-sm">Powered by Gemini</footer>
    </div>
  );
}

export default App;