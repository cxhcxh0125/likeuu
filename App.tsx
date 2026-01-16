
import React, { useState, useEffect, useCallback } from 'react';
import { Sparkles, Settings, User, Key, Info, X, Save, Image as ImageIcon, Shirt, CheckCircle2 } from 'lucide-react';
import { ClothingItem, Message, Recommendation, SavedLook, ClothingDetailCrop } from './types';
import ChatInterface from './components/ChatInterface';
import Visualizer from './components/Visualizer';
import Wardrobe from './components/Wardrobe';
import { chatWithGemini, generateFashionImage } from './services/geminiService';
import { storage } from './services/storageService';

const SYSTEM_INSTRUCTION = `You are "ULook Stylist", a high-end AI fashion consultant. 
Keep responses stylish, helpful, and concise. 
Always suggest color palettes and specific garment types.`;

const RECOMMENDATIONS: Recommendation[] = [
  { id: '1', title: 'Urban Chic', subtitle: 'Work from cafe', imageUrl: 'https://images.unsplash.com/photo-1515886657613-9f3515b0c78f?w=400&q=80' },
  { id: '2', title: 'Summer Gala', subtitle: 'Outdoor formal', imageUrl: 'https://images.unsplash.com/photo-1496747611176-843222e1e57c?w=400&q=80' },
  { id: '3', title: 'Techwear Nomad', subtitle: 'Rainy city walk', imageUrl: 'https://images.unsplash.com/photo-1550684376-efcbd6e3f031?w=400&q=80' },
  { id: '4', title: 'Quiet Luxury', subtitle: 'Weekend brunch', imageUrl: 'https://images.unsplash.com/photo-1434389677669-e08b4cac3105?w=400&q=80' },
];

type View = 'stylist' | 'try-on';

