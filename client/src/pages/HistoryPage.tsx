import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useEffect } from "react";
import { useLocation } from "wouter";
import {
  ArrowLeft,
  Sparkles,
  History,
  ChevronRight,
  Clock,
  CheckCircle,
  AlertCircle,
  Loader2,
  FileText,
  Search,
  Settings,
  Crosshair,
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import { useState, useRef } from "react";
import { toast } from "sonner";

const STATUS_CONFIG = {
  pending: { label: "대기 중", color: "text-muted-foreground", bg: "bg-muted", icon: <Clock className="w-3 h-3" /> },
  collecting: { label: "수집 중", color: "text-[oklch(0.78_0.14_200)]", bg: "bg-[oklch(0.78_0.14_200/0.1)]", icon: <Search className="w-3 h-3" /> },
  analyzing: { label: "분석 중", color: "text-[oklch(0.72_0.18_264)]", bg: "bg-[oklch(0.72_0.18_264/0.1)]", icon: <Loader2 className="w-3 h-3 animate-spin" /> },
  done: { label: "완료", color: "text-[oklch(0.74_0.16_155)]", bg: "bg-[oklch(0.74_0.16_155/0.1)]", icon: <CheckCircle className="w-3 h-3" /> },
  error: { label: "오류", color: "text-[oklch(0.68_0.20_15)]", bg: "bg-[oklch(0.68_0.20_15/0.1)]", icon: <AlertCircle className="w-3 h-3" /> },
};

export default function HistoryPage() {
  const { isAuthenticated } = useAuth();
  const [, navigate] = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!isAuthenticated) {
      window.location.href = getLoginUrl();
    }
  }, [isAuthenticated]);

  const { data: researches, isLoading, refetch: refetchHistory } = trpc.research.list.useQuery(undefined, {
    enabled: isAuthenticated,
  });

  const importMutation = trpc.research.import.useMutation({
    onSuccess: (data) => {
      toast.success("프로젝트를 성공적으로 불러왔습니다.");
      navigate(`/research/${data.researchId}`);
    },
    onError: (err) => {
      toast.error("프로젝트 불러오기 실패: " + err.message);
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
          throw new Error("올바르지 않은 파일 형식입니다.");
        }
        const json = JSON.parse(text);
        if (!json.research || !json.research.keyword || !json.research.status) {
          throw new Error("유효하지 않은 프로젝트 구조입니다.");
        }
        await importMutation.mutateAsync(json);
      } catch (err: any) {
        toast.error("불러오기 실패: " + (err.message || "파일을 분석할 수 없습니다."));
        setIsImporting(false);
      }
    };
    reader.readAsText(file);
    e.target.value = ""; // Reset file input
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Background */}
      <div className="fixed inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-[oklch(0.72_0.18_264/0.04)] rounded-full blur-[100px]" />
      </div>

      {/* Header */}
      <header className="sticky top-0 z-40 border-b border-border/50 glass">
        <div className="container flex items-center h-14 justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate("/")}
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft className="w-4 h-4 flex-shrink-0" />
              <span className="hidden md:inline">홈</span>
            </button>
            <div className="w-px h-4 bg-border" />
            <div className="flex items-center gap-2 min-w-0">
              <History className="w-4 h-4 text-[oklch(0.72_0.18_264)] flex-shrink-0" />
              <span className="font-medium text-foreground truncate">리서치 히스토리</span>
            </div>
          </div>
          <button
            onClick={() => setIsSettingsOpen(true)}
            title="설정"
            aria-label="설정"
            className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
          >
            <Settings className="w-4 h-4 flex-shrink-0" />
            <span className="hidden lg:inline whitespace-nowrap">설정</span>
          </button>
        </div>
      </header>

      <div className="container py-8 relative z-10">
        <div className="max-w-2xl mx-auto">
          {/* Page title */}
          <div className="mb-8 animate-fade-in-up">
            <h1 className="text-2xl font-bold text-foreground mb-2">리서치 히스토리</h1>
            <p className="text-muted-foreground text-sm">
              과거에 수행한 리서치 결과와 생성된 개발 계획서를 확인하세요.
            </p>
          </div>

          {/* New research & Import project CTA */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6 animate-fade-in-up delay-100">
            <button
              onClick={() => navigate("/")}
              className="glass rounded-2xl p-5 border border-[oklch(0.72_0.18_264/0.2)] hover:border-[oklch(0.72_0.18_264/0.4)] transition-all duration-300 group text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-[oklch(0.72_0.18_264/0.1)] flex items-center justify-center">
                    <Sparkles className="w-5 h-5 text-[oklch(0.72_0.18_264)]" />
                  </div>
                  <div>
                    <div className="font-medium text-foreground">새 리서치 시작</div>
                    <div className="text-sm text-muted-foreground">아이디어 키워드로 시작</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-[oklch(0.72_0.18_264)] group-hover:translate-x-1 transition-all" />
              </div>
            </button>

            <button
              onClick={handleImportClick}
              disabled={isImporting}
              className="glass rounded-2xl p-5 border border-border/30 hover:border-border/60 transition-all duration-300 group text-left"
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-accent/50 flex items-center justify-center">
                    {isImporting ? (
                      <Loader2 className="w-5 h-5 text-muted-foreground animate-spin" />
                    ) : (
                      <FileText className="w-5 h-5 text-muted-foreground group-hover:text-foreground transition-colors" />
                    )}
                  </div>
                  <div>
                    <div className="font-medium text-foreground">프로젝트 불러오기</div>
                    <div className="text-sm text-muted-foreground">JSON 프로젝트 파일 로드</div>
                  </div>
                </div>
                <ChevronRight className="w-5 h-5 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all" />
              </div>
            </button>
          </div>

          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept=".json"
            style={{ display: "none" }}
          />

          {/* Research list */}
          {isLoading ? (
            <div className="space-y-3">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="glass rounded-2xl p-5 border border-border/30 animate-pulse">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-muted animate-shimmer" />
                    <div className="flex-1 space-y-2">
                      <div className="h-4 bg-muted rounded animate-shimmer w-1/3" />
                      <div className="h-3 bg-muted rounded animate-shimmer w-1/4" />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : !researches || researches.length === 0 ? (
            <div className="glass rounded-2xl p-12 border border-border/30 text-center animate-fade-in">
              <FileText className="w-10 h-10 text-muted-foreground/30 mx-auto mb-4" />
              <h3 className="font-medium text-foreground mb-2">아직 리서치 기록이 없습니다</h3>
              <p className="text-sm text-muted-foreground mb-6">
                첫 번째 리서치를 시작해 앱 개발 계획서를 자동으로 생성해보세요.
              </p>
              <button
                onClick={() => navigate("/")}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[oklch(0.72_0.18_264/0.1)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.3)] text-[oklch(0.82_0.18_264)] text-sm font-medium transition-all"
              >
                <Sparkles className="w-4 h-4" />
                리서치 시작하기
              </button>
            </div>
          ) : (
            <div className="space-y-3">
              {researches.map((r, i) => {
                const statusCfg = STATUS_CONFIG[r.status as keyof typeof STATUS_CONFIG] ?? STATUS_CONFIG.pending;
                return (
                  <button
                    key={r.id}
                    onClick={() => navigate(`/research/${r.id}`)}
                    className="w-full glass rounded-2xl p-5 border border-border/30 hover:border-border/60 transition-all duration-200 group text-left animate-fade-in-up"
                    style={{ animationDelay: `${i * 60}ms`, opacity: 0 }}
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-10 h-10 rounded-xl bg-[oklch(0.72_0.18_264/0.08)] flex items-center justify-center flex-shrink-0">
                        {r.mode === "teardown" ? (
                          <Crosshair className="w-5 h-5 text-[oklch(0.72_0.18_264)]" />
                        ) : (
                          <Search className="w-5 h-5 text-[oklch(0.72_0.18_264)]" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium text-foreground truncate">{r.keyword}</span>
                          {r.mode === "teardown" && (
                            <span className="text-xs px-2 py-0.5 rounded-full flex-shrink-0 text-[oklch(0.72_0.18_264)] bg-[oklch(0.72_0.18_264/0.1)] border border-[oklch(0.72_0.18_264/0.3)]">
                              역설계
                            </span>
                          )}
                          <span className={`text-xs px-2 py-0.5 rounded-full flex items-center gap-1 flex-shrink-0 ${statusCfg.color} ${statusCfg.bg}`}>
                            {statusCfg.icon}
                            {statusCfg.label}
                          </span>
                        </div>
                        <div className="text-xs text-muted-foreground flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          {new Date(r.createdAt).toLocaleString("ko-KR", {
                            year: "numeric",
                            month: "short",
                            day: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </div>
                      </div>
                      <ChevronRight className="w-4 h-4 text-muted-foreground group-hover:text-foreground group-hover:translate-x-1 transition-all flex-shrink-0" />
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      </div>
      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}
