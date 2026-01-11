
import React from 'react';
import { RefreshCw, Download, Share2, Image as ImageIcon, Sparkles } from 'lucide-react';

interface VisualizerProps {
  generatedImageUrl: string | null;
  onRegenerate: () => void;
  onRefine?: () => void; // NEW: 精修回调
  isLoading: boolean;
  isPreview?: boolean; // NEW: 是否为预览图
}

const Visualizer: React.FC<VisualizerProps> = ({ generatedImageUrl, onRegenerate, onRefine, isLoading, isPreview = false }) => {
  return (
    <div className="bg-white border border-pink-100 rounded-2xl shadow-sm p-6 flex flex-col items-center justify-center h-[500px]">
      <div className="relative w-full h-full bg-gray-50 rounded-xl overflow-hidden group flex items-center justify-center">
        {isLoading ? (
          <div className="flex flex-col items-center gap-4">
            <div className="w-12 h-12 border-4 border-pink-200 border-t-pink-500 rounded-full animate-spin"></div>
            <p className="text-pink-600 font-medium animate-pulse text-sm">Generating your look...</p>
          </div>
        ) : generatedImageUrl ? (
          <>
            <img 
              src={generatedImageUrl} 
              alt="Generated Look" 
              className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
            />
            <div className="absolute bottom-4 left-0 right-0 flex justify-center gap-3 opacity-0 group-hover:opacity-100 transition-opacity duration-300 px-4">
              {isPreview && onRefine ? (
                // Preview 模式：显示"生成高清/精修"按钮
                <button 
                  onClick={onRefine}
                  className="flex-1 bg-pink-500 hover:bg-pink-600 text-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold shadow-lg transition-all"
                >
                  <Sparkles size={14} />
                  生成高清 / 精修
                </button>
              ) : (
                // Refine 模式或没有 onRefine：显示原有按钮
                <>
                  <button 
                    onClick={onRegenerate}
                    className="flex-1 bg-white/90 backdrop-blur-sm text-pink-500 hover:bg-white px-4 py-2.5 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold shadow-lg transition-all"
                  >
                    <RefreshCw size={14} className={isLoading ? 'animate-spin' : ''} />
                    Regenerate
                  </button>
                  <button className="bg-white/90 backdrop-blur-sm text-gray-600 hover:bg-white p-2.5 rounded-lg shadow-lg transition-all">
                    <Download size={14} />
                  </button>
                  <button className="bg-white/90 backdrop-blur-sm text-gray-600 hover:bg-white p-2.5 rounded-lg shadow-lg transition-all">
                    <Share2 size={14} />
                  </button>
                </>
              )}
            </div>
          </>
        ) : (
          <div className="flex flex-col items-center gap-3 text-gray-400">
            <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mb-2">
               <ImageIcon size={32} />
            </div>
            <p className="text-sm">Your look will appear here</p>
          </div>
        )}
      </div>
      
      {/* Mobile controls when image exists but not hovering */}
      {generatedImageUrl && !isLoading && (
        <div className="flex gap-2 mt-4 w-full md:hidden">
          {isPreview && onRefine ? (
            // Preview 模式：显示"生成高清/精修"按钮
            <button 
              onClick={onRefine}
              className="flex-1 bg-pink-500 hover:bg-pink-600 text-white px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all"
            >
              <Sparkles size={14} />
              生成高清 / 精修
            </button>
          ) : (
            // Refine 模式或没有 onRefine：显示原有按钮
            <>
              <button 
                onClick={onRegenerate}
                className="flex-1 bg-pink-50 text-pink-500 hover:bg-pink-100 px-4 py-2 rounded-lg flex items-center justify-center gap-2 text-xs font-semibold transition-all"
              >
                <RefreshCw size={14} />
                Regenerate
              </button>
              <button className="bg-gray-50 text-gray-600 p-2 rounded-lg transition-all">
                <Download size={14} />
              </button>
              <button className="bg-gray-50 text-gray-600 p-2 rounded-lg transition-all">
                <Share2 size={14} />
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
};

export default Visualizer;
