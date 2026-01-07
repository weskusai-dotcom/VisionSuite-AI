
import React, { useState, useCallback, useRef, useMemo } from 'react';
import { ImageFile, ProcessingMode, HistoryState, OutputQuality, BgColor } from './types';
import { removeBackground, analyzeImage } from './geminiService';
import JSZip from 'jszip';
import { 
  CloudArrowUpIcon, 
  TrashIcon, 
  SparklesIcon, 
  TagIcon, 
  ChatBubbleBottomCenterTextIcon,
  CheckCircleIcon,
  ArrowPathIcon,
  XMarkIcon,
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  ArrowUturnRightIcon,
  ArrowsPointingOutIcon,
  SwatchIcon,
  AdjustmentsHorizontalIcon
} from '@heroicons/react/24/outline';

// @google/genai compliant senior engineer fix: Adding missing default export and completing the logic.
const App: React.FC = () => {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [mode, setMode] = useState<ProcessingMode>(ProcessingMode.FULL_SUITE);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [renamePattern, setRenamePattern] = useState('image_###');
  const [maxDimension, setMaxDimension] = useState<number | ''>('');
  const [quality, setQuality] = useState<OutputQuality>('high');
  const [bgColor, setBgColor] = useState<BgColor>('transparent');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files) as File[];
      const newFiles: ImageFile[] = filesArray.map(file => ({
        id: Math.random().toString(36).slice(2, 11),
        file,
        preview: URL.createObjectURL(file),
        status: 'pending' as const,
        progress: 0,
        history: [{ resultImage: undefined, tags: undefined, caption: undefined }],
        historyIndex: 0
      }));
      setImages(prev => [...prev, ...newFiles]);
    }
  };

  const removeImage = (id: string) => {
    setImages(prev => {
      const imgToRemove = prev.find(img => img.id === id);
      if (imgToRemove?.preview) URL.revokeObjectURL(imgToRemove.preview);
      return prev.filter(img => img.id !== id);
    });
  };

  const addToHistory = (id: string, state: HistoryState) => {
    setImages(prev => prev.map(img => {
      if (img.id !== id) return img;
      const newHistory = img.history.slice(0, img.historyIndex + 1);
      newHistory.push(state);
      return {
        ...img,
        ...state,
        history: newHistory,
        historyIndex: newHistory.length - 1
      };
    }));
  };

  const undo = (id: string) => {
    setImages(prev => prev.map(img => {
      if (img.id !== id || img.historyIndex <= 0) return img;
      const newIndex = img.historyIndex - 1;
      const prevState = img.history[newIndex];
      return { ...img, ...prevState, historyIndex: newIndex };
    }));
  };

  const redo = (id: string) => {
    setImages(prev => prev.map(img => {
      if (img.id !== id || img.historyIndex >= img.history.length - 1) return img;
      const newIndex = img.historyIndex + 1;
      const nextState = img.history[newIndex];
      return { ...img, ...nextState, historyIndex: newIndex };
    }));
  };

  const getHexColor = (color: BgColor): string => {
    switch (color) {
      case 'white': return '#FFFFFF';
      case 'black': return '#000000';
      case 'green': return '#00FF00';
      default: return 'transparent';
    }
  };

  const processOutputImage = async (
    dataUrl: string, 
    maxDim: number | '', 
    targetQuality: OutputQuality, 
    targetBg: BgColor
  ): Promise<string> => {
    return new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let width = img.width;
        let height = img.height;

        if (maxDim && typeof maxDim === 'number') {
          if (width > height) {
            if (width > maxDim) {
              height *= maxDim / width;
              width = maxDim;
            }
          } else {
            if (height > maxDim) {
              width *= maxDim / height;
              height = maxDim;
            }
          }
        }

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) return resolve(dataUrl);

        if (targetBg !== 'transparent') {
          ctx.fillStyle = getHexColor(targetBg);
          ctx.fillRect(0, 0, width, height);
        } else {
          ctx.clearRect(0, 0, width, height);
        }

        ctx.drawImage(img, 0, 0, width, height);

        const qualityValue = targetQuality === 'low' ? 0.3 : targetQuality === 'medium' ? 0.7 : 0.95;
        if (targetBg === 'transparent') {
          resolve(canvas.toDataURL('image/png'));
        } else {
          resolve(canvas.toDataURL('image/jpeg', qualityValue));
        }
      };
      img.src = dataUrl;
    });
  };

  const processImages = async () => {
    setIsProcessing(true);
    for (const img of images) {
      if (img.status === 'completed') continue;

      setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: 'processing', progress: 10 } : i));

      try {
        const reader = new FileReader();
        const base64Promise = new Promise<string>((resolve) => {
          reader.onload = () => resolve((reader.result as string).split(',')[1]);
          reader.readAsDataURL(img.file);
        });
        const base64 = await base64Promise;

        let resultImage = img.resultImage;
        let tags = img.tags;
        let caption = img.caption;

        if (mode === ProcessingMode.BACKGROUND_REMOVAL || mode === ProcessingMode.FULL_SUITE) {
          setImages(prev => prev.map(i => i.id === img.id ? { ...i, subStatus: 'Removing Background...' } : i));
          resultImage = await removeBackground(base64);
        }

        if (mode === ProcessingMode.TAGGING || mode === ProcessingMode.CAPTIONING || mode === ProcessingMode.FULL_SUITE) {
          setImages(prev => prev.map(i => i.id === img.id ? { ...i, subStatus: 'Analyzing Image...' } : i));
          const analysis = await analyzeImage(base64, img.file.type);
          if (mode === ProcessingMode.TAGGING || mode === ProcessingMode.FULL_SUITE) tags = analysis.tags;
          if (mode === ProcessingMode.CAPTIONING || mode === ProcessingMode.FULL_SUITE) caption = analysis.caption;
        }

        const newState: HistoryState = { resultImage, tags, caption };
        addToHistory(img.id, newState);
        setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: 'completed', progress: 100, subStatus: undefined } : i));
      } catch (error: any) {
        setImages(prev => prev.map(i => i.id === img.id ? { ...i, status: 'error', error: error.message } : i));
      }
    }
    setIsProcessing(false);
  };

  const downloadAll = async () => {
    const completedImages = images.filter(img => img.status === 'completed');
    if (completedImages.length === 0) return;

    setIsDownloading(true);
    try {
      const zip = new JSZip();
      const folder = zip.folder("processed_images");

      for (let i = 0; i < completedImages.length; i++) {
        const img = completedImages[i];
        let finalDataUrl = img.resultImage || img.preview;
        
        finalDataUrl = await processOutputImage(finalDataUrl, maxDimension, quality, bgColor);

        const base64Data = finalDataUrl.split(',')[1];
        const extension = bgColor === 'transparent' ? 'png' : 'jpg';
        const fileName = renamePattern.replace('###', (i + 1).toString().padStart(3, '0')) + '.' + extension;
        folder?.file(fileName, base64Data, { base64: true });
        
        if (img.tags || img.caption) {
          const metaContent = `Caption: ${img.caption || ''}\nTags: ${(img.tags || []).join(', ')}`;
          folder?.file(fileName.replace('.' + extension, '.txt'), metaContent);
        }
      }

      const content = await zip.generateAsync({ type: "blob" });
      const link = document.createElement('a');
      link.href = URL.createObjectURL(content);
      link.download = "processed_images.zip";
      link.click();
    } catch (err) {
      console.error("Download failed", err);
    } finally {
      setIsDownloading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 font-sans">
      <header className="bg-white border-b border-gray-200 py-4 px-8 flex justify-between items-center sticky top-0 z-10 shadow-sm">
        <div className="flex items-center gap-2 text-indigo-600">
          <SparklesIcon className="w-8 h-8" />
          <h1 className="text-xl font-bold tracking-tight text-gray-900">VisionSuite AI</h1>
        </div>
        <div className="flex gap-3">
          <button 
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300 rounded-lg hover:bg-gray-50 transition-colors"
          >
            <CloudArrowUpIcon className="w-5 h-5" />
            Upload
          </button>
          <button 
            onClick={processImages}
            disabled={images.length === 0 || isProcessing}
            className="flex items-center gap-2 px-6 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isProcessing ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <SparklesIcon className="w-5 h-5" />}
            {isProcessing ? 'Processing...' : 'Run VisionSuite'}
          </button>
          <button 
            onClick={downloadAll}
            disabled={!images.some(img => img.status === 'completed') || isDownloading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors shadow-sm"
          >
            {isDownloading ? <ArrowPathIcon className="w-5 h-5 animate-spin" /> : <ArrowDownTrayIcon className="w-5 h-5" />}
            Download All
          </button>
        </div>
      </header>

      <main className="p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        <aside className="lg:col-span-1 space-y-6">
          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <AdjustmentsHorizontalIcon className="w-4 h-4" />
              Processing Mode
            </h2>
            <div className="grid grid-cols-1 gap-2">
              {Object.values(ProcessingMode).map(m => (
                <button
                  key={m}
                  onClick={() => setMode(m)}
                  className={`text-left px-4 py-3 rounded-lg border transition-all ${
                    mode === m 
                      ? 'bg-indigo-50 border-indigo-200 text-indigo-700 shadow-sm' 
                      : 'bg-white border-gray-200 text-gray-600 hover:border-gray-300'
                  }`}
                >
                  <div className="font-medium capitalize">{m.replace('-', ' ')}</div>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm space-y-4">
            <h2 className="text-sm font-semibold text-gray-500 uppercase tracking-wider flex items-center gap-2">
              <SwatchIcon className="w-4 h-4" />
              Output Settings
            </h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Rename Pattern</label>
                <input 
                  type="text" 
                  value={renamePattern}
                  onChange={(e) => setRenamePattern(e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="image_###"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Max Dimension (px)</label>
                <input 
                  type="number" 
                  value={maxDimension}
                  onChange={(e) => setMaxDimension(e.target.value ? parseInt(e.target.value) : '')}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                  placeholder="Original"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Background Color</label>
                <select 
                  value={bgColor}
                  onChange={(e) => setBgColor(e.target.value as BgColor)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-indigo-500 focus:border-indigo-500"
                >
                  <option value="transparent">Transparent (PNG)</option>
                  <option value="white">White (JPG)</option>
                  <option value="black">Black (JPG)</option>
                  <option value="green">Green Screen (JPG)</option>
                </select>
              </div>
            </div>
          </div>
        </aside>

        <section className="lg:col-span-3">
          {images.length === 0 ? (
            <div 
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-300 rounded-2xl h-96 flex flex-col items-center justify-center text-gray-400 hover:border-indigo-400 hover:text-indigo-500 cursor-pointer transition-all bg-white"
            >
              <CloudArrowUpIcon className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium text-gray-600">Click or drag images here to start</p>
              <p className="text-sm">Supports PNG, JPG, WebP</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
              {images.map(img => (
                <div key={img.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm flex flex-col group relative">
                  <div className="aspect-square bg-gray-100 relative overflow-hidden flex items-center justify-center p-2">
                    <img 
                      src={img.resultImage || img.preview} 
                      alt="preview" 
                      className={`max-w-full max-h-full object-contain ${img.status === 'processing' ? 'opacity-50 grayscale' : ''}`}
                    />
                    
                    {img.status === 'processing' && (
                      <div className="absolute inset-0 flex flex-col items-center justify-center bg-white/60 backdrop-blur-[1px]">
                        <ArrowPathIcon className="w-8 h-8 animate-spin text-indigo-600 mb-2" />
                        <span className="text-xs font-semibold text-indigo-700 px-3 py-1 bg-white/80 rounded-full shadow-sm">
                          {img.subStatus || 'Processing...'}
                        </span>
                      </div>
                    )}

                    <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button 
                        onClick={() => undo(img.id)}
                        disabled={img.historyIndex <= 0}
                        className="p-1.5 bg-white rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ArrowUturnLeftIcon className="w-4 h-4 text-gray-600" />
                      </button>
                      <button 
                        onClick={() => redo(img.id)}
                        disabled={img.historyIndex >= img.history.length - 1}
                        className="p-1.5 bg-white rounded-md border border-gray-200 hover:bg-gray-50 disabled:opacity-50"
                      >
                        <ArrowUturnRightIcon className="w-4 h-4 text-gray-600" />
                      </button>
                      <button 
                        onClick={() => removeImage(img.id)}
                        className="p-1.5 bg-red-50 text-red-600 rounded-md border border-red-100 hover:bg-red-100"
                      >
                        <XMarkIcon className="w-4 h-4" />
                      </button>
                    </div>

                    {img.status === 'completed' && (
                      <div className="absolute bottom-2 left-2">
                        <CheckCircleIcon className="w-6 h-6 text-green-500 bg-white rounded-full shadow-sm" />
                      </div>
                    )}
                  </div>

                  <div className="p-4 flex-grow space-y-3 border-t border-gray-100">
                    <div className="flex justify-between items-start">
                      <span className="text-xs font-medium text-gray-500 truncate max-w-[150px]">{img.file.name}</span>
                      {img.error && <span className="text-[10px] text-red-500 font-bold uppercase tracking-tight">Error</span>}
                    </div>

                    {img.caption && (
                      <div className="space-y-1">
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <ChatBubbleBottomCenterTextIcon className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Caption</span>
                        </div>
                        <p className="text-xs text-gray-700 line-clamp-2 leading-relaxed italic">"{img.caption}"</p>
                      </div>
                    )}

                    {img.tags && img.tags.length > 0 && (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-1.5 text-gray-400">
                          <TagIcon className="w-3.5 h-3.5" />
                          <span className="text-[10px] font-bold uppercase tracking-wider">Tags</span>
                        </div>
                        <div className="flex flex-wrap gap-1">
                          {img.tags.map(tag => (
                            <span key={tag} className="px-1.5 py-0.5 bg-gray-50 text-gray-600 rounded text-[10px] font-medium border border-gray-100">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      <input 
        type="file" 
        ref={fileInputRef} 
        onChange={handleFileChange} 
        multiple 
        accept="image/*" 
        className="hidden" 
      />
    </div>
  );
};

export default App;
