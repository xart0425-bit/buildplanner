import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useState, useRef, useEffect } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  Search,
  Sparkles,
  Github,
  Brain,
  FileText,
  History,
  ArrowRight,
  Zap,
  ChevronRight,
  LogIn,
  Settings,
  Loader2,
  LayoutDashboard,
  Crosshair,
  Link2,
  Layers,
  ShieldCheck,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { MatrixRain } from "@/components/MatrixRain";
import { EMPTY_ATTACHMENTS, IdeaComposer } from "@/components/IdeaComposer";
import { isEmptyAttachments, type IdeaAttachments } from "@shared/attachments";
import { useT } from "@/lib/i18n";

type ResearchMode = "keyword" | "teardown";

/** Matches the `keyword` column (varchar(1000)) — the box takes a full description. */
const MAX_IDEA_LENGTH = 1000;

const EXAMPLE_KEYWORDS = [
  "AI video editor",
  "ComfyUI workflow manager",
  "education chatbot",
  "code review assistant",
  "voice cloning app",
  "RAG document search",
  "real-time translation",
  "AI image upscaler",
];

const EXAMPLE_TARGETS = [
  { product: "Notion", url: "https://www.notion.so" },
  { product: "Figma", url: "https://www.figma.com" },
  { product: "Linear", url: "https://linear.app" },
  { product: "Calendly", url: "https://calendly.com" },
  { product: "Miro", url: "https://miro.com" },
];

const SOURCE_ICONS = [
  { label: "GitHub", color: "text-[oklch(0.82_0.01_264)]", bg: "bg-[oklch(0.16_0.01_264)]" },
  { label: "Hugging Face", color: "text-[oklch(0.80_0.16_75)]", bg: "bg-[oklch(0.16_0.01_264)]" },
  { label: "Papers with Code", color: "text-[oklch(0.78_0.14_200)]", bg: "bg-[oklch(0.16_0.01_264)]" },
  { label: "Hacker News", color: "text-[oklch(0.68_0.20_15)]", bg: "bg-[oklch(0.16_0.01_264)]" },
];

