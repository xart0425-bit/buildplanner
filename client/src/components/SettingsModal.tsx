import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Eye, EyeOff, KeyRound, Settings } from "lucide-react";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);

  useEffect(() => {
    if (open) {
      setGeminiKey(localStorage.getItem("buildplanner-gemini-key") || "");
      setOpenaiKey(localStorage.getItem("buildplanner-openai-key") || "");
      setCustomModel(localStorage.getItem("buildplanner-custom-model") || "");
    }
  }, [open]);

  const handleSave = () => {
    localStorage.setItem("buildplanner-gemini-key", geminiKey.trim());
    localStorage.setItem("buildplanner-openai-key", openaiKey.trim());
    localStorage.setItem("buildplanner-custom-model", customModel.trim());
    toast.success("설정이 안전하게 저장되었습니다.");
    onOpenChange(false);
  };

  const handleClear = () => {
    setGeminiKey("");
    setOpenaiKey("");
    setCustomModel("");
    localStorage.removeItem("buildplanner-gemini-key");
    localStorage.removeItem("buildplanner-openai-key");
    localStorage.removeItem("buildplanner-custom-model");
    toast.success("설정이 초기화되었습니다.");
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px] bg-background/95 border-border/80 backdrop-blur-2xl rounded-2xl shadow-2xl p-6 gap-6">
        <DialogHeader>
          <div className="flex items-center gap-2 mb-1">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.72_0.18_264/0.15)] border border-[oklch(0.72_0.18_264/0.3)] flex items-center justify-center">
              <Settings className="w-4 h-4 text-[oklch(0.82_0.18_264)]" />
            </div>
            <DialogTitle className="text-xl font-bold tracking-tight text-foreground">
              API 키 설정
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            리서치와 분석 단계에서 활용할 API 키를 입력하세요. 입력된 API 키는 브라우저의 안전한 로컬 저장소(LocalStorage)에만 보관됩니다.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Gemini API Key */}
          <div className="space-y-2">
            <Label htmlFor="gemini-key" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[oklch(0.82_0.18_264)]" />
              Google Gemini API Key
            </Label>
            <div className="relative">
              <Input
                id="gemini-key"
                type={showGemini ? "text" : "password"}
                placeholder="AI Studio에서 발급받은 API 키를 입력하세요"
                value={geminiKey}
                onChange={(e) => setGeminiKey(e.target.value)}
                className="bg-accent/40 border-border/50 focus:border-[oklch(0.72_0.18_264/0.5)] pr-10 rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowGemini(!showGemini)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showGemini ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* OpenAI API Key */}
          <div className="space-y-2">
            <Label htmlFor="openai-key" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[oklch(0.78_0.14_200)]" />
              OpenAI API Key
            </Label>
            <div className="relative">
              <Input
                id="openai-key"
                type={showOpenai ? "text" : "password"}
                placeholder="OpenAI Platform에서 발급받은 API 키를 입력하세요"
                value={openaiKey}
                onChange={(e) => setOpenaiKey(e.target.value)}
                className="bg-accent/40 border-border/50 focus:border-[oklch(0.78_0.14_200/0.5)] pr-10 rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowOpenai(!showOpenai)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showOpenai ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Custom Model */}
          <div className="space-y-2">
            <Label htmlFor="custom-model" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
              모델 명 설정 (선택 사항)
            </Label>
            <Input
              id="custom-model"
              type="text"
              placeholder="예: gemini-2.5-flash, gpt-4o-mini"
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              className="bg-accent/40 border-border/50 rounded-xl font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground/80">
              비워둘 경우 API 키 유형에 맞춰 기본 모델(Gemini: <code className="font-mono bg-accent px-1 rounded">gemini-2.5-flash</code>, OpenAI: <code className="font-mono bg-accent px-1 rounded">gpt-4o-mini</code>)로 자동 지정됩니다.
            </p>
          </div>
        </div>

        <DialogFooter className="flex flex-row gap-2 sm:justify-end border-t border-border/20 pt-4 mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl text-xs flex-1 sm:flex-initial"
          >
            초기화
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-[oklch(0.72_0.18_264)] hover:bg-[oklch(0.78_0.18_264)] text-[oklch(0.09_0.005_264)] font-semibold rounded-xl flex-1 sm:flex-initial"
          >
            저장하기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
