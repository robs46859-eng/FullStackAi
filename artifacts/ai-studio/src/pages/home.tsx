import { useState, useEffect } from "react";
import { Sidebar } from "@/components/Sidebar";
import { CodeViewer } from "@/components/CodeViewer";
import { PromptInput } from "@/components/PromptInput";
import { useGenerateApi } from "@/hooks/use-generate";

export default function Home() {
  const { generate, isGenerating, streamedCode, savedFilename, error } = useGenerateApi();
  const [selectedPrompt, setSelectedPrompt] = useState<string>("");

  useEffect(() => {
    const cursor = document.getElementById('fs-cursor');
    const ring = document.getElementById('fs-cursor-ring');
    if (!cursor || !ring) return;

    let mx = 0, my = 0, rx = 0, ry = 0;

    const onMouseMove = (e: MouseEvent) => {
      mx = e.clientX; 
      my = e.clientY;
      cursor.style.left = mx + 'px';
      cursor.style.top = my + 'px';
    };

    document.addEventListener('mousemove', onMouseMove);

    let frameId: number;
    const animRing = () => {
      rx += (mx - rx) * 0.12;
      ry += (my - ry) * 0.12;
      ring.style.left = rx + 'px';
      ring.style.top = ry + 'px';
      frameId = requestAnimationFrame(animRing);
    };
    frameId = requestAnimationFrame(animRing);

    return () => {
      document.removeEventListener('mousemove', onMouseMove);
      cancelAnimationFrame(frameId);
    };
  }, []);

  const handleSelectHistoryPrompt = (prompt: string) => {
    setSelectedPrompt(prompt);
  };

  const handleGenerate = (prompt: string) => {
    // Clear selected prompt after submission so the user can type something new later without it resetting
    setSelectedPrompt(prompt); 
    generate(prompt);
  };

  return (
    <div className="flex flex-1 w-full bg-surface overflow-hidden text-on-surface min-h-0 relative">
      {/* Custom Cursor elements expected by index.css */}
      <div id="fs-cursor" />
      <div id="fs-cursor-ring" />

      <Sidebar onSelectPrompt={handleSelectHistoryPrompt} />
      
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Subtle background texture — Dark Studio style */}
        <div className="absolute inset-0 pointer-events-none opacity-20" style={{
          backgroundImage: `radial-gradient(ellipse 80% 80% at 50% -20%, rgba(232, 197, 71, 0.05), transparent)`
        }} />
        
        {/* Main Workspace Area */}
        <div className="flex-1 flex flex-col pb-0 relative z-10">
          <CodeViewer 
            code={streamedCode} 
            isGenerating={isGenerating} 
            savedFilename={savedFilename} 
          />
        </div>

        {/* Input Area */}
        <PromptInput 
          onSubmit={handleGenerate}
          isGenerating={isGenerating}
          error={error}
          initialValue={selectedPrompt}
        />
      </main>
    </div>
  );
}
