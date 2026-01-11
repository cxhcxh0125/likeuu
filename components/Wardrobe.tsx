
import React, { useState, useMemo, useRef, useCallback } from 'react';
import { Upload, Plus, Trash2, Tag, CheckCircle2, Sparkles, X, Loader2, AlertCircle, Crop } from 'lucide-react';
import { ClothingItem, CropRect, ClothingDetailCrop } from '../types';
import { analyzeClothing } from '../services/geminiService';

interface WardrobeProps {
  items: ClothingItem[];
  onUpload: (item: ClothingItem) => void;
  onRemove: (id: string) => void;
  onDragItem: (item: ClothingItem) => void;
  onStartTryOn: (selectedItems: ClothingItem[]) => void;
  onDetailCropChange?: (itemId: string, crop: ClothingDetailCrop | null) => void;
}

const generateId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
};

const Wardrobe: React.FC<WardrobeProps> = ({ items, onUpload, onRemove, onDragItem, onStartTryOn, onDetailCropChange }) => {
  const [analyzingCount, setAnalyzingCount] = useState(0);
  const [failedCount, setFailedCount] = useState(0);
  const [totalToAnalyze, setTotalToAnalyze] = useState(0);
  const [isSelectionMode, setIsSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [cropModalItem, setCropModalItem] = useState<ClothingItem | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const pendingSlots = useMemo(() => {
    const remaining = totalToAnalyze - analyzingCount - failedCount;
    return remaining > 0 ? Array(remaining).fill(0) : [];
  }, [totalToAnalyze, analyzingCount, failedCount]);

  const processFile = async (file: File): Promise<boolean> => {
    return new Promise((resolve) => {
      // 检测 HEIC/HEIF 格式并提示
      const isHeic = file.type === 'image/heic' || file.type === 'image/heif' || 
                     file.name.toLowerCase().endsWith('.heic') || 
                     file.name.toLowerCase().endsWith('.heif');
      if (isHeic) {
        console.log(`[Wardrobe] Detected HEIC/HEIF image: ${file.name}, will be automatically converted to JPEG`);
      }

      const reader = new FileReader();
      
      reader.onerror = () => {
        setFailedCount(prev => prev + 1);
        resolve(false);
      };

      reader.onloadend = async () => {
        const base64 = reader.result as string;
        try {
          const analysis = await analyzeClothing(base64);
          const newItem: ClothingItem = {
            id: generateId(),
            name: analysis.name || file.name.split('.')[0],
            category: analysis.category || 'General',
            imageUrl: base64,
            tags: analysis.tags || [],
          };
          onUpload(newItem);
          setAnalyzingCount(prev => prev + 1);
          resolve(true);
        } catch (error) {
          console.error(`Analysis failed for ${file.name}`, error);
          setFailedCount(prev => prev + 1);
          resolve(false);
        }
      };
      
      reader.readAsDataURL(file);
    });
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const fileList = Array.from(files);
    // Limit batch size to prevent browser crashes with huge amounts of base64 data
    const safeFileList = fileList.slice(0, 20); 
    if (fileList.length > 20) {
      alert("To ensure performance, we are processing the first 20 items.");
    }

    setTotalToAnalyze(safeFileList.length);
    setAnalyzingCount(0);
    setFailedCount(0);

    // Process files sequentially to avoid overwhelming the Gemini API and browser memory
    for (const file of safeFileList) {
      await processFile(file);
    }

    // Reset status after a short delay so user can see completion
    setTimeout(() => {
      if (fileInputRef.current) fileInputRef.current.value = '';
      setTotalToAnalyze(0);
    }, 3000);
  };

  const toggleSelection = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelectedIds(next);
  };

  const handleTryOnSubmit = () => {
    const selectedItems = items.filter(item => selectedIds.has(item.id));
    onStartTryOn(selectedItems);
    setIsSelectionMode(false);
    setSelectedIds(new Set());
  };

  const isBusy = totalToAnalyze > 0;
  const progressPercent = totalToAnalyze > 0 
    ? Math.round(((analyzingCount + failedCount) / totalToAnalyze) * 100) 
    : 0;

  return (
    <div className="bg-white p-6 rounded-3xl border border-gray-100 shadow-sm relative overflow-hidden">
      {/* Processing Progress Bar */}
      {isBusy && (
        <div className="absolute top-0 left-0 right-0 h-1 bg-gray-50 z-20">
          <div 
            className="h-full bg-pink-500 transition-all duration-500 ease-out"
            style={{ width: `${progressPercent}%` }}
          />
        </div>
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
        <div className="flex flex-col">
          <div className="flex items-center gap-3">
            <h2 className="text-xl font-bold text-gray-800">My Wardrobe</h2>
            <span className="bg-gray-100 text-gray-500 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">{items.length} Items</span>
          </div>
          {isBusy && (
            <p className="text-[10px] font-bold text-pink-500 mt-1 uppercase tracking-wider animate-pulse">
              AI Analyzing: {analyzingCount + failedCount} of {totalToAnalyze} 
              {failedCount > 0 && <span className="text-amber-500 ml-2">({failedCount} failed)</span>}
            </p>
          )}
        </div>
        
        <div className="flex items-center gap-2">
          {items.length > 0 && !isBusy && (
            <button 
              onClick={() => setIsSelectionMode(!isSelectionMode)}
              className={`px-4 py-2 rounded-full text-sm font-medium transition-all flex items-center gap-2 ${
                isSelectionMode 
                ? 'bg-pink-100 text-pink-600' 
                : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
              }`}
            >
              {isSelectionMode ? <X size={16} /> : <Sparkles size={16} />}
              {isSelectionMode ? 'Cancel Selection' : 'Try-on Multi-select'}
            </button>
          )}
          
          {!isSelectionMode && (
            <label className={`cursor-pointer bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-full shadow-lg shadow-pink-100 transition-all flex items-center justify-center gap-2 font-bold text-sm ${isBusy ? 'opacity-70 pointer-events-none' : ''}`}>
              <input 
                ref={fileInputRef}
                type="file" 
                className="hidden" 
                onChange={handleFileChange} 
                accept="image/*" 
                multiple 
                disabled={isBusy}
              />
              {isBusy ? (
                <>
                  <Loader2 size={18} className="animate-spin" />
                  <span>{progressPercent}% Done</span>
                </>
              ) : (
                <>
                  <Plus size={18} />
                  <span>Batch Upload</span>
                </>
              )}
            </label>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        {items.map(item => (
          <div 
            key={item.id}
            draggable={!isSelectionMode}
            onDragStart={() => !isSelectionMode && onDragItem(item)}
            onClick={() => isSelectionMode && toggleSelection(item.id)}
            className={`group relative aspect-[4/5] bg-gray-50 rounded-2xl overflow-hidden transition-all shadow-sm ${
              isSelectionMode 
                ? 'cursor-pointer hover:scale-[1.02]' 
                : 'cursor-move'
            } ${
              selectedIds.has(item.id) 
                ? 'ring-4 ring-pink-500 ring-offset-2 scale-[0.98]' 
                : 'hover:ring-2 hover:ring-pink-100'
            }`}
          >
            <img src={item.imageUrl} alt={item.name} className="w-full h-full object-cover" />
            
            {isSelectionMode && (
              <div className="absolute top-2 right-2 z-10">
                {selectedIds.has(item.id) ? (
                  <CheckCircle2 className="text-pink-500 fill-white drop-shadow-md" size={24} />
                ) : (
                  <div className="w-6 h-6 rounded-full border-2 border-white/80 bg-black/10 backdrop-blur-sm" />
                )}
              </div>
            )}

            {!isSelectionMode && (
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col items-center justify-center gap-2 p-2">
                  <p className="text-[10px] text-white font-medium text-center mb-1 line-clamp-1">{item.name}</p>
                  <div className="flex gap-2">
                    <button 
                      onClick={(e) => { e.stopPropagation(); setCropModalItem(item); }}
                      className="p-1.5 bg-blue-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-blue-600 transition-colors"
                      title="圈选细节区域"
                    >
                      <Crop size={12} />
                    </button>
                    <button 
                      onClick={(e) => { e.stopPropagation(); onRemove(item.id); }}
                      className="p-1.5 bg-red-500/80 backdrop-blur-sm text-white rounded-lg hover:bg-red-600 transition-colors"
                    >
                      <Trash2 size={12} />
                    </button>
                  </div>
              </div>
            )}
            
            <div className="absolute bottom-2 left-2 bg-white/90 backdrop-blur-sm px-1.5 py-0.5 rounded-lg text-[8px] font-bold text-gray-600 shadow-sm flex items-center gap-0.5 pointer-events-none">
              <Tag size={8} />
              {item.category}
            </div>
          </div>
        ))}

        {/* Loading Skeletons */}
        {pendingSlots.map((_, i) => (
          <div key={`pending-${i}`} className="aspect-[4/5] bg-pink-50/50 rounded-2xl border-2 border-dashed border-pink-100 flex flex-col items-center justify-center gap-2 animate-pulse">
            <Loader2 className="text-pink-300 animate-spin" size={24} />
            <span className="text-[10px] text-pink-400 font-bold uppercase">Analyzing...</span>
          </div>
        ))}

        {/* Failure Skeleton */}
        {failedCount > 0 && !isBusy && (
          <div className="aspect-[4/5] bg-amber-50 rounded-2xl border-2 border-dashed border-amber-200 flex flex-col items-center justify-center gap-2 p-4 text-center">
            <AlertCircle className="text-amber-500" size={24} />
            <span className="text-[10px] text-amber-600 font-bold uppercase">{failedCount} Item(s) failed</span>
            <button 
              onClick={() => setFailedCount(0)}
              className="text-[8px] bg-amber-100 text-amber-700 px-2 py-1 rounded-full hover:bg-amber-200 transition-colors font-black uppercase"
            >
              Dismiss
            </button>
          </div>
        )}

        {items.length === 0 && !isBusy && (
          <div className="col-span-full py-16 flex flex-col items-center justify-center border-2 border-dashed border-gray-100 rounded-3xl">
             <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center mb-4">
               <Upload className="text-gray-300" size={32} />
             </div>
             <p className="text-gray-400 text-sm font-medium">Your digital wardrobe is empty</p>
             <p className="text-gray-300 text-xs text-center px-4 mt-1">Upload multiple photos of your clothes to get started</p>
          </div>
        )}
      </div>

      {isSelectionMode && selectedIds.size > 0 && (
        <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-[60] animate-in fade-in slide-in-from-bottom-4 duration-300">
          <button 
            onClick={handleTryOnSubmit}
            className="bg-pink-600 text-white px-8 py-4 rounded-full shadow-2xl shadow-pink-200 flex items-center gap-3 font-bold hover:bg-pink-700 transition-all hover:scale-105 active:scale-95"
          >
            <Sparkles size={20} />
            AI Try-on with {selectedIds.size} {selectedIds.size === 1 ? 'Item' : 'Items'}
          </button>
        </div>
      )}

      {/* 裁剪细节区域模态框 */}
      {cropModalItem && (
        <CropModal
          item={cropModalItem}
          onClose={() => setCropModalItem(null)}
          onConfirm={(crop) => {
            if (onDetailCropChange) {
              onDetailCropChange(cropModalItem.id, crop);
            }
            setCropModalItem(null);
          }}
          onClear={() => {
            if (onDetailCropChange) {
              onDetailCropChange(cropModalItem.id, null);
            }
            setCropModalItem(null);
          }}
        />
      )}
    </div>
  );
};

/**
 * 裁剪细节区域模态框组件
 */
interface CropModalProps {
  item: ClothingItem;
  onClose: () => void;
  onConfirm: (crop: ClothingDetailCrop) => void;
  onClear: () => void;
}

const CropModal: React.FC<CropModalProps> = ({ item, onClose, onConfirm, onClear }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);
  const [startPos, setStartPos] = useState<{ x: number; y: number } | null>(null);
  const [imageSize, setImageSize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const [displaySize, setDisplaySize] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  // 加载图片并设置尺寸
  React.useEffect(() => {
    const img = new Image();
    img.onload = () => {
      const container = containerRef.current;
      if (!container) return;
      
      const containerWidth = container.clientWidth - 64; // 减去 padding
      const containerHeight = container.clientHeight - 200; // 减去其他元素高度
      
      const imgAspect = img.width / img.height;
      const containerAspect = containerWidth / containerHeight;
      
      let displayWidth: number, displayHeight: number;
      if (imgAspect > containerAspect) {
        displayWidth = containerWidth;
        displayHeight = containerWidth / imgAspect;
      } else {
        displayHeight = containerHeight;
        displayWidth = containerHeight * imgAspect;
      }
      
      setDisplaySize({ width: displayWidth, height: displayHeight });
      setImageSize({ width: img.width, height: img.height });
      
      if (canvasRef.current) {
        canvasRef.current.width = displayWidth;
        canvasRef.current.height = displayHeight;
        const ctx = canvasRef.current.getContext('2d');
        if (ctx) {
          ctx.drawImage(img, 0, 0, displayWidth, displayHeight);
        }
      }
    };
    img.src = item.imageUrl;
    imageRef.current = img;
  }, [item.imageUrl]);

  // 绘制裁剪框
  const drawCropRect = useCallback((ctx: CanvasRenderingContext2D, rect: CropRect | null, start: { x: number; y: number } | null, current: { x: number; y: number } | null) => {
    if (!imageRef.current) return;
    
    // 重新绘制图片
    ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    ctx.drawImage(imageRef.current, 0, 0, ctx.canvas.width, ctx.canvas.height);
    
    // 绘制半透明遮罩
    ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
    ctx.fillRect(0, 0, ctx.canvas.width, ctx.canvas.height);
    
    let rectToDraw: CropRect | null = null;
    if (rect) {
      rectToDraw = rect;
    } else if (start && current) {
      const scaleX = imageSize.width / displaySize.width;
      const scaleY = imageSize.height / displaySize.height;
      const x = Math.min(start.x, current.x);
      const y = Math.min(start.y, current.y);
      const w = Math.abs(current.x - start.x);
      const h = Math.abs(current.y - start.y);
      rectToDraw = {
        x: Math.max(0, Math.min(x, ctx.canvas.width)),
        y: Math.max(0, Math.min(y, ctx.canvas.height)),
        w: Math.max(32, Math.min(w, ctx.canvas.width)),
        h: Math.max(32, Math.min(h, ctx.canvas.height))
      };
    }
    
    if (rectToDraw) {
      // 清除选中区域
      ctx.clearRect(rectToDraw.x, rectToDraw.y, rectToDraw.w, rectToDraw.h);
      ctx.drawImage(imageRef.current, rectToDraw.x, rectToDraw.y, rectToDraw.w, rectToDraw.h, rectToDraw.x, rectToDraw.y, rectToDraw.w, rectToDraw.h);
      
      // 绘制边框
      ctx.strokeStyle = '#3b82f6';
      ctx.lineWidth = 2;
      ctx.setLineDash([5, 5]);
      ctx.strokeRect(rectToDraw.x, rectToDraw.y, rectToDraw.w, rectToDraw.h);
      ctx.setLineDash([]);
      
      // 绘制角点
      const cornerSize = 8;
      ctx.fillStyle = '#3b82f6';
      ctx.fillRect(rectToDraw.x - cornerSize/2, rectToDraw.y - cornerSize/2, cornerSize, cornerSize);
      ctx.fillRect(rectToDraw.x + rectToDraw.w - cornerSize/2, rectToDraw.y - cornerSize/2, cornerSize, cornerSize);
      ctx.fillRect(rectToDraw.x - cornerSize/2, rectToDraw.y + rectToDraw.h - cornerSize/2, cornerSize, cornerSize);
      ctx.fillRect(rectToDraw.x + rectToDraw.w - cornerSize/2, rectToDraw.y + rectToDraw.h - cornerSize/2, cornerSize, cornerSize);
    }
  }, [imageSize, displaySize]);

  const handleMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    setIsDrawing(true);
    setStartPos({ x, y });
    setCropRect(null);
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawCropRect(ctx, null, startPos, { x: currentX, y: currentY });
    }
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !startPos) return;
    
    const canvas = canvasRef.current;
    if (!canvas) return;
    
    const rect = canvas.getBoundingClientRect();
    const currentX = e.clientX - rect.left;
    const currentY = e.clientY - rect.top;
    
    const scaleX = imageSize.width / displaySize.width;
    const scaleY = imageSize.height / displaySize.height;
    
    const x = Math.min(startPos.x, currentX) * scaleX;
    const y = Math.min(startPos.y, currentY) * scaleY;
    const w = Math.abs(currentX - startPos.x) * scaleX;
    const h = Math.abs(currentY - startPos.y) * scaleY;
    
    if (w >= 32 && h >= 32) {
      const finalRect: CropRect = {
        x: Math.max(0, Math.floor(x)),
        y: Math.max(0, Math.floor(y)),
        w: Math.max(32, Math.floor(Math.min(w, imageSize.width - x))),
        h: Math.max(32, Math.floor(Math.min(h, imageSize.height - y)))
      };
      setCropRect(finalRect);
      
      const ctx = canvas.getContext('2d');
      if (ctx) {
        drawCropRect(ctx, finalRect, null, null);
      }
    }
    
    setIsDrawing(false);
    setStartPos(null);
  };

  const handleConfirm = () => {
    if (cropRect) {
      onConfirm({
        imageDataUrl: item.imageUrl,
        rect: cropRect
      });
    }
  };

  return (
    <div className="fixed inset-0 z-[200] bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onClick={onClose}>
      <div 
        ref={containerRef}
        className="bg-white rounded-3xl shadow-2xl max-w-4xl w-full max-h-[90vh] flex flex-col overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="p-6 border-b border-gray-100 flex items-center justify-between">
          <div>
            <h3 className="text-xl font-bold text-gray-900">圈选细节区域</h3>
            <p className="text-sm text-gray-500 mt-1">拖拽鼠标框选需要重点还原的细节（如 logo、刺绣、图案等）</p>
          </div>
          <button onClick={onClose} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
            <X size={24} />
          </button>
        </div>
        
        <div className="flex-1 overflow-auto p-8 flex items-center justify-center bg-gray-50">
          <canvas
            ref={canvasRef}
            className="border border-gray-200 rounded-lg cursor-crosshair shadow-lg"
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={() => setIsDrawing(false)}
          />
        </div>
        
        <div className="p-6 bg-gray-50 border-t border-gray-100 flex items-center justify-between">
          <button
            onClick={onClear}
            className="px-4 py-2 text-gray-600 hover:bg-gray-200 rounded-xl font-medium transition-colors"
          >
            清除圈选
          </button>
          <div className="flex gap-3">
            <button
              onClick={onClose}
              className="px-6 py-2 bg-gray-200 text-gray-700 rounded-xl font-medium hover:bg-gray-300 transition-colors"
            >
              取消
            </button>
            <button
              onClick={handleConfirm}
              disabled={!cropRect}
              className="px-6 py-2 bg-blue-500 text-white rounded-xl font-medium hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              确认圈选
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default Wardrobe;
