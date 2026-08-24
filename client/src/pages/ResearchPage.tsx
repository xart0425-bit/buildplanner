import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect, useState, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { Streamdown } from "streamdown";
import { toast } from "sonner";
import {
  ArrowLeft,
  Github,
  Star,
  GitFork,
  Download,
  Heart,
  MessageSquare,
  TrendingUp,
  FileText,
  Brain,
  CheckCircle,
  AlertCircle,
  Loader2,
  ExternalLink,
  Copy,
  Sparkles,
  BookOpen,
  Code2,
  ChevronRight,
  Settings,
  Layers,
  Crosshair,
  Rocket,
  ShieldCheck,
  Globe,
  Package,
  Save,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { DevKitDialog } from "@/components/DevKitDialog";
import { useLocale, useT } from "@/lib/i18n";

type TabType =
  | "github"
  | "huggingface"
  | "papers"
  | "hackernews"
  | "analysis"
  | "plan"
  // teardown mode only
  | "principles"
  | "faultlines"
  | "leapfrog"
  | "intel";

// Mirrors TeardownResult in server/teardown.ts — the payload arrives as untyped JSON.
interface TeardownPrinciple {
  name: string;
  mechanism: string;
  whyItWorks: string;
  evidence: string;
}

interface FaultLine {
  category: string;
  title: string;
  evidence: string;
  severity: "낮음" | "중간" | "높음";
  opportunity: string;
}

interface LeapfrogFeature {
  name: string;
  description: string;
  addressesFaultLine: string;
  originalApproach: string;
  newApproach: string;
}

interface TeardownData {
  target: { product: string; url: string | null; category: string; oneLine: string };
  techKeyword: string;
  principles: TeardownPrinciple[];
  faultLines: FaultLine[];
  leapfrog: {
    conceptName: string;
    positioning: string;
    thesis: string;
    features: LeapfrogFeature[];
    architectureShift: string;
    moat: string;
  };
  divergence: {
    score: number;
    verdict: string;
    overlaps: Array<{ item: string; risk: string; fix: string }>;
    legalNotes: string[];
  };
  regenerated: boolean;
}

interface SourceMeta {
  stars?: number;
  forks?: number;
  language?: string;
  license?: string;
  topics?: string[];
  updatedAt?: string;
  type?: string;
  downloads?: number;
  likes?: number;
  pipeline_tag?: string;
  hasCode?: boolean;
  repository?: string;
  published?: string;
  authors?: string[];
  points?: number;
  comments?: number;
  author?: string;
  createdAt?: string;
  hnUrl?: string;
}

interface Source {
  id: number;
  sourceType: "github" | "huggingface" | "papers" | "hackernews" | "web" | "review";
  title: string;
  url: string;
  description: string | null;
  score: number | null;
  metadata: unknown;
}

const STATUS_STEPS = [
  { key: "pending", label: "대기 중", icon: <Loader2 className="w-4 h-4" /> },
  { key: "collecting", label: "소스 수집 중", icon: <TrendingUp className="w-4 h-4" /> },
  { key: "analyzing", label: "AI 분석 중", icon: <Brain className="w-4 h-4" /> },
  { key: "done", label: "완료", icon: <CheckCircle className="w-4 h-4" /> },
];

const TAB_CONFIG = [
  { key: "github" as TabType, label: "GitHub", color: "text-[oklch(0.82_0.01_264)]", activeColor: "bg-[oklch(0.82_0.01_264/0.1)] border-[oklch(0.82_0.01_264/0.3)]" },
  { key: "huggingface" as TabType, label: "Hugging Face", color: "text-[oklch(0.80_0.16_75)]", activeColor: "bg-[oklch(0.80_0.16_75/0.1)] border-[oklch(0.80_0.16_75/0.3)]" },
  { key: "papers" as TabType, label: "Papers", color: "text-[oklch(0.78_0.14_200)]", activeColor: "bg-[oklch(0.78_0.14_200/0.1)] border-[oklch(0.78_0.14_200/0.3)]" },
  { key: "hackernews" as TabType, label: "Hacker News", color: "text-[oklch(0.68_0.20_15)]", activeColor: "bg-[oklch(0.68_0.20_15/0.1)] border-[oklch(0.68_0.20_15/0.3)]" },
  { key: "analysis" as TabType, label: "AI 분석", color: "text-[oklch(0.72_0.18_264)]", activeColor: "bg-[oklch(0.72_0.18_264/0.1)] border-[oklch(0.72_0.18_264/0.3)]" },
  { key: "plan" as TabType, label: "계획서", color: "text-[oklch(0.74_0.16_155)]", activeColor: "bg-[oklch(0.74_0.16_155/0.1)] border-[oklch(0.74_0.16_155/0.3)]" },
];

// Prepended in teardown mode — the chain's output is the point of the report, so it leads.
const TEARDOWN_TAB_CONFIG = [
  { key: "principles" as TabType, label: "① 원리", color: "text-[oklch(0.72_0.18_264)]", activeColor: "bg-[oklch(0.72_0.18_264/0.1)] border-[oklch(0.72_0.18_264/0.3)]" },
  { key: "faultlines" as TabType, label: "② 균열", color: "text-[oklch(0.68_0.20_15)]", activeColor: "bg-[oklch(0.68_0.20_15/0.1)] border-[oklch(0.68_0.20_15/0.3)]" },
  { key: "leapfrog" as TabType, label: "③ 도약", color: "text-[oklch(0.74_0.16_155)]", activeColor: "bg-[oklch(0.74_0.16_155/0.1)] border-[oklch(0.74_0.16_155/0.3)]" },
  { key: "intel" as TabType, label: "원본 자료", color: "text-[oklch(0.80_0.16_75)]", activeColor: "bg-[oklch(0.80_0.16_75/0.1)] border-[oklch(0.80_0.16_75/0.3)]" },
];

const SEVERITY_STYLE: Record<string, string> = {
  높음: "text-[oklch(0.68_0.20_15)] bg-[oklch(0.68_0.20_15/0.1)] border-[oklch(0.68_0.20_15/0.3)]",
  중간: "text-[oklch(0.80_0.16_75)] bg-[oklch(0.80_0.16_75/0.1)] border-[oklch(0.80_0.16_75/0.3)]",
  낮음: "text-[oklch(0.74_0.16_155)] bg-[oklch(0.74_0.16_155/0.1)] border-[oklch(0.74_0.16_155/0.3)]",
};

export default function ResearchPage() {
  const { id } = useParams<{ id: string }>();
  const researchId = parseInt(id ?? "0", 10);
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [activeTab, setActiveTab] = useState<TabType>("github");
  const [isPolling, setIsPolling] = useState(true);
  const [planView, setPlanView] = useState<"preview" | "raw">("preview");
  const t = useT();
  const locale = useLocale();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isDevKitOpen, setIsDevKitOpen] = useState(false);
  const utils = trpc.useUtils();
  const [instruction, setInstruction] = useState("");

  const modifyPlanMutation = trpc.research.modifyPlan.useMutation({
    onSuccess: () => {
      toast.success("수정 사항을 반영 중입니다. 잠시만 기다려주세요.");
      setInstruction("");
      setIsPolling(true);
    },
    onError: (err) => {
      toast.error(`오류가 발생했습니다: ${err.message}`);
    },
  });

  const [isTogglingCron, setIsTogglingCron] = useState(false);

  const toggleCronMutation = trpc.research.toggleCronSchedule.useMutation({
    onSuccess: (data) => {
      toast.success(`모니터링 주기가 ${
        data.interval === "none" ? "비활성화(수동)"
        : data.interval === "daily" ? "매일 자동 갱신"
        : "매주 자동 갱신"
      }(으)로 설정되었습니다.`);
      utils.research.getStatus.invalidate({ researchId });
    },
    onError: (err) => {
      toast.error(`스케줄 설정 실패: ${err.message}`);
    },
    onSettled: () => {
      setIsTogglingCron(false);
    }
  });

  const handleToggleCron = (interval: "none" | "daily" | "weekly") => {
    setIsTogglingCron(true);
    toggleCronMutation.mutate({ researchId, interval });
  };

  const reRunMutation = trpc.research.reRun.useMutation({
    onSuccess: () => {
      toast.success("R&D 소스 수집기 및 분석 파이프라인이 가동되었습니다!");
      setIsPolling(true);
      utils.research.getStatus.invalidate({ researchId });
    },
    onError: (err) => {
      toast.error(`리서치 재실행 오류: ${err.message}`);
    }
  });

  const handleReRun = () => {
    reRunMutation.mutate({ researchId });
  };

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [isAuthenticated]);

  const { data: research, refetch: refetchStatus } = trpc.research.getStatus.useQuery(
    { researchId },
    { enabled: !!researchId && isAuthenticated, refetchInterval: isPolling ? 2000 : false }
  );

  const { data: sources } = trpc.research.getSources.useQuery(
    { researchId },
    { enabled: !!researchId && isAuthenticated && (research?.status === "done" || research?.status === "analyzing") }
  );

  const { data: plan } = trpc.research.getPlan.useQuery(
    { researchId },
    { enabled: !!researchId && isAuthenticated && research?.status === "done" }
  );

  useEffect(() => {
    if (research?.status === "done" || research?.status === "error") {
      setIsPolling(false);
    }
  }, [research?.status]);

  // Jump to the landing tab exactly once per completion, never on later tab clicks —
  // keeping activeTab in the deps would snap the user back the moment they navigate.
  const didLandOnResultTab = useRef(false);
  useEffect(() => {
    if (research?.status !== "done") return;
    utils.research.getPlan.invalidate({ researchId });
    if (didLandOnResultTab.current) return;
    didLandOnResultTab.current = true;
    setActiveTab(research.mode === "teardown" ? "principles" : "github");
  }, [research?.status, research?.mode, researchId, utils]);

  const handleDownload = useCallback(() => {
    if (!plan?.markdownContent) return;
    const blob = new Blob([plan.markdownContent], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buildplanner-${research?.keyword?.replace(/\s+/g, "-")}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.research.downloadedMd);
  }, [plan?.markdownContent, research?.keyword]);

  const handleExportProject = useCallback(() => {
    if (!research || !sources) return;
    const projectData = {
      version: "1.0",
      research: {
        keyword: research.keyword,
        mode: research.mode,
        targetProduct: research.targetProduct,
        targetUrl: research.targetUrl,
        status: research.status,
        errorMessage: research.errorMessage,
      },
      sources: sources.map((s) => ({
        sourceType: s.sourceType,
        title: s.title,
        url: s.url,
        description: s.description,
        score: s.score,
        metadata: s.metadata,
      })),
      plan: plan ? {
        analysisJson: plan.analysisJson,
        teardownJson: plan.teardownJson,
        markdownContent: plan.markdownContent,
      } : null,
    };
    const blob = new Blob([JSON.stringify(projectData, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `buildplanner-${research.keyword.replace(/\s+/g, "-")}-project.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(t.research.savedProject);
  }, [research, sources, plan]);

  const handleCopyMarkdown = useCallback(() => {
    if (!plan?.markdownContent) return;
    navigator.clipboard.writeText(plan.markdownContent);
    toast.success(t.research.copiedMd);
  }, [plan?.markdownContent]);

  const githubSources = (sources ?? []).filter((s) => s.sourceType === "github");
  const hfSources = (sources ?? []).filter((s) => s.sourceType === "huggingface");
  const paperSources = (sources ?? []).filter((s) => s.sourceType === "papers");
  const hnSources = (sources ?? []).filter((s) => s.sourceType === "hackernews");
  const webSources = (sources ?? []).filter((s) => s.sourceType === "web");
  const reviewSources = (sources ?? []).filter((s) => s.sourceType === "review");
  const analysis = plan?.analysisJson as Record<string, unknown> | null | undefined;

  const isTeardown = research?.mode === "teardown";
  const teardown = (plan?.teardownJson ?? null) as TeardownData | null;
  const visibleTabs = isTeardown ? [...TEARDOWN_TAB_CONFIG, ...TAB_CONFIG] : TAB_CONFIG;

  const tabCount = (key: TabType): number | null => {
    switch (key) {
      case "github": return githubSources.length;
      case "huggingface": return hfSources.length;
      case "papers": return paperSources.length;
      case "hackernews": return hnSources.length;
      case "intel": return webSources.length + reviewSources.length;
      case "principles": return teardown?.principles.length ?? null;
      case "faultlines": return teardown?.faultLines.length ?? null;
      case "leapfrog": return teardown?.leapfrog.features.length ?? null;
      default: return null;
    }
  };

  const currentStep = STATUS_STEPS.findIndex((s) => s.key === research?.status);

  const renderScore = (score: number | null) => {
    const s = score ?? 0;
    const cls = s >= 0.7 ? "score-high" : s >= 0.4 ? "score-mid" : "score-low";
    return (
      <span className={`text-xs font-mono font-medium ${cls}`}>
        {(s * 100).toFixed(0)}
      </span>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[oklch(0.72_0.18_264/0.04)] rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 glass">
        <div className="container flex items-center gap-4 h-14">
          <button
            onClick={() => navigate("/")}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ArrowLeft className="w-4 h-4 flex-shrink-0" />
            <span className="hidden md:inline">{t.nav.home}</span>
          </button>
          <div className="w-px h-4 bg-border" />
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2">
              {isTeardown ? (
                <Crosshair className="w-4 h-4 text-[oklch(0.72_0.18_264)] flex-shrink-0" />
              ) : (
                <Sparkles className="w-4 h-4 text-[oklch(0.72_0.18_264)] flex-shrink-0" />
              )}
              <span className="font-medium text-foreground truncate">
                {isTeardown && teardown?.leapfrog.conceptName
                  ? teardown.leapfrog.conceptName
                  : research?.keyword ?? t.research.loading}
              </span>
              {isTeardown && (
                <span className="text-xs px-2 py-0.5 rounded-full border flex-shrink-0 text-[oklch(0.72_0.18_264)] bg-[oklch(0.72_0.18_264/0.1)] border-[oklch(0.72_0.18_264/0.3)] whitespace-nowrap">
                  {t.research.teardownBadge} · {research?.targetProduct ?? research?.keyword}
                </span>
              )}
              {research?.status && (
                <span className={`text-xs px-2 py-0.5 rounded-full border flex-shrink-0 ${
                  research.status === "done"
                    ? "text-[oklch(0.74_0.16_155)] bg-[oklch(0.74_0.16_155/0.1)] border-[oklch(0.74_0.16_155/0.3)]"
                    : research.status === "error"
                    ? "text-[oklch(0.68_0.20_15)] bg-[oklch(0.68_0.20_15/0.1)] border-[oklch(0.68_0.20_15/0.3)]"
                    : "text-[oklch(0.72_0.18_264)] bg-[oklch(0.72_0.18_264/0.1)] border-[oklch(0.72_0.18_264/0.3)]"
                }`}>
                  {research.status === "done" ? t.research.done : research.status === "error" ? t.research.error : t.research.running}
                </span>
              )}
              {research?.refreshInterval && research.refreshInterval !== "none" && (
                <span className="text-xs px-2 py-0.5 rounded-full border flex-shrink-0 text-[oklch(0.72_0.18_264)] bg-[oklch(0.72_0.18_264/0.1)] border-[oklch(0.72_0.18_264/0.35)] font-medium">
                  {research.refreshInterval === "daily" ? t.research.autoDaily : t.research.autoWeekly}
                </span>
              )}
            </div>
          </div>
          {research?.status === "done" && (
            <button
              onClick={handleReRun}
              disabled={reRunMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg bg-[oklch(0.72_0.18_264/0.12)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.2)] text-[oklch(0.82_0.18_264)] transition-all mr-2 disabled:opacity-50"
              title={t.research.rerun}
            >
              {reRunMutation.isPending ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Sparkles className="w-3.5 h-3.5" />
              )}
              <span>{t.research.rerun}</span>
            </button>
          )}
          {research?.status === "done" && (
            <div className="flex items-center gap-1.5 mr-2">
              <select
                value={research.refreshInterval ?? "none"}
                onChange={(e) => handleToggleCron(e.target.value as "none" | "daily" | "weekly")}
                disabled={isTogglingCron}
                className="bg-[oklch(0.16_0.01_264)] text-foreground text-xs rounded-lg border border-border/30 px-2.5 py-1.5 outline-none focus:border-[oklch(0.72_0.18_264/0.5)] transition-all cursor-pointer"
              >
                <option value="none">{t.research.refreshManual}</option>
                <option value="daily">{t.research.refreshDaily}</option>
                <option value="weekly">{t.research.refreshWeekly}</option>
              </select>
            </div>
          )}
          {research?.status === "done" && (
            <button
              onClick={() => setIsDevKitOpen(true)}
              title={t.research.devKit}
              aria-label={t.research.devKit}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[oklch(0.74_0.16_155/0.14)] hover:bg-[oklch(0.74_0.16_155/0.24)] border border-[oklch(0.74_0.16_155/0.35)] text-[oklch(0.74_0.16_155)] transition-all mr-2 flex-shrink-0"
            >
              <Package className="w-4 h-4 flex-shrink-0" />
              <span className="hidden xl:inline whitespace-nowrap">{t.research.devKit}</span>
            </button>
          )}
          {research?.status === "done" && plan?.markdownContent && (
            <button
              onClick={handleDownload}
              title={t.research.downloadMd}
              aria-label={t.research.downloadMd}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[oklch(0.74_0.16_155/0.1)] hover:bg-[oklch(0.74_0.16_155/0.2)] border border-[oklch(0.74_0.16_155/0.3)] text-[oklch(0.74_0.16_155)] transition-all mr-2 flex-shrink-0"
            >
              <Download className="w-4 h-4 flex-shrink-0" />
              <span className="hidden xl:inline whitespace-nowrap">{t.research.downloadMd}</span>
            </button>
          )}
          {research?.status === "done" && (
            <button
              onClick={handleExportProject}
              title={t.research.saveProject}
              aria-label={t.research.saveProject}
              className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[oklch(0.72_0.18_264/0.12)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.25)] text-[oklch(0.82_0.18_264)] transition-all mr-2 flex-shrink-0"
            >
              <Save className="w-4 h-4 flex-shrink-0" />
              <span className="hidden xl:inline whitespace-nowrap">{t.research.saveProject}</span>
            </button>
          )}
          <button
            onClick={() => setIsSettingsOpen(true)}
            title={t.nav.settings}
            aria-label={t.nav.settings}
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-3 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="hidden xl:inline whitespace-nowrap">{t.nav.settings}</span>
          </button>
        </div>
      </header>

      <div className="container py-6 relative z-10">
        {/* Progress indicator */}
        {research?.status !== "done" && research?.status !== "error" && (
          <div className="mb-8 glass rounded-2xl p-6 border border-border/30 animate-fade-in">
            <div className="flex items-center justify-between mb-4">
              <h2 className="font-semibold text-foreground">{t.research.inProgress}</h2>
              <div className="flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="w-4 h-4 animate-spin text-[oklch(0.72_0.18_264)]" />
                <span>{t.research.autoUpdates}</span>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {STATUS_STEPS.map((step, idx) => (
                <div key={step.key} className="flex items-center gap-2 flex-1">
                  <div className={`flex items-center gap-2 flex-1 ${idx <= currentStep ? "opacity-100" : "opacity-30"}`}>
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${
                      idx < currentStep
                        ? "bg-[oklch(0.74_0.16_155/0.2)] text-[oklch(0.74_0.16_155)]"
                        : idx === currentStep
                        ? "bg-[oklch(0.72_0.18_264/0.2)] text-[oklch(0.72_0.18_264)] animate-pulse-glow"
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {idx < currentStep ? <CheckCircle className="w-4 h-4" /> : step.icon}
                    </div>
                    <span className="text-sm font-medium text-foreground hidden sm:block">{step.label}</span>
                  </div>
                  {idx < STATUS_STEPS.length - 1 && (
                    <div className={`h-px flex-1 mx-2 transition-all ${idx < currentStep ? "bg-[oklch(0.74_0.16_155/0.5)]" : "bg-border"}`} />
                  )}
                </div>
              ))}
            </div>
            {/* Indeterminate progress bar */}
            <div className="mt-4 h-1 bg-muted rounded-full overflow-hidden">
              <div className="h-full w-1/3 bg-[oklch(0.72_0.18_264)] rounded-full animate-progress-indeterminate" />
            </div>
          </div>
        )}

        {/* Error state */}
        {research?.status === "error" && (
          <div className="mb-8 glass rounded-2xl p-6 border border-[oklch(0.68_0.20_15/0.3)] animate-fade-in">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-[oklch(0.68_0.20_15)] flex-shrink-0 mt-0.5" />
              <div>
                <h3 className="font-semibold text-foreground mb-1">리서치 중 오류가 발생했습니다</h3>
                <p className="text-sm text-muted-foreground">{research.errorMessage ?? "알 수 없는 오류"}</p>
              </div>
            </div>
          </div>
        )}

        {/* Last refreshed status */}
        {research?.status === "done" && research.lastRefreshedAt && (
          <div className="mb-4 text-xs text-muted-foreground/80 flex items-center gap-1.5 animate-fade-in">
            <span>🔄 🤖 AI 에이전트 마지막 모니터링:</span>
            <span className="font-semibold text-foreground font-mono">
              {new Date(research.lastRefreshedAt).toLocaleString(locale)}
            </span>
          </div>
        )}

        {/* Stats bar (when done) */}
        {research?.status === "done" && sources && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6 animate-fade-in">
            {(isTeardown
              ? [
                  { label: "추출된 원리", count: teardown?.principles.length ?? 0, color: "text-[oklch(0.72_0.18_264)]" },
                  { label: "발견된 균열", count: teardown?.faultLines.length ?? 0, color: "text-[oklch(0.68_0.20_15)]" },
                  { label: "도약 기능", count: teardown?.leapfrog.features.length ?? 0, color: "text-[oklch(0.74_0.16_155)]" },
                  { label: "차별화 점수", count: teardown?.divergence.score ?? 0, color: "text-[oklch(0.78_0.14_200)]" },
                ]
              : [
                  { label: "GitHub", count: githubSources.length, color: "text-[oklch(0.82_0.01_264)]" },
                  { label: "Hugging Face", count: hfSources.length, color: "text-[oklch(0.80_0.16_75)]" },
                  { label: "Papers", count: paperSources.length, color: "text-[oklch(0.78_0.14_200)]" },
                  { label: "Hacker News", count: hnSources.length, color: "text-[oklch(0.68_0.20_15)]" },
                ]
            ).map((stat) => (
              <div key={stat.label} className="glass rounded-xl p-4 border border-border/30">
                <div className={`text-2xl font-bold font-mono ${stat.color}`}>{stat.count}</div>
                <div className="text-xs text-muted-foreground mt-1">{stat.label}</div>
              </div>
            ))}
          </div>
        )}

        {/* Tabs */}
        {(research?.status === "done" || research?.status === "analyzing") && (
          <div className="mb-6 animate-fade-in">
            <div className="flex gap-1.5 flex-wrap">
              {visibleTabs.map((tab) => {
                const count = tabCount(tab.key);
                const isActive = activeTab === tab.key;
                return (
                  <button
                    key={tab.key}
                    onClick={() => setActiveTab(tab.key)}
                    className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium border transition-all duration-200 ${
                      isActive
                        ? `${tab.activeColor} ${tab.color}`
                        : "border-border/30 text-muted-foreground hover:text-foreground hover:border-border/60 bg-transparent"
                    }`}
                  >
                    {tab.label}
                    {count !== null && count > 0 && (
                      <span className={`text-xs px-1.5 py-0.5 rounded-full ${isActive ? "bg-current/10" : "bg-muted"}`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Tab content */}
        <div className="animate-fade-in">
          {/* Teardown ① — operating principles */}
          {activeTab === "principles" && (
            <div className="space-y-4 animate-fade-in">
              {!teardown ? (
                <TeardownPending label="원본의 작동 원리를 추출하는 중입니다..." />
              ) : (
                <>
                  <div className="glass rounded-2xl p-6 border border-[oklch(0.72_0.18_264/0.2)]">
                    <div className="flex items-start gap-3">
                      <Layers className="w-5 h-5 text-[oklch(0.72_0.18_264)] flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-foreground mb-1">
                          {teardown.target.product}
                          <span className="ml-2 text-xs font-normal px-2 py-0.5 rounded-full bg-accent text-muted-foreground">
                            {teardown.target.category}
                          </span>
                        </h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">{teardown.target.oneLine}</p>
                        <p className="text-xs text-muted-foreground/70 mt-2">
                          기능 목록이 아니라, 이 제품이 <strong className="text-foreground">왜 작동하는지</strong>에 대한 메커니즘 분해입니다.
                        </p>
                      </div>
                    </div>
                  </div>

                  {teardown.principles.length === 0 ? (
                    <EmptyState message="작동 원리를 추출하지 못했습니다. 공식 URL을 입력하면 정확도가 올라갑니다." />
                  ) : (
                    teardown.principles.map((p, i) => (
                      <div key={i} className="glass rounded-2xl p-6 border border-border/30">
                        <h4 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                          <span className="w-6 h-6 rounded-lg bg-[oklch(0.72_0.18_264/0.12)] text-[oklch(0.82_0.18_264)] text-xs font-mono flex items-center justify-center flex-shrink-0">
                            {i + 1}
                          </span>
                          {p.name}
                        </h4>
                        <div className="space-y-3 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">메커니즘</div>
                            <p className="text-muted-foreground leading-relaxed">{p.mechanism}</p>
                          </div>
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">작동 이유</div>
                            <p className="text-muted-foreground leading-relaxed">{p.whyItWorks}</p>
                          </div>
                          {p.evidence && (
                            <div className="pt-2 border-t border-border/30">
                              <div className="text-xs text-muted-foreground/60">근거: {p.evidence}</div>
                            </div>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}

          {/* Teardown ② — fault lines */}
          {activeTab === "faultlines" && (
            <div className="space-y-4 animate-fade-in">
              {!teardown ? (
                <TeardownPending label="원본의 균열을 분석하는 중입니다..." />
              ) : (
                <>
                  <div className="glass rounded-2xl p-6 border border-[oklch(0.68_0.20_15/0.2)]">
                    <div className="flex items-start gap-3">
                      <Crosshair className="w-5 h-5 text-[oklch(0.68_0.20_15)] flex-shrink-0 mt-0.5" />
                      <div>
                        <h3 className="font-semibold text-foreground mb-1">균열 분석</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed">
                          원본을 이기는 방법은 더 잘 만드는 것이 아니라, 원본이 피할 수 없었던 제약을 없애는 것입니다.
                          아래는 원본 설계자가 감수한 타협들입니다.
                        </p>
                      </div>
                    </div>
                  </div>

                  {teardown.faultLines.length === 0 ? (
                    <EmptyState message="근거 있는 균열을 발견하지 못했습니다." />
                  ) : (
                    teardown.faultLines.map((f, i) => (
                      <div key={i} className="glass rounded-2xl p-6 border border-border/30">
                        <div className="flex items-start justify-between gap-3 mb-3">
                          <h4 className="font-semibold text-foreground">{f.title}</h4>
                          <div className="flex gap-1.5 flex-shrink-0">
                            <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground whitespace-nowrap">
                              {f.category}
                            </span>
                            <span
                              className={`text-xs px-2 py-1 rounded-full border whitespace-nowrap ${
                                SEVERITY_STYLE[f.severity] ?? SEVERITY_STYLE["중간"]
                              }`}
                            >
                              {f.severity}
                            </span>
                          </div>
                        </div>
                        <div className="space-y-3 text-sm">
                          <div>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">근거</div>
                            <p className="text-muted-foreground leading-relaxed">{f.evidence}</p>
                          </div>
                          <div className="p-3 rounded-xl bg-[oklch(0.74_0.16_155/0.06)] border border-[oklch(0.74_0.16_155/0.15)]">
                            <div className="text-xs text-[oklch(0.74_0.16_155)] uppercase tracking-wider mb-1">기회</div>
                            <p className="text-muted-foreground leading-relaxed">{f.opportunity}</p>
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>
          )}

          {/* Teardown ③ — leapfrog design + divergence audit */}
          {activeTab === "leapfrog" && (
            <div className="space-y-4 animate-fade-in">
              {!teardown ? (
                <TeardownPending label="상위 개념 제품을 설계하는 중입니다..." />
              ) : (
                <>
                  <div className="glass rounded-2xl p-6 border border-[oklch(0.74_0.16_155/0.25)]">
                    <div className="flex items-start gap-3">
                      <Rocket className="w-5 h-5 text-[oklch(0.74_0.16_155)] flex-shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <h3 className="text-xl font-bold text-foreground mb-1">{teardown.leapfrog.conceptName}</h3>
                        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                          {teardown.leapfrog.positioning}
                        </p>
                        {teardown.leapfrog.thesis && (
                          <div className="p-3 rounded-xl bg-accent/40 border border-border/30">
                            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">왜 지금 가능한가</div>
                            <p className="text-sm text-muted-foreground leading-relaxed">{teardown.leapfrog.thesis}</p>
                          </div>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Divergence audit */}
                  <div className="glass rounded-2xl p-6 border border-border/30">
                    <div className="flex items-center justify-between gap-4 mb-4">
                      <h4 className="font-semibold text-foreground flex items-center gap-2">
                        <ShieldCheck className="w-4 h-4 text-[oklch(0.78_0.14_200)]" />
                        차별화 감사
                      </h4>
                      <div className="flex items-center gap-3">
                        {teardown.regenerated && (
                          <span className="text-xs px-2 py-1 rounded-full bg-accent text-muted-foreground">
                            재설계 1회
                          </span>
                        )}
                        <span
                          className={`text-sm font-bold font-mono px-3 py-1 rounded-full border ${
                            teardown.divergence.score >= 80
                              ? SEVERITY_STYLE["낮음"]
                              : teardown.divergence.score >= 60
                                ? SEVERITY_STYLE["중간"]
                                : SEVERITY_STYLE["높음"]
                          }`}
                        >
                          {teardown.divergence.score}/100
                        </span>
                      </div>
                    </div>

                    <div className="w-full h-2 rounded-full bg-accent overflow-hidden mb-4">
                      <div
                        className={`h-full rounded-full transition-all duration-700 ${
                          teardown.divergence.score >= 80
                            ? "bg-[oklch(0.74_0.16_155)]"
                            : teardown.divergence.score >= 60
                              ? "bg-[oklch(0.80_0.16_75)]"
                              : "bg-[oklch(0.68_0.20_15)]"
                        }`}
                        style={{ width: `${Math.max(0, Math.min(100, teardown.divergence.score))}%` }}
                      />
                    </div>

                    <p className="text-sm text-muted-foreground mb-4">
                      {teardown.divergence.score >= 80
                        ? "✅ 원본과 독립적인 설계로 판정되었습니다."
                        : teardown.divergence.score >= 60
                          ? "🟡 독립성은 확보했으나 아래 항목은 개발 전 재검토를 권합니다."
                          : "🔴 원본 의존도가 높습니다. 아래 항목을 수정한 뒤 착수하세요."}
                    </p>

                    {teardown.divergence.overlaps.length > 0 && (
                      <div className="space-y-2 mb-4">
                        {teardown.divergence.overlaps.map((o, i) => (
                          <div
                            key={i}
                            className="p-3 rounded-xl bg-[oklch(0.68_0.20_15/0.06)] border border-[oklch(0.68_0.20_15/0.15)]"
                          >
                            <div className="text-sm font-medium text-foreground mb-1">⚠️ {o.item}</div>
                            <div className="text-xs text-muted-foreground">위험: {o.risk}</div>
                            <div className="text-xs text-muted-foreground mt-0.5">수정 방향: {o.fix}</div>
                          </div>
                        ))}
                      </div>
                    )}

                    {teardown.divergence.legalNotes.length > 0 && (
                      <div className="pt-3 border-t border-border/30">
                        <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">법적 확인 사항</div>
                        <ul className="space-y-1">
                          {teardown.divergence.legalNotes.map((n, i) => (
                            <li key={i} className="text-xs text-muted-foreground flex items-start gap-1.5">
                              <ChevronRight className="w-3 h-3 flex-shrink-0 mt-0.5" />
                              {n}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                    <p className="text-xs text-muted-foreground/60 mt-4 pt-3 border-t border-border/30">
                      ⚖️ 공개 정보 기반 분석이며 법률 자문이 아닙니다. 제품화 전 전문가 검토를 권장합니다.
                    </p>
                  </div>

                  {/* Architecture shift */}
                  {teardown.leapfrog.architectureShift && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h4 className="font-semibold text-foreground mb-2">구조적 전환</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">
                        {teardown.leapfrog.architectureShift}
                      </p>
                    </div>
                  )}

                  {/* Features — each traced back to the fault line it removes */}
                  {teardown.leapfrog.features.map((f, i) => (
                    <div key={i} className="glass rounded-2xl p-6 border border-border/30">
                      <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                        <span className="w-6 h-6 rounded-lg bg-[oklch(0.74_0.16_155/0.12)] text-[oklch(0.74_0.16_155)] text-xs font-mono flex items-center justify-center flex-shrink-0">
                          {i + 1}
                        </span>
                        {f.name}
                      </h4>
                      <p className="text-sm text-muted-foreground leading-relaxed mb-4 pl-8">{f.description}</p>

                      {f.addressesFaultLine && (
                        <div className="pl-8 mb-3">
                          <span className="text-xs px-2 py-1 rounded-full bg-[oklch(0.68_0.20_15/0.08)] text-[oklch(0.68_0.20_15)] border border-[oklch(0.68_0.20_15/0.2)]">
                            해소하는 균열: {f.addressesFaultLine}
                          </span>
                        </div>
                      )}

                      <div className="pl-8 grid sm:grid-cols-2 gap-3">
                        <div className="p-3 rounded-xl bg-accent/30 border border-border/30">
                          <div className="text-xs text-muted-foreground uppercase tracking-wider mb-1">원본의 방식</div>
                          <p className="text-xs text-muted-foreground/80 leading-relaxed">{f.originalApproach}</p>
                        </div>
                        <div className="p-3 rounded-xl bg-[oklch(0.74_0.16_155/0.06)] border border-[oklch(0.74_0.16_155/0.2)]">
                          <div className="text-xs text-[oklch(0.74_0.16_155)] uppercase tracking-wider mb-1">우리의 방식</div>
                          <p className="text-xs text-foreground leading-relaxed">{f.newApproach}</p>
                        </div>
                      </div>
                    </div>
                  ))}

                  {teardown.leapfrog.moat && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h4 className="font-semibold text-foreground mb-2">방어 가능성</h4>
                      <p className="text-sm text-muted-foreground leading-relaxed">{teardown.leapfrog.moat}</p>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Teardown — raw evidence the analysis was built from */}
          {activeTab === "intel" && (
            <div className="space-y-4 animate-fade-in">
              {webSources.length === 0 && reviewSources.length === 0 ? (
                <EmptyState message="원본 자료를 수집하지 못했습니다. 공식 URL을 입력하면 공개 페이지를 분석합니다." />
              ) : (
                <>
                  {webSources.length > 0 && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h4 className="font-semibold text-foreground mb-4 flex items-center gap-2">
                        <Globe className="w-4 h-4 text-[oklch(0.80_0.16_75)]" />
                        공식 페이지 ({webSources.length})
                      </h4>
                      <div className="space-y-3">
                        {webSources.map((s) => {
                          const meta = (s.metadata ?? {}) as { pageLabel?: string; chars?: number };
                          return (
                            <details key={s.id} className="group">
                              <summary className="flex items-center gap-2 cursor-pointer text-sm text-foreground hover:text-[oklch(0.80_0.16_75)] transition-colors list-none">
                                <ChevronRight className="w-4 h-4 flex-shrink-0 group-open:rotate-90 transition-transform" />
                                <span className="text-xs px-2 py-0.5 rounded-full bg-accent text-muted-foreground flex-shrink-0">
                                  {meta.pageLabel ?? "페이지"}
                                </span>
                                <span className="truncate">{s.title}</span>
                                <span className="text-xs text-muted-foreground/50 flex-shrink-0 ml-auto">
                                  {meta.chars ?? 0}자
                                </span>
                              </summary>
                              <div className="mt-2 ml-6 p-3 rounded-xl bg-accent/30 border border-border/30">
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="text-xs text-[oklch(0.72_0.18_264)] hover:underline flex items-center gap-1 mb-2"
                                >
                                  {s.url}
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                                <pre className="text-xs text-muted-foreground whitespace-pre-wrap font-sans leading-relaxed max-h-64 overflow-y-auto">
                                  {s.description}
                                </pre>
                              </div>
                            </details>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {reviewSources.length > 0 && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h4 className="font-semibold text-foreground mb-1 flex items-center gap-2">
                        <MessageSquare className="w-4 h-4 text-[oklch(0.68_0.20_15)]" />
                        사용자 실제 발언 ({reviewSources.length})
                      </h4>
                      <p className="text-xs text-muted-foreground/70 mb-4">
                        균열 분석의 근거가 된 Hacker News 댓글입니다.
                      </p>
                      <div className="space-y-3">
                        {reviewSources.map((s) => {
                          const meta = (s.metadata ?? {}) as { author?: string; storyTitle?: string };
                          return (
                            <div key={s.id} className="p-3 rounded-xl bg-accent/30 border border-border/30">
                              <div className="flex items-center gap-2 mb-2 text-xs text-muted-foreground/70">
                                <span className="font-mono">{meta.author ?? "unknown"}</span>
                                {meta.storyTitle && <span className="truncate">· {meta.storyTitle}</span>}
                                <a
                                  href={s.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-auto flex-shrink-0 hover:text-foreground"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                </a>
                              </div>
                              <p className="text-xs text-muted-foreground leading-relaxed">{s.description}</p>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* GitHub */}
          {activeTab === "github" && (
            <div className="grid gap-3">
              {githubSources.length === 0 ? (
                <div className="glass rounded-2xl p-8 border border-border/30 text-center flex flex-col items-center justify-center min-h-[320px] w-full my-2">
                  <Github className="w-12 h-12 text-muted-foreground/35 mb-4" />
                  <h3 className="font-semibold text-foreground mb-1.5">글로벌 R&D 정보 수집 전입니다</h3>
                  <p className="text-xs text-muted-foreground max-w-md mb-6 leading-relaxed">
                    AI가 기획서 뼈대는 설계하였으나, 실제 GitHub 코드 저장소, Hugging Face AI 모델, Papers 학술 논문 정보를 인터넷에서 실시간 수집 및 비교 분석하기 전 단계입니다.
                  </p>
                  <button
                    onClick={handleReRun}
                    disabled={reRunMutation.isPending}
                    className="flex items-center gap-2 px-6 py-3 rounded-xl bg-[oklch(0.72_0.18_264)] hover:bg-[oklch(0.78_0.18_264)] text-[oklch(0.09_0.005_264)] font-semibold text-sm transition-all duration-200 shadow-lg shadow-[oklch(0.72_0.18_264/0.15)] disabled:opacity-50 cursor-pointer"
                  >
                    {reRunMutation.isPending ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        <span>수집기 파이프라인 가동 중...</span>
                      </>
                    ) : (
                      <>
                        <Sparkles className="w-4 h-4" />
                        <span>실시간 오픈소스/논문 수집 & R&D 계획 완성</span>
                      </>
                    )}
                  </button>
                </div>
              ) : (
                githubSources.map((s, i) => {
                  const meta = (s.metadata ?? {}) as SourceMeta;
                  return (
                    <SourceCard
                      key={s.id}
                      delay={i * 50}
                      title={s.title}
                      url={s.url}
                      description={s.description}
                      score={s.score}
                      renderScore={renderScore}
                      badge={{ label: meta.language ?? "Code", color: "text-[oklch(0.82_0.01_264)] bg-[oklch(0.82_0.01_264/0.08)]" }}
                    >
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1"><Star className="w-3 h-3" />{(meta.stars ?? 0).toLocaleString()}</span>
                        <span className="flex items-center gap-1"><GitFork className="w-3 h-3" />{(meta.forks ?? 0).toLocaleString()}</span>
                        {meta.license && <span className="px-2 py-0.5 rounded-full bg-muted text-muted-foreground">{meta.license}</span>}
                        {meta.updatedAt && <span>업데이트: {new Date(meta.updatedAt).toLocaleDateString("ko-KR")}</span>}
                      </div>
                      {Array.isArray(meta.topics) && meta.topics.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 mt-2">
                          {(meta.topics as string[]).slice(0, 5).map((t: string) => (
                            <span key={t} className="text-xs px-2 py-0.5 rounded-full bg-[oklch(0.72_0.18_264/0.08)] text-[oklch(0.72_0.18_264/0.8)] border border-[oklch(0.72_0.18_264/0.15)]">{t}</span>
                          ))}
                        </div>
                      )}
                    </SourceCard>
                  );
                })
              )}
            </div>
          )}

          {/* Hugging Face */}
          {activeTab === "huggingface" && (
            <div className="grid gap-3">
              {hfSources.length === 0 ? (
                <EmptyState message="Hugging Face 모델/Space를 찾지 못했습니다." />
              ) : (
                hfSources.map((s, i) => {
                  const meta = (s.metadata ?? {}) as SourceMeta;
                  return (
                    <SourceCard
                      key={s.id}
                      delay={i * 50}
                      title={s.title}
                      url={s.url}
                      description={s.description}
                      score={s.score}
                      renderScore={renderScore}
                      badge={{ label: meta.type === "space" ? "Space" : meta.pipeline_tag ?? "Model", color: "text-[oklch(0.80_0.16_75)] bg-[oklch(0.80_0.16_75/0.08)]" }}
                    >
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                        {meta.downloads != null && <span className="flex items-center gap-1"><Download className="w-3 h-3" />{(meta.downloads).toLocaleString()} 다운로드</span>}
                        {meta.likes != null && <span className="flex items-center gap-1"><Heart className="w-3 h-3" />{(meta.likes).toLocaleString()} 좋아요</span>}
                      </div>
                    </SourceCard>
                  );
                })
              )}
            </div>
          )}

          {/* Papers */}
          {activeTab === "papers" && (
            <div className="grid gap-3">
              {paperSources.length === 0 ? (
                <EmptyState message="관련 논문을 찾지 못했습니다." />
              ) : (
                paperSources.map((s, i) => {
                  const meta = (s.metadata ?? {}) as SourceMeta;
                  return (
                    <SourceCard
                      key={s.id}
                      delay={i * 50}
                      title={s.title}
                      url={s.url}
                      description={s.description}
                      score={s.score}
                      renderScore={renderScore}
                      badge={{ label: meta.hasCode ? "코드 있음" : "코드 없음", color: meta.hasCode ? "text-[oklch(0.74_0.16_155)] bg-[oklch(0.74_0.16_155/0.08)]" : "text-muted-foreground bg-muted" }}
                    >
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                        {meta.stars != null && meta.stars > 0 && <span className="flex items-center gap-1"><Star className="w-3 h-3" />{meta.stars.toLocaleString()} GitHub Stars</span>}
                        {(meta as any).upvotes != null && (meta as any).upvotes > 0 && (
                          <span className="flex items-center gap-1 text-[oklch(0.80_0.16_75)]">
                            <Heart className="w-3 h-3 fill-current" />
                            {(meta as any).upvotes.toLocaleString()} 추천
                          </span>
                        )}
                        {meta.published && <span>발표: {new Date(meta.published).toLocaleDateString("ko-KR")}</span>}
                        {meta.repository && (
                          <a href={meta.repository} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-[oklch(0.78_0.14_200)] hover:underline">
                            <Code2 className="w-3 h-3" />코드 보기
                          </a>
                        )}
                      </div>
                    </SourceCard>
                  );
                })
              )}
            </div>
          )}

          {/* Hacker News */}
          {activeTab === "hackernews" && (
            <div className="grid gap-3">
              {hnSources.length === 0 ? (
                <EmptyState message="Hacker News 토론을 찾지 못했습니다." />
              ) : (
                hnSources.map((s, i) => {
                  const meta = (s.metadata ?? {}) as SourceMeta;
                  return (
                    <SourceCard
                      key={s.id}
                      delay={i * 50}
                      title={s.title}
                      url={s.url}
                      description={s.description}
                      score={s.score}
                      renderScore={renderScore}
                      badge={{ label: "HN", color: "text-[oklch(0.68_0.20_15)] bg-[oklch(0.68_0.20_15/0.08)]" }}
                    >
                      <div className="flex flex-wrap gap-3 text-xs text-muted-foreground mt-2">
                        <span className="flex items-center gap-1"><TrendingUp className="w-3 h-3" />{meta.points ?? 0} 포인트</span>
                        <span className="flex items-center gap-1"><MessageSquare className="w-3 h-3" />{meta.comments ?? 0} 댓글</span>
                        {meta.author && <span>by {meta.author}</span>}
                        {meta.hnUrl && (
                          <a href={meta.hnUrl} target="_blank" rel="noopener noreferrer" className="text-[oklch(0.68_0.20_15)] hover:underline">HN 토론 보기</a>
                        )}
                      </div>
                    </SourceCard>
                  );
                })
              )}
            </div>
          )}

          {/* Analysis */}
          {activeTab === "analysis" && (
            <div className="space-y-4 animate-fade-in">
              {!analysis ? (
                <div className="glass rounded-2xl p-8 border border-border/30 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[oklch(0.72_0.18_264)] mx-auto mb-3" />
                  <p className="text-muted-foreground">AI 분석 중입니다...</p>
                </div>
              ) : (
                <>
                  {/* Summary */}
                  <div className="glass rounded-2xl p-6 border border-[oklch(0.72_0.18_264/0.2)]">
                    <h3 className="font-semibold text-foreground mb-3 flex items-center gap-2">
                      <Brain className="w-4 h-4 text-[oklch(0.72_0.18_264)]" />
                      프로젝트 요약
                    </h3>
                    <p className="text-muted-foreground leading-relaxed">{analysis.summary as string}</p>
                    <div className="mt-4 flex items-center gap-3">
                      <span className="text-sm text-muted-foreground">구현 난이도:</span>
                      <span className={`text-sm font-semibold px-3 py-1 rounded-full border ${
                        analysis.implementationDifficulty === "초급" ? "text-[oklch(0.74_0.16_155)] bg-[oklch(0.74_0.16_155/0.1)] border-[oklch(0.74_0.16_155/0.3)]"
                        : analysis.implementationDifficulty === "중급" ? "text-[oklch(0.80_0.16_75)] bg-[oklch(0.80_0.16_75/0.1)] border-[oklch(0.80_0.16_75/0.3)]"
                        : analysis.implementationDifficulty === "고급" ? "text-[oklch(0.68_0.20_15)] bg-[oklch(0.68_0.20_15/0.1)] border-[oklch(0.68_0.20_15/0.3)]"
                        : "text-[oklch(0.62_0.22_25)] bg-[oklch(0.62_0.22_25/0.1)] border-[oklch(0.62_0.22_25/0.3)]"
                      }`}>
                        {analysis.implementationDifficulty as string}
                      </span>
                      <span className="text-sm text-muted-foreground">{analysis.difficultyReason as string}</span>
                    </div>
                  </div>

                  {/* Core technologies */}
                  {Array.isArray(analysis.coreTechnologies) && analysis.coreTechnologies.length > 0 && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h3 className="font-semibold text-foreground mb-3">핵심 기술</h3>
                      <div className="flex flex-wrap gap-2">
                        {(analysis.coreTechnologies as string[]).map((t) => (
                          <span key={t} className="text-sm px-3 py-1.5 rounded-full bg-[oklch(0.72_0.18_264/0.08)] text-[oklch(0.82_0.18_264)] border border-[oklch(0.72_0.18_264/0.2)]">{t}</span>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Tech stack */}
                  {analysis.techStack && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h3 className="font-semibold text-foreground mb-4">추천 기술 스택</h3>
                      <div className="grid sm:grid-cols-2 gap-4">
                        {Object.entries(analysis.techStack as Record<string, string[]>).map(([area, techs]) => (
                          <div key={area}>
                            <div className="text-xs text-muted-foreground uppercase tracking-wider mb-2">{area}</div>
                            <div className="flex flex-wrap gap-1.5">
                              {techs.map((t) => (
                                <span key={t} className="text-xs px-2 py-1 rounded-md bg-accent text-accent-foreground">{t}</span>
                              ))}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {/* Core features */}
                  {Array.isArray(analysis.coreFeatures) && analysis.coreFeatures.length > 0 && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h3 className="font-semibold text-foreground mb-3">핵심 기능</h3>
                      <ul className="space-y-2">
                        {(analysis.coreFeatures as string[]).map((f, i) => (
                          <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                            <ChevronRight className="w-4 h-4 text-[oklch(0.72_0.18_264)] flex-shrink-0 mt-0.5" />
                            {f}
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {/* Risks */}
                  {Array.isArray(analysis.risks) && analysis.risks.length > 0 && (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <h3 className="font-semibold text-foreground mb-3">리스크 및 라이선스</h3>
                      <div className="space-y-3">
                        {(analysis.risks as Array<{risk: string; mitigation: string}>).map((r, i) => (
                          <div key={i} className="p-3 rounded-xl bg-[oklch(0.68_0.20_15/0.06)] border border-[oklch(0.68_0.20_15/0.15)]">
                            <div className="text-sm font-medium text-foreground mb-1">⚠️ {r.risk}</div>
                            <div className="text-xs text-muted-foreground">대응: {r.mitigation}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Plan */}
          {activeTab === "plan" && (
            <div className="animate-fade-in">
              {!plan?.markdownContent ? (
                <div className="glass rounded-2xl p-8 border border-border/30 text-center">
                  <Loader2 className="w-8 h-8 animate-spin text-[oklch(0.74_0.16_155)] mx-auto mb-3" />
                  <p className="text-muted-foreground">계획서 생성 중입니다...</p>
                </div>
              ) : (
                <>
                  {/* Plan controls */}
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex gap-1.5">
                      {(["preview", "raw"] as const).map((v) => (
                        <button
                          key={v}
                          onClick={() => setPlanView(v)}
                          className={`text-sm px-4 py-2 rounded-xl border transition-all ${
                            planView === v
                              ? "bg-[oklch(0.74_0.16_155/0.1)] border-[oklch(0.74_0.16_155/0.3)] text-[oklch(0.74_0.16_155)]"
                              : "border-border/30 text-muted-foreground hover:text-foreground"
                          }`}
                        >
                          {v === "preview" ? (
                            <span className="flex items-center gap-1.5"><BookOpen className="w-3.5 h-3.5" />미리보기</span>
                          ) : (
                            <span className="flex items-center gap-1.5"><Code2 className="w-3.5 h-3.5" />Markdown</span>
                          )}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2">
                      <button
                        onClick={handleCopyMarkdown}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg border border-border/50 text-muted-foreground hover:text-foreground hover:border-border transition-all"
                      >
                        <Copy className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">복사</span>
                      </button>
                      <button
                        onClick={handleDownload}
                        className="flex items-center gap-1.5 text-sm px-3 py-1.5 rounded-lg bg-[oklch(0.74_0.16_155/0.1)] hover:bg-[oklch(0.74_0.16_155/0.2)] border border-[oklch(0.74_0.16_155/0.3)] text-[oklch(0.74_0.16_155)] transition-all"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">다운로드</span>
                      </button>
                    </div>
                  </div>

                  {planView === "preview" ? (
                    <div className="glass rounded-2xl p-8 border border-border/30">
                      <div className="prose prose-sm max-w-none prose-dark prose-invert">
                        <Streamdown>{plan.markdownContent}</Streamdown>
                      </div>
                    </div>
                  ) : (
                    <div className="glass rounded-2xl p-6 border border-border/30">
                      <pre className="text-xs text-muted-foreground font-mono whitespace-pre-wrap leading-relaxed overflow-auto max-h-[70vh]">
                        {plan.markdownContent}
                      </pre>
                    </div>
                  )}
                </>
              )}
            </div>
          )}
        </div>

        {/* Suggestion Card */}
        {research?.status === "done" && (activeTab === "plan" || activeTab === "analysis") && (
          <div className="mt-8 glass rounded-2xl p-6 border border-border/30 hover:border-border/50 transition-all duration-200 animate-fade-in">
            <h3 className="font-semibold text-foreground mb-2 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-[oklch(0.72_0.18_264)]" />
              계획서 수정 및 피드백 반영
            </h3>
            <p className="text-xs text-muted-foreground mb-4">
              생성된 개발 계획서에 추가하고 싶거나 수정하고 싶은 내용을 입력해 보세요. AI가 기존 분석 결과와 소스를 참고하여 계획서를 다시 작성합니다.
            </p>
            <form onSubmit={(e) => {
              e.preventDefault();
              if (!instruction.trim()) return;
              modifyPlanMutation.mutate({ researchId, instruction });
            }} className="space-y-3">
              <textarea
                value={instruction}
                onChange={(e) => setInstruction(e.target.value)}
                placeholder="예: 데이터베이스를 PostgreSQL로 변경하고, Docker 배포 장을 추가해줘"
                className="w-full h-24 px-4 py-3 text-sm rounded-xl bg-background border border-border/40 focus:border-[oklch(0.72_0.18_264/0.5)] focus:ring-1 focus:ring-[oklch(0.72_0.18_264/0.5)] focus:outline-none resize-none transition-all placeholder:text-muted-foreground/30"
                disabled={modifyPlanMutation.isPending}
              />
              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={!instruction.trim() || modifyPlanMutation.isPending}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 rounded-xl bg-[oklch(0.72_0.18_264/0.12)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.25)] text-[oklch(0.82_0.18_264)] transition-all disabled:opacity-50 disabled:pointer-events-none"
                >
                  {modifyPlanMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>반영 중...</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-4 h-4" />
                      <span>반영하기</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}
      </div>
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
      <DevKitDialog open={isDevKitOpen} onOpenChange={setIsDevKitOpen} researchId={researchId} />
    </div>
  );
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SourceCard({
  title,
  url,
  description,
  score,
  badge,
  children,
  delay,
  renderScore,
}: {
  title: string;
  url: string;
  description: string | null;
  score: number | null;
  badge: { label: string; color: string };
  children?: React.ReactNode;
  delay?: number;
  renderScore: (score: number | null) => React.ReactNode;
}) {
  return (
    <div
      className="glass rounded-2xl p-5 border border-border/30 hover:border-border/60 transition-all duration-200 group animate-fade-in-up"
      style={{ animationDelay: `${delay ?? 0}ms`, opacity: 0 }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1.5 flex-wrap">
            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${badge.color}`}>
              {badge.label}
            </span>
            <div className="flex items-center gap-1 text-xs text-muted-foreground/60">
              <span>점수</span>
              {renderScore(score)}
            </div>
          </div>
          <a
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-foreground hover:text-[oklch(0.82_0.18_264)] transition-colors group-hover:underline underline-offset-2 line-clamp-1 flex items-center gap-1.5"
          >
            {title}
            <ExternalLink className="w-3 h-3 opacity-0 group-hover:opacity-60 transition-opacity flex-shrink-0" />
          </a>
          {description && (
            <p className="text-sm text-muted-foreground mt-1 line-clamp-2 leading-relaxed">{description}</p>
          )}
          {children}
        </div>
      </div>
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="glass rounded-2xl p-12 border border-border/30 text-center animate-fade-in">
      <FileText className="w-8 h-8 text-muted-foreground/30 mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">{message}</p>
    </div>
  );
}

/** Shown while the four-stage teardown chain is still running. */
function TeardownPending({ label }: { label: string }) {
  return (
    <div className="glass rounded-2xl p-12 border border-border/30 text-center animate-fade-in">
      <Loader2 className="w-8 h-8 animate-spin text-[oklch(0.72_0.18_264)] mx-auto mb-3" />
      <p className="text-muted-foreground text-sm">{label}</p>
      <p className="text-xs text-muted-foreground/50 mt-2">
        원리 추출 → 균열 분석 → 도약 설계 → 차별화 감사 순으로 진행됩니다.
      </p>
    </div>
  );
}
