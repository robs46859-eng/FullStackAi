import { useState } from "react";
import { Sidebar } from "@/components/Sidebar";
import { CodeViewer } from "@/components/CodeViewer";
import { PromptInput } from "@/components/PromptInput";
import { useGenerateApi } from "@/hooks/use-generate";

export default function Home() {
  const { generate, isGenerating, streamedCode, savedFilename, error } = useGenerateApi();
  const [selectedPrompt, setSelectedPrompt] = useState<string>("");

  const handleSelectHistoryPrompt = (prompt: string) => {
    setSelectedPrompt(prompt);
  };

  const handleGenerate = (prompt: string) => {
    // Clear selected prompt after submission so the user can type something new later without it resetting
    setSelectedPrompt(prompt); 
    generate(prompt);
  };

  return (
    <div className="flex h-screen w-full bg-background overflow-hidden text-foreground">
      <Sidebar onSelectPrompt={handleSelectHistoryPrompt} />
      
      <main className="flex-1 flex flex-col min-w-0 relative">
        {/* Subtle background texture */}
        <div className="absolute inset-0 pointer-events-none bg-[radial-gradient(ellipse_80%_80%_at_50%_-20%,rgba(120,119,198,0.1),rgba(255,255,255,0))]" />
        
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
