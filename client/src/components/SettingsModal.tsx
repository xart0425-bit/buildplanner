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
import { Eye, EyeOff, Globe, KeyRound, Settings } from "lucide-react";
import {
  ANALYSIS_LANGUAGES,
  DEFAULT_ANALYSIS_LANGUAGE,
  normalizeLanguage,
  type AnalysisLanguage,
} from "@shared/languages";
import { getLanguage, setLanguage as persistLanguage, useT } from "@/lib/i18n";

interface SettingsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function SettingsModal({ open, onOpenChange }: SettingsModalProps) {
  const t = useT();
  const [geminiKey, setGeminiKey] = useState("");
  const [openaiKey, setOpenaiKey] = useState("");
  const [anthropicKey, setAnthropicKey] = useState("");
  const [customModel, setCustomModel] = useState("");
  const [language, setLanguage] = useState<AnalysisLanguage>(DEFAULT_ANALYSIS_LANGUAGE);
  const [showGemini, setShowGemini] = useState(false);
  const [showOpenai, setShowOpenai] = useState(false);
  const [showAnthropic, setShowAnthropic] = useState(false);

  useEffect(() => {
    if (open) {
      setGeminiKey(localStorage.getItem("buildplanner-gemini-key") || "");
      setOpenaiKey(localStorage.getItem("buildplanner-openai-key") || "");
      setAnthropicKey(localStorage.getItem("buildplanner-anthropic-key") || "");
      setCustomModel(localStorage.getItem("buildplanner-custom-model") || "");
      setLanguage(getLanguage());
    }
  }, [open]);

  const handleSave = () => {
    localStorage.setItem("buildplanner-gemini-key", geminiKey.trim());
    localStorage.setItem("buildplanner-openai-key", openaiKey.trim());
    localStorage.setItem("buildplanner-anthropic-key", anthropicKey.trim());
    localStorage.setItem("buildplanner-custom-model", customModel.trim());
    // Goes through the store so every open screen re-renders in the new language.
    persistLanguage(language);
    toast.success(t.settings.saved);
    onOpenChange(false);
  };

  const handleClear = () => {
    setGeminiKey("");
    setOpenaiKey("");
    setAnthropicKey("");
    setCustomModel("");
    setLanguage(DEFAULT_ANALYSIS_LANGUAGE);
    localStorage.removeItem("buildplanner-gemini-key");
    localStorage.removeItem("buildplanner-openai-key");
    localStorage.removeItem("buildplanner-anthropic-key");
    localStorage.removeItem("buildplanner-custom-model");
    persistLanguage(DEFAULT_ANALYSIS_LANGUAGE);
    toast.success(t.settings.cleared);
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
              {t.settings.title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-muted-foreground text-sm leading-relaxed">
            {t.settings.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          {/* Gemini API Key */}
          <div className="space-y-2">
            <Label htmlFor="gemini-key" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[oklch(0.82_0.18_264)]" />
              {t.settings.geminiLabel}
            </Label>
            <div className="relative">
              <Input
                id="gemini-key"
                type={showGemini ? "text" : "password"}
                placeholder={t.settings.geminiPlaceholder}
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
              {t.settings.openaiLabel}
            </Label>
            <div className="relative">
              <Input
                id="openai-key"
                type={showOpenai ? "text" : "password"}
                placeholder={t.settings.openaiPlaceholder}
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

          {/* Anthropic API Key */}
          <div className="space-y-2">
            <Label htmlFor="anthropic-key" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
              <KeyRound className="w-3.5 h-3.5 text-[oklch(0.80_0.16_75)]" />
              {t.settings.anthropicLabel}
            </Label>
            <div className="relative">
              <Input
                id="anthropic-key"
                type={showAnthropic ? "text" : "password"}
                placeholder={t.settings.anthropicPlaceholder}
                value={anthropicKey}
                onChange={(e) => setAnthropicKey(e.target.value)}
                className="bg-accent/40 border-border/50 focus:border-[oklch(0.80_0.16_75/0.5)] pr-10 rounded-xl"
              />
              <button
                type="button"
                onClick={() => setShowAnthropic(!showAnthropic)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
              >
                {showAnthropic ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Analysis language */}
          <div className="space-y-2">
            <Label htmlFor="analysis-language" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider flex items-center gap-1.5">
              <Globe className="w-3.5 h-3.5 text-[oklch(0.74_0.16_155)]" />
              {t.settings.languageLabel}
            </Label>
            <select
              id="analysis-language"
              value={language}
              onChange={(e) => setLanguage(normalizeLanguage(e.target.value))}
              className="w-full bg-accent/40 border border-border/50 focus:border-[oklch(0.74_0.16_155/0.5)] rounded-xl px-3 py-2 text-sm text-foreground outline-none transition-colors cursor-pointer"
            >
              {ANALYSIS_LANGUAGES.map((option) => (
                <option key={option.code} value={option.code}>
                  {option.native === option.english
                    ? option.native
                    : `${option.native} (${option.english})`}
                </option>
              ))}
            </select>
            <p className="text-[10px] text-muted-foreground/80">
              {t.settings.languageHelp}
            </p>
          </div>

          {/* Custom Model */}
          <div className="space-y-2">
            <Label htmlFor="custom-model" className="text-xs font-semibold text-foreground/80 uppercase tracking-wider">
              {t.settings.modelLabel}
            </Label>
            <Input
              id="custom-model"
              type="text"
              placeholder={t.settings.modelPlaceholder}
              value={customModel}
              onChange={(e) => setCustomModel(e.target.value)}
              className="bg-accent/40 border-border/50 rounded-xl font-mono text-xs"
            />
            <p className="text-[10px] text-muted-foreground/80">{t.settings.modelHelp}</p>
          </div>
        </div>

        <DialogFooter className="flex flex-row gap-2 sm:justify-end border-t border-border/20 pt-4 mt-2">
          <Button
            type="button"
            variant="ghost"
            onClick={handleClear}
            className="text-destructive hover:text-destructive hover:bg-destructive/10 rounded-xl text-xs flex-1 sm:flex-initial"
          >
            {t.settings.reset}
          </Button>
          <Button
            type="button"
            onClick={handleSave}
            className="bg-[oklch(0.72_0.18_264)] hover:bg-[oklch(0.78_0.18_264)] text-[oklch(0.09_0.005_264)] font-semibold rounded-xl flex-1 sm:flex-initial"
          >
            {t.settings.save}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