const App: React.FC = () => {
  const [currentView, setCurrentView] = useState<View>('stylist');
  const [messages, setMessages] = useState<Message[]>([
    { id: '1', role: 'assistant', content: '欢迎回来！我是你的 AI 穿搭顾问 ULook。今天想为哪个场合挑选衣服？', timestamp: Date.now() }
  ]);
  const [wardrobe, setWardrobe] = useState<ClothingItem[]>([]);
  const [savedLooks, setSavedLooks] = useState<SavedLook[]>([]);
  const [generatedImage, setGeneratedImage] = useState<string | null>(null);
  const [isPreviewImage, setIsPreviewImage] = useState(false); // NEW: 标记当前图片是否为预览图
  const [lastPrompt, setLastPrompt] = useState<string>(''); // NEW: 保存最后一次的 prompt 和参数，用于精修
  const [lastImageOptions, setLastImageOptions] = useState<any>(null); // NEW: 保存最后一次的图片生成参数
  const [isChatLoading, setIsChatLoading] = useState(false);
  const [isVisualizerLoading, setIsVisualizerLoading] = useState(false);
  const [draggedItem, setDraggedItem] = useState<ClothingItem | null>(null);
  const [hasKey, setHasKey] = useState<boolean | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  // States for Try-on feature
  const [showTryOnModal, setShowTryOnModal] = useState(false);
  const [selectedForTryOn, setSelectedForTryOn] = useState<ClothingItem[]>([]);
  const [tryOnOccasion, setTryOnOccasion] = useState('');
  
  // State for fidelity control
  const [fidelity, setFidelity] = useState<'low' | 'medium' | 'high'>('medium');
  
  // State for detail crops (key: clothing item id)
  const [detailCrops, setDetailCrops] = useState<Map<string, ClothingDetailCrop>>(new Map());

  useEffect(() => {
    checkApiKey();
    const initData = async () => {
      try {
        const [storedWardrobe, storedLooks] = await Promise.all([
          storage.getAll('wardrobe').catch(() => []),
          storage.getAll('looks').catch(() => [])
        ]);
        setWardrobe(storedWardrobe || []);
        setSavedLooks((storedLooks || []).sort((a, b) => b.timestamp - a.timestamp));
      } catch (err) {
        console.error("Failed to load stored data", err);
        // 降级处理：使用空数组
        setWardrobe([]);
        setSavedLooks([]);
      }
    };
    initData();
  }, []);

  useEffect(() => {
    if (toast) {
      const timer = setTimeout(() => setToast(null), 3000);
      return () => clearTimeout(timer);
    }
  }, [toast]);

  const checkApiKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.hasSelectedApiKey === 'function') {
      // @ts-ignore
      const selected = await window.aistudio.hasSelectedApiKey();
      setHasKey(selected);
    } else {
      setHasKey(!!process.env.API_KEY);
    }
  };

  const handleSelectKey = async () => {
    // @ts-ignore
    if (window.aistudio && typeof window.aistudio.openSelectKey === 'function') {
      // @ts-ignore
      await window.aistudio.openSelectKey();
      setHasKey(true);
    }
  };

  const handleSendMessage = async (text: string) => {
    const userMsg: Message = { id: Date.now().toString(), role: 'user', content: text, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setIsChatLoading(true);

    try {
      const response = await chatWithGemini([...messages, userMsg], SYSTEM_INSTRUCTION);
      const assistantMsg: Message = { id: (Date.now() + 1).toString(), role: 'assistant', content: response || "抱歉，我暂时无法处理该请求。", timestamp: Date.now() };
      setMessages(prev => [...prev, assistantMsg]);
      
      setIsVisualizerLoading(true);
      const clothingDetailCrops = draggedItem && detailCrops.has(draggedItem.id)
        ? [detailCrops.get(draggedItem.id)!]
        : undefined;
      const imageOptions = {
        prompt: text,
        mode: 'preview' as const, // 默认使用 preview 模式
        clothingImages: draggedItem ? [draggedItem.imageUrl] : undefined,
        clothingCategories: draggedItem ? [draggedItem.category] : undefined, // NEW: 传递衣物类别
        clothingDetailCrops,
        fidelity
      };
      // 保存参数用于后续精修
      setLastPrompt(text);
      setLastImageOptions(imageOptions);
      const imageUrl = await generateFashionImage(imageOptions);
      setGeneratedImage(imageUrl);
      setIsPreviewImage(true); // 标记为预览图
    } catch (error: any) {
      let errorText = "请求失败，请检查网络或稍后再试。";
      if (error.status === 429 || error.message?.includes('429')) {
        errorText = "API 额度已用尽 (429)。请等待一分钟或在设置中更换付费 API Key。";
      }
      setMessages(prev => [...prev, { id: Date.now().toString(), role: 'assistant', content: `⚠️ ${errorText}`, timestamp: Date.now() }]);
    } finally {
      setIsChatLoading(false);
      setIsVisualizerLoading(false);
    }
  };

  const handleTryOn = async () => {
    if (selectedForTryOn.length === 0) return;
    
    setIsVisualizerLoading(true);
    const itemDescriptions = selectedForTryOn.map(i => `${i.category}: ${i.name}`).join(', ');
    const prompt = `A professional fashion model wearing these specific items: ${itemDescriptions}. Occasion: ${tryOnOccasion || 'A stylish setting'}. High detail, realistic fashion editorial photography.`;
    
    try {
      const clothingDetailCrops = selectedForTryOn
        .map(item => detailCrops.get(item.id))
        .filter((crop): crop is ClothingDetailCrop => crop !== undefined);
      const imageOptions = {
        prompt,
        mode: 'preview' as const, // 默认使用 preview 模式
        clothingImages: selectedForTryOn.map(i => i.imageUrl),
        clothingCategories: selectedForTryOn.map(i => i.category), // NEW: 传递衣物类别
        clothingDetailCrops: clothingDetailCrops.length > 0 ? clothingDetailCrops : undefined,
        fidelity
      };
      // 保存参数用于后续精修
      setLastPrompt(prompt);
      setLastImageOptions(imageOptions);
      const imageUrl = await generateFashionImage(imageOptions);
      setGeneratedImage(imageUrl);
      setIsPreviewImage(true); // 标记为预览图
      setShowTryOnModal(false);
    } catch (error) {
      console.error("Try-on failed", error);
      setToast("AI generation failed. Please try again.");
    } finally {
      setIsVisualizerLoading(false);
    }
  };

  const saveLook = async () => {
    if (!generatedImage) return;
    
    const newLook: SavedLook = {
      id: Date.now().toString(),
      imageUrl: generatedImage,
      timestamp: Date.now(),
      occasion: tryOnOccasion || 'Fashion Mix',
      itemsUsed: selectedForTryOn.map(i => i.id)
    };

    try {
      await storage.save('looks', newLook);
      setSavedLooks(prev => [newLook, ...prev]);
      setToast("Look saved to your collection!");
    } catch (error) {
      console.error("Failed to save look", error);
      setToast("Storage error: Could not save look.");
    }
  };

  const handleUploadClothing = useCallback(async (item: ClothingItem) => {
    try {
      await storage.save('wardrobe', item);
      setWardrobe(prev => [...prev, item]);
    } catch (err) {
      console.error("Failed to persist clothing item", err);
    }
  }, []);

  const handleRemoveClothing = useCallback(async (id: string) => {
    try {
      await storage.remove('wardrobe', id);
      setWardrobe(prev => prev.filter(i => i.id !== id));
    } catch (err) {
      console.error("Failed to remove clothing item", err);
    }
  }, []);

  // NEW: 处理精修图生成
  const handleRefine = async () => {
    if (!lastImageOptions) {
      setToast("无法精修：缺少生成参数");
      return;
    }

    setIsVisualizerLoading(true);
    try {
      // 使用 refine 模式，复用之前的参数
      const refineOptions = {
        ...lastImageOptions,
        mode: 'refine' as const, // 切换到 refine 模式
      };
      const imageUrl = await generateFashionImage(refineOptions);
      setGeneratedImage(imageUrl);
      setIsPreviewImage(false); // 标记为精修图
      setToast("高清精修图生成完成！");
    } catch (error: any) {
      let errorText = "精修图生成失败，请稍后再试。";
      if (error.status === 429 || error.message?.includes('429')) {
        errorText = "API 额度已用尽 (429)。请等待一分钟或在设置中更换付费 API Key。";
      }
      setToast(errorText);
    } finally {
      setIsVisualizerLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FDFCFD] flex flex-col text-gray-900 overflow-x-hidden">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-24 left-1/2 -translate-x-1/2 z-[200] animate-in slide-in-from-top-4 duration-300">
          <div className="bg-gray-900 text-white px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-gray-800">
            <CheckCircle2 size={18} className="text-pink-400" />
            <span className="text-sm font-bold">{toast}</span>
          </div>
        </div>
      )}

      {/* Navbar */}
      <header className="sticky top-0 z-50 bg-white/70 backdrop-blur-xl border-b border-pink-50 px-6 py-4 flex items-center justify-between shadow-sm">
        <div className="flex items-center gap-8">
          <div className="flex items-center gap-2">
            <div className="bg-pink-500 p-1.5 rounded-xl shadow-lg shadow-pink-200">
               <Sparkles size={20} className="text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight bg-gradient-to-r from-pink-600 to-pink-400 bg-clip-text text-transparent hidden sm:block">ULook</span>
          </div>
          
          <nav className="flex items-center gap-1 bg-gray-50 p-1 rounded-2xl">
            <button 
              onClick={() => setCurrentView('stylist')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                currentView === 'stylist' 
                ? 'bg-white text-pink-600 shadow-sm' 
                : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Sparkles size={16} />
              Stylist
            </button>
            <button 
              onClick={() => setCurrentView('try-on')}
              className={`px-4 py-2 rounded-xl text-sm font-bold transition-all flex items-center gap-2 ${
                currentView === 'try-on' 
                ? 'bg-white text-pink-600 shadow-sm' 
                : 'text-gray-400 hover:text-gray-600'
              }`}
            >
              <Shirt size={16} />
              AI Try On
            </button>
          </nav>
        </div>

        <div className="flex items-center gap-3">
          {!hasKey && (
            <button onClick={handleSelectKey} className="text-[10px] bg-amber-50 text-amber-600 px-2 py-1 rounded-full border border-amber-100 font-medium animate-pulse flex items-center gap-1">
              <Info size={12} /> Key Required
            </button>
          )}
          <button onClick={handleSelectKey} className="p-2 text-gray-400 hover:text-pink-500 hover:bg-pink-50 rounded-full transition-all">
            <Settings size={20} />
          </button>
          <div className="w-9 h-9 rounded-full overflow-hidden border-2 border-pink-100 shadow-inner ring-2 ring-pink-50">
            <img src="https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=100&q=80" alt="Avatar" />
          </div>
        </div>
      </header>

      <main className="flex-1 max-w-7xl mx-auto w-full px-4 sm:px-6 py-8">
        {currentView === 'stylist' ? (
          <div className="space-y-10 animate-in fade-in duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-5 flex flex-col space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <Sparkles size={14} className="text-pink-500" />
                    Fashion Stylist
                  </h2>
                </div>
                <div className="bg-white rounded-2xl border border-gray-100 p-4 space-y-3">
                  <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Fidelity / 保真度</label>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setFidelity('low')}
                      className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs transition-all ${
                        fidelity === 'low'
                          ? 'bg-pink-500 text-white shadow-lg shadow-pink-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Low
                    </button>
                    <button
                      onClick={() => setFidelity('medium')}
                      className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs transition-all ${
                        fidelity === 'medium'
                          ? 'bg-pink-500 text-white shadow-lg shadow-pink-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      Medium
                    </button>
                    <button
                      onClick={() => setFidelity('high')}
                      className={`flex-1 px-3 py-2 rounded-xl font-bold text-xs transition-all ${
                        fidelity === 'high'
                          ? 'bg-pink-500 text-white shadow-lg shadow-pink-200'
                          : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      High
                    </button>
                  </div>
                  <p className="text-[10px] text-gray-500 leading-relaxed">
                    {fidelity === 'high' && 'High: Exact clothing details (logo, pattern, buttons). Recommended when clothing must match exactly.'}
                    {fidelity === 'medium' && 'Medium: Balanced accuracy and aesthetics. Default choice.'}
                    {fidelity === 'low' && 'Low: More creative and stylized. Details may vary.'}
                  </p>
                </div>
                <ChatInterface messages={messages} onSendMessage={handleSendMessage} isLoading={isChatLoading} />
              </div>

              <div className="lg:col-span-7 flex flex-col space-y-4">
                 <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <User size={14} className="text-pink-500" />
                    Look Visualizer
                  </h2>
                  {generatedImage && (
                    <button onClick={saveLook} className="text-xs flex items-center gap-1.5 bg-pink-50 text-pink-600 px-3 py-1.5 rounded-full font-bold hover:bg-pink-100 transition-colors">
                      <Save size={14} /> Save Look
                    </button>
                  )}
                </div>
                <Visualizer 
                  generatedImageUrl={generatedImage} 
                  onRegenerate={() => handleSendMessage("Please regenerate a different look based on our discussion.")} 
                  onRefine={handleRefine}
                  isLoading={isVisualizerLoading}
                  isPreview={isPreviewImage}
                />
              </div>
            </div>

            <section className="space-y-6">
              <div className="flex items-center gap-2 px-2">
                <Sparkles size={18} className="text-pink-500" />
                <h2 className="text-lg font-bold text-gray-800">Trending Styles</h2>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {RECOMMENDATIONS.map(rec => (
                  <button 
                    key={rec.id}
                    onClick={() => handleSendMessage(`Create a look inspired by ${rec.title}: ${rec.subtitle}`)}
                    className="group relative h-48 rounded-2xl overflow-hidden shadow-sm hover:shadow-xl transition-all duration-500 text-left"
                  >
                    <img src={rec.imageUrl} alt={rec.title} className="w-full h-full object-cover group-hover:scale-110 transition-transform duration-700" />
                    <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent flex flex-col justify-end p-4">
                      <p className="text-white font-bold text-sm">{rec.title}</p>
                      <p className="text-white/70 text-[10px]">{rec.subtitle}</p>
                    </div>
                  </button>
                ))}
              </div>
            </section>
          </div>
        ) : (
          <div className="space-y-10 animate-in slide-in-from-right-4 duration-500">
            <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
              <div className="lg:col-span-8">
                <Wardrobe 
                  items={wardrobe} 
                  onUpload={handleUploadClothing} 
                  onRemove={handleRemoveClothing} 
                  onDragItem={setDraggedItem}
                  onStartTryOn={(items) => {
                    setSelectedForTryOn(items);
                    setShowTryOnModal(true);
                  }}
                  onDetailCropChange={(itemId, crop) => {
                    const newCrops = new Map(detailCrops);
                    if (crop) {
                      newCrops.set(itemId, crop);
                    } else {
                      newCrops.delete(itemId);
                    }
                    setDetailCrops(newCrops);
                  }}
                />
              </div>
              
              <div className="lg:col-span-4 space-y-4">
                <div className="flex items-center justify-between px-2">
                  <h2 className="text-sm font-bold uppercase tracking-widest text-gray-400 flex items-center gap-2">
                    <User size={14} className="text-pink-500" />
                    Last Generated Result
                  </h2>
                </div>
                <Visualizer 
                  generatedImageUrl={generatedImage} 
                  onRegenerate={() => setShowTryOnModal(true)} 
                  onRefine={handleRefine}
                  isLoading={isVisualizerLoading}
                  isPreview={isPreviewImage}
                />
                
                {generatedImage && (
                  <button onClick={saveLook} className="w-full bg-white border border-pink-100 text-pink-600 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:bg-pink-50 transition-colors">
                    <Save size={18} /> Save this look to collection
                  </button>
                )}
              </div>
            </div>

            {savedLooks.length > 0 && (
              <section className="space-y-6">
                <div className="flex items-center gap-2 px-2">
                  <ImageIcon size={18} className="text-pink-500" />
                  <h2 className="text-lg font-bold text-gray-800">My Collections</h2>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-6">
                  {savedLooks.map(look => (
                    <div key={look.id} className="group">
                      <div className="aspect-[3/4] rounded-2xl overflow-hidden shadow-sm hover:shadow-lg transition-all border border-gray-100 relative">
                        <img src={look.imageUrl} className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500" alt="Saved look" />
                        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 to-transparent p-3">
                           <p className="text-[10px] font-bold text-white uppercase tracking-wider truncate">{look.occasion}</p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        )}
      </main>

      {showTryOnModal && (
        <div className="fixed inset-0 z-[100] bg-black/40 backdrop-blur-sm flex items-center justify-center p-4 animate-in fade-in duration-300">
          <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl flex flex-col max-h-[90vh] overflow-hidden animate-in zoom-in-95 duration-300">
            <div className="p-8 border-b border-gray-100 flex items-center justify-between">
              <div>
                <h3 className="text-2xl font-black text-gray-900">AI Try-on</h3>
                <p className="text-gray-400 text-sm mt-1">Simulate looks with your wardrobe</p>
              </div>
              <button onClick={() => setShowTryOnModal(false)} className="p-2 hover:bg-gray-100 rounded-full text-gray-400 transition-colors">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-8">
              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Selected Items ({selectedForTryOn.length})</label>
                <div className="flex gap-3 overflow-x-auto py-2">
                  {selectedForTryOn.map(item => (
                    <div key={item.id} className="relative flex-shrink-0 w-20 h-24 rounded-xl overflow-hidden border border-pink-50">
                      <img src={item.imageUrl} className="w-full h-full object-cover" />
                      <div className="absolute bottom-0 left-0 right-0 bg-white/80 p-1 text-[8px] font-bold truncate text-center uppercase text-gray-500">
                        {item.category}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Scenario / Occasion</label>
                <input 
                  type="text" 
                  value={tryOnOccasion}
                  onChange={(e) => setTryOnOccasion(e.target.value)}
                  placeholder="e.g. Walking in Paris, Sunset dinner..."
                  className="w-full px-6 py-4 bg-gray-50 border border-gray-100 rounded-2xl focus:outline-none focus:ring-2 focus:ring-pink-200 transition-all text-gray-900"
                />
              </div>

              <div className="space-y-3">
                <label className="text-xs font-bold uppercase tracking-widest text-gray-400">Fidelity / 保真度</label>
                <div className="flex gap-2">
                  <button
                    onClick={() => setFidelity('low')}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                      fidelity === 'low'
                        ? 'bg-pink-500 text-white shadow-lg shadow-pink-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Low
                  </button>
                  <button
                    onClick={() => setFidelity('medium')}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                      fidelity === 'medium'
                        ? 'bg-pink-500 text-white shadow-lg shadow-pink-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    Medium
                  </button>
                  <button
                    onClick={() => setFidelity('high')}
                    className={`flex-1 px-4 py-3 rounded-xl font-bold text-sm transition-all ${
                      fidelity === 'high'
                        ? 'bg-pink-500 text-white shadow-lg shadow-pink-200'
                        : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                    }`}
                  >
                    High
                  </button>
                </div>
                <p className="text-xs text-gray-500">
                  {fidelity === 'high' && 'High fidelity: Preserves clothing details exactly (logo, pattern, buttons). May be less stylized.'}
                  {fidelity === 'medium' && 'Medium fidelity: Balanced between accuracy and aesthetics.'}
                  {fidelity === 'low' && 'Low fidelity: More creative and stylized. Details may vary.'}
                </p>
              </div>

              <div className="bg-pink-50/50 p-4 rounded-2xl flex gap-3 items-start">
                <Info size={18} className="text-pink-400 shrink-0 mt-0.5" />
                <p className="text-xs text-pink-700 leading-relaxed">
                  Our AI will analyze the textures and colors of your selected items to generate a hyper-realistic fashion look.
                </p>
              </div>
            </div>

            <div className="p-8 bg-gray-50/50 border-t border-gray-100">
              <button 
                onClick={handleTryOn}
                disabled={isVisualizerLoading}
                className="w-full bg-pink-500 hover:bg-pink-600 text-white py-5 rounded-2xl font-black text-lg shadow-xl shadow-pink-100 transition-all flex items-center justify-center gap-3 disabled:opacity-50"
              >
                {isVisualizerLoading ? (
                  <>
                    <div className="w-6 h-6 border-3 border-white/30 border-t-white rounded-full animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Sparkles size={24} />
                    Generate Try-on Look
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      <footer className="py-12 border-t border-gray-100 flex flex-col items-center gap-2 bg-white">
        <div className="flex items-center gap-2 text-gray-400">
           <Sparkles size={16} className="text-pink-300" />
           <span className="text-xs font-medium uppercase tracking-widest">ULook AI Stylist &copy; 2025</span>
        </div>
      </footer>
    </div>
  );
};

export default App;