export default function Home() {
  const { user, isAuthenticated } = useAuth();
  const t = useT();
  const [mode, setMode] = useState<ResearchMode>("keyword");
  const [keyword, setKeyword] = useState("");
  const [attachments, setAttachments] = useState<IdeaAttachments>(EMPTY_ATTACHMENTS);
  const [targetProduct, setTargetProduct] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [, navigate] = useLocation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [placeholderIdx, setPlaceholderIdx] = useState(0);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const importMutation = trpc.research.import.useMutation({
    onSuccess: (data) => {
      toast.success(t.toasts.imported);
      navigate(`/research/${data.researchId}`);
    },
    onError: (err) => {
      toast.error(t.toasts.importFailed(err.message));
      setIsImporting(false);
    },
  });

  const handleImportClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    const reader = new FileReader();
    reader.onload = async (event) => {
      try {
        const text = event.target?.result;
        if (typeof text !== "string") {
          throw new Error(t.toasts.badFile);
        }
        const json = JSON.parse(text);
        if (!json.research || !json.research.keyword || !json.research.status) {
          throw new Error(t.toasts.badProject);
        }
        await importMutation.mutateAsync(json);
      } catch (err: any) {
        toast.error(t.toasts.importFailed(err.message || t.toasts.unreadable));
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset file input
  };

  const startResearch = trpc.research.start.useMutation({
    onSuccess: (data) => {
      navigate(`/research/${data.researchId}`);
    },
    onError: (err) => {
      toast.error(t.toasts.startFailed(err.message));
      setIsStarting(false);
    },
  });

  const startTeardown = trpc.research.startTeardown.useMutation({
    onSuccess: (data) => {
      navigate(`/research/${data.researchId}`);
    },
    onError: (err) => {
      toast.error(t.toasts.teardownFailed(err.message));
      setIsStarting(false);
    },
  });

  useEffect(() => {
    const interval = setInterval(() => {
      setPlaceholderIdx((i) => (i + 1) % EXAMPLE_KEYWORDS.length);
    }, 2500);
    return () => clearInterval(interval);
  }, []);

  const submitResearch = () => {
    if (isStarting) return;

    const primary = mode === "keyword" ? keyword : targetProduct;
    if (!primary.trim()) {
      inputRef.current?.focus();
      return;
    }
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
      return;
    }

    setIsStarting(true);
    if (mode === "keyword") {
      startResearch.mutate({
        keyword: keyword.trim(),
        // `.md` docs steer the plan, images steer the interface design.
        ...(isEmptyAttachments(attachments) ? {} : { attachments }),
      });
    } else {
      startTeardown.mutate({
        product: targetProduct.trim(),
        url: targetUrl.trim() || undefined,
      });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    submitResearch();
  };

  const handleExampleClick = (kw: string) => {
    setKeyword(kw);
    inputRef.current?.focus();
  };

  const handleTargetExampleClick = (target: (typeof EXAMPLE_TARGETS)[number]) => {
    setTargetProduct(target.product);
    setTargetUrl(target.url);
    inputRef.current?.focus();
  };

  const canSubmit = mode === "keyword" ? !!keyword.trim() : !!targetProduct.trim();

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[oklch(0.72_0.18_264/0.06)] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-[oklch(0.78_0.14_200/0.04)] rounded-full blur-[100px]" />
        <div className="absolute top-1/3 left-0 w-[400px] h-[300px] bg-[oklch(0.74_0.16_155/0.03)] rounded-full blur-[80px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.72 0.18 264) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.18 264) 1px, transparent 1px)`,
            backgroundSize: "60px 60px",
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-border/50">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-2.5 flex-shrink-0">
            <div className="w-8 h-8 rounded-lg bg-[oklch(0.72_0.18_264/0.15)] border border-[oklch(0.72_0.18_264/0.3)] flex items-center justify-center flex-shrink-0">
              <Sparkles className="w-4 h-4 text-[oklch(0.82_0.18_264)]" />
            </div>
            <span className="font-semibold text-foreground tracking-tight hidden sm:inline">BuildPlanner</span>
          </div>
          {/* Labels collapse to icons before they can be squeezed — never wrap or clip. */}
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              onClick={() => setIsSettingsOpen(true)}
              title={t.nav.settings}
              aria-label={t.nav.settings}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span className="hidden lg:inline whitespace-nowrap">{t.nav.settings}</span>
            </button>
            {isAuthenticated ? (
              <>
                <button
                  onClick={handleImportClick}
                  disabled={isImporting}
                  title={t.nav.import}
                  aria-label={t.nav.import}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
                >
                  {isImporting ? (
                    <Loader2 className="w-4 h-4 animate-spin text-[oklch(0.72_0.18_264)] flex-shrink-0" />
                  ) : (
                    <FileText className="w-4 h-4 flex-shrink-0" />
                  )}
                  <span className="hidden lg:inline whitespace-nowrap">{t.nav.import}</span>
                </button>
                <button
                  onClick={() => navigate("/dashboard")}
                  title={t.nav.dashboard}
                  aria-label={t.nav.dashboard}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
                >
                  <LayoutDashboard className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:inline whitespace-nowrap">{t.nav.dashboard}</span>
                </button>
                <button
                  onClick={() => navigate("/history")}
                  title={t.nav.history}
                  aria-label={t.nav.history}
                  className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
                >
                  <History className="w-4 h-4 flex-shrink-0" />
                  <span className="hidden lg:inline whitespace-nowrap">{t.nav.history}</span>
                </button>
                <div
                  className="flex items-center gap-2 px-2 py-1.5 rounded-md bg-accent/50 border border-border/50 flex-shrink-0"
                  title={user?.name ?? undefined}
                >
                  <div className="w-6 h-6 rounded-full bg-[oklch(0.72_0.18_264/0.2)] flex items-center justify-center text-xs font-medium text-[oklch(0.82_0.18_264)] flex-shrink-0">
                    {user?.name?.[0]?.toUpperCase() ?? "U"}
                  </div>
                  <span className="text-sm text-muted-foreground hidden xl:inline whitespace-nowrap max-w-[140px] truncate">
                    {user?.name}
                  </span>
                </div>
              </>
            ) : (
              <a
                href={getLoginUrl()}
                title={t.nav.login}
                aria-label={t.nav.login}
                className="flex items-center gap-1.5 text-sm px-3 sm:px-4 py-2 rounded-lg bg-[oklch(0.72_0.18_264/0.12)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.25)] text-[oklch(0.82_0.18_264)] transition-all flex-shrink-0"
              >
                <LogIn className="w-4 h-4 flex-shrink-0" />
                <span className="hidden lg:inline whitespace-nowrap">{t.nav.login}</span>
              </a>
            )}
          </div>
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 container pt-24 pb-16">
        <div className="max-w-3xl mx-auto text-center">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full glass border border-[oklch(0.72_0.18_264/0.2)] text-xs text-[oklch(0.72_0.18_264)] mb-8 animate-fade-in">
            <Zap className="w-3 h-3" />
            <span>
              {mode === "keyword" ? t.home.badgeKeyword : t.home.badgeTeardown}
            </span>
          </div>

          {/* Headline — digital rain streams behind the title, which glows from the back */}
          <div className="relative isolate flex items-center justify-center h-[200px] sm:h-[260px] -mt-2 mb-2 -mx-6 sm:-mx-20 lg:-mx-40">
            <MatrixRain />
            <div
              className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[60%] h-[38%] rounded-full bg-[oklch(0.78_0.10_264/0.28)] blur-[80px] pointer-events-none"
              aria-hidden="true"
            />
            <h1 className="relative text-5xl sm:text-7xl lg:text-[5.5rem] font-bold tracking-tight hero-glow-text animate-fade-in-up">
              {mode === "keyword" ? t.home.heroKeyword : t.home.heroTeardown}
            </h1>
          </div>

          <p className="text-lg text-muted-foreground mb-8 leading-relaxed animate-fade-in-up delay-100">
            {mode === "keyword" ? (
              <>
                {t.home.subtitleKeyword1}
                <br className="hidden sm:block" />
                {t.home.subtitleKeyword2}
              </>
            ) : (
              <>
                {t.home.subtitleTeardown1}{" "}
                <strong className="text-foreground font-semibold">{t.home.subtitleTeardownStrong1}</strong>
                {t.home.subtitleTeardown2}
                <br className="hidden sm:block" />
                {t.home.subtitleTeardown3}{" "}
                <strong className="text-foreground font-semibold">{t.home.subtitleTeardownStrong2}</strong>
                {t.home.subtitleTeardown4}
              </>
            )}
          </p>

          {/* Mode switch */}
          <div className="inline-flex gap-1 p-1 rounded-2xl glass border border-border/50 mb-8 animate-fade-in-up delay-100">
            {([
              { key: "keyword" as ResearchMode, label: t.home.modeKeyword, icon: <Search className="w-3.5 h-3.5" /> },
              { key: "teardown" as ResearchMode, label: t.home.modeTeardown, icon: <Crosshair className="w-3.5 h-3.5" /> },
            ]).map((m) => (
              <button
                key={m.key}
                type="button"
                onClick={() => setMode(m.key)}
                disabled={isStarting}
                className={`flex items-center gap-1.5 px-5 py-2.5 rounded-xl text-sm font-medium transition-all duration-200 disabled:opacity-50 ${
                  mode === m.key
                    ? "bg-[oklch(0.72_0.18_264/0.15)] text-[oklch(0.82_0.18_264)] border border-[oklch(0.72_0.18_264/0.35)]"
                    : "text-muted-foreground hover:text-foreground border border-transparent"
                }`}
              >
                {m.icon}
                {m.label}
              </button>
            ))}
          </div>

          {/* Search form */}
          <form onSubmit={handleSubmit} className="animate-fade-in-up delay-200">
            <div className="relative group">
              {mode !== "keyword" && (
                <div className="absolute inset-0 rounded-2xl bg-[oklch(0.72_0.18_264/0.08)] blur-xl group-focus-within:bg-[oklch(0.72_0.18_264/0.15)] transition-all duration-500" />
              )}

              {mode === "keyword" ? (
                <IdeaComposer
                  value={keyword}
                  onChange={setKeyword}
                  attachments={attachments}
                  onAttachmentsChange={setAttachments}
                  onSubmit={submitResearch}
                  isSubmitting={isStarting}
                  placeholder={`${EXAMPLE_KEYWORDS[placeholderIdx]}\n\n${t.composer.placeholderSuffix}`}
                  maxLength={MAX_IDEA_LENGTH}
                />
              ) : (
                <div className="relative glass rounded-2xl p-3 border border-[oklch(0.28_0.01_264)] group-focus-within:border-[oklch(0.72_0.18_264/0.5)] transition-all duration-300 space-y-2">
                  <div className="flex items-center gap-3 px-3 py-1 rounded-xl bg-[oklch(0.16_0.01_264)] border border-border/40">
                    <Crosshair className="w-5 h-5 text-[oklch(0.72_0.18_264)] flex-shrink-0" />
                    <input
                      ref={inputRef}
                      type="text"
                      value={targetProduct}
                      onChange={(e) => setTargetProduct(e.target.value)}
                      placeholder={t.home.productPlaceholder}
                      className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 text-base outline-none py-3 min-w-0 font-mono"
                      disabled={isStarting}
                      maxLength={200}
                    />
                  </div>

                  <div className="flex items-center gap-3 px-3 py-1 rounded-xl bg-[oklch(0.16_0.01_264)] border border-border/40">
                    <Link2 className="w-5 h-5 text-muted-foreground flex-shrink-0" />
                    <input
                      type="text"
                      value={targetUrl}
                      onChange={(e) => setTargetUrl(e.target.value)}
                      placeholder={t.home.urlPlaceholder}
                      className="flex-1 bg-transparent text-foreground placeholder:text-muted-foreground/50 text-sm outline-none py-3 min-w-0 font-mono"
                      disabled={isStarting}
                      maxLength={500}
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={isStarting || !canSubmit}
                    className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-[oklch(0.72_0.18_264)] hover:bg-[oklch(0.78_0.18_264)] disabled:opacity-40 disabled:cursor-not-allowed text-[oklch(0.09_0.005_264)] font-semibold text-sm transition-all duration-200"
                  >
                    {isStarting ? (
                      <>
                        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        <span>{t.home.startingTeardown}</span>
                      </>
                    ) : (
                      <>
                        <Crosshair className="w-4 h-4" />
                        <span>{t.home.startTeardown}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </div>
          </form>

          {/* Examples */}
          <div className="mt-6 flex flex-wrap justify-center gap-2 animate-fade-in-up delay-300">
            <span className="text-xs text-muted-foreground/60 self-center">{t.home.examples}</span>
            {mode === "keyword"
              ? EXAMPLE_KEYWORDS.slice(0, 5).map((kw) => (
                  <button
                    key={kw}
                    onClick={() => handleExampleClick(kw)}
                    className="text-xs px-3 py-1.5 rounded-full bg-accent/50 hover:bg-accent border border-border/50 hover:border-border text-muted-foreground hover:text-foreground transition-all duration-200"
                  >
                    {kw}
                  </button>
                ))
              : EXAMPLE_TARGETS.map((t) => (
                  <button
                    key={t.product}
                    onClick={() => handleTargetExampleClick(t)}
                    className="text-xs px-3 py-1.5 rounded-full bg-accent/50 hover:bg-accent border border-border/50 hover:border-border text-muted-foreground hover:text-foreground transition-all duration-200"
                  >
                    {t.product}
                  </button>
                ))}
          </div>

          {/* Teardown ground rules — surfaced up front, not buried in the report */}
          {mode === "teardown" && (
            <div className="mt-8 max-w-2xl mx-auto glass rounded-2xl p-5 border border-border/30 text-left animate-fade-in">
              <div className="flex items-start gap-3">
                <ShieldCheck className="w-5 h-5 text-[oklch(0.74_0.16_155)] flex-shrink-0 mt-0.5" />
                <div className="text-xs text-muted-foreground leading-relaxed space-y-1.5">
                  <p className="text-foreground font-semibold text-sm">{t.home.teardownRulesTitle}</p>
                  <p>
                    {t.home.teardownRules1}{" "}
                    <strong className="text-foreground">{t.home.teardownRulesStrong1}</strong>{" "}
                    {t.home.teardownRules1End}
                  </p>
                  <p>
                    {t.home.teardownRules2}{" "}
                    <strong className="text-foreground">{t.home.teardownRulesStrong2}</strong>{" "}
                    {t.home.teardownRules2End}
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Source badges */}
        <div className="max-w-2xl mx-auto mt-20 animate-fade-in-up delay-400">
          <p className="text-center text-xs text-muted-foreground/50 mb-4 uppercase tracking-widest">{t.home.sourcesLabel}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {SOURCE_ICONS.map((src) => (
              <div
                key={src.label}
                className="glass rounded-xl p-4 flex flex-col items-center gap-2 border border-border/30 hover:border-border/60 transition-all duration-200"
              >
                <div className={`text-xs font-semibold ${src.color}`}>{src.label}</div>
                <div className="w-1.5 h-1.5 rounded-full bg-current opacity-60" />
              </div>
            ))}
          </div>
        </div>

        {/* Features */}
        <div className="max-w-4xl mx-auto mt-24 animate-fade-in-up delay-500">
          <div className="grid sm:grid-cols-3 gap-4">
            {(mode === "keyword"
              ? [
                  {
                    icon: <Search className="w-5 h-5" />,
                    title: t.home.featureCollectTitle,
                    desc: t.home.featureCollectDesc,
                    color: "text-[oklch(0.72_0.18_264)]",
                    bg: "bg-[oklch(0.72_0.18_264/0.08)]",
                  },
                  {
                    icon: <Brain className="w-5 h-5" />,
                    title: t.home.featureAnalyseTitle,
                    desc: t.home.featureAnalyseDesc,
                    color: "text-[oklch(0.78_0.14_200)]",
                    bg: "bg-[oklch(0.78_0.14_200/0.08)]",
                  },
                  {
                    icon: <FileText className="w-5 h-5" />,
                    title: t.home.featurePlanTitle,
                    desc: t.home.featurePlanDesc,
                    color: "text-[oklch(0.74_0.16_155)]",
                    bg: "bg-[oklch(0.74_0.16_155/0.08)]",
                  },
                ]
              : [
                  {
                    icon: <Layers className="w-5 h-5" />,
                    title: t.home.featurePrinciplesTitle,
                    desc: t.home.featurePrinciplesDesc,
                    color: "text-[oklch(0.72_0.18_264)]",
                    bg: "bg-[oklch(0.72_0.18_264/0.08)]",
                  },
                  {
                    icon: <Crosshair className="w-5 h-5" />,
                    title: t.home.featureGapsTitle,
                    desc: t.home.featureGapsDesc,
                    color: "text-[oklch(0.68_0.20_15)]",
                    bg: "bg-[oklch(0.68_0.20_15/0.08)]",
                  },
                  {
                    icon: <Sparkles className="w-5 h-5" />,
                    title: t.home.featureLeapTitle,
                    desc: t.home.featureLeapDesc,
                    color: "text-[oklch(0.74_0.16_155)]",
                    bg: "bg-[oklch(0.74_0.16_155/0.08)]",
                  },
                ]
            ).map((f) => (
              <div
                key={f.title}
                className="glass rounded-2xl p-6 border border-border/30 hover:border-border/60 transition-all duration-300 group"
              >
                <div className={`w-10 h-10 rounded-xl ${f.bg} flex items-center justify-center ${f.color} mb-4 group-hover:scale-110 transition-transform duration-300`}>
                  {f.icon}
                </div>
                <h3 className="font-semibold text-foreground mb-2">{f.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>

        {/* CTA for history */}
        {isAuthenticated && (
          <div className="max-w-lg mx-auto mt-12 text-center animate-fade-in-up">
            <button
              onClick={() => navigate("/history")}
              className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors group"
            >
              <History className="w-4 h-4" />
              {t.home.historyCta}
              <ChevronRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
            </button>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-border/30 py-6 mt-8">
        <div className="container flex items-center justify-between text-xs text-muted-foreground/40">
          <span>{t.home.footerTagline}</span>
          <div className="flex items-center gap-1">
            <Github className="w-3 h-3" />
            <span>GitHub · HF · Papers · HN</span>
          </div>
        </div>
      </footer>
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileChange}
        accept=".json"
        style={{ display: "none" }}
      />
    </div>
  );
}
