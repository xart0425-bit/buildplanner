import { useAuth } from "@/_core/hooks/useAuth";
import { getLoginUrl } from "@/const";
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  ArrowLeft,
  Sparkles,
  Terminal,
  Download,
  Play,
  Pause,
  Loader2,
  CheckCircle,
  Brain,
  TrendingUp,
  Clock,
  Settings,
  ChevronRight,
  Database,
  Lock,
  Cpu,
  Monitor,
  Lightbulb,
  FileText,
  Plus,
  Trash2
} from "lucide-react";
import { SettingsModal } from "@/components/SettingsModal";
import {
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Tooltip,
  Legend,
  BarChart,
  Bar,
  XAxis,
  YAxis
} from "recharts";

// Mapping and translations for activity types
const ACTIVITY_COLORS: Record<string, string> = {
  coding: "oklch(0.72 0.18 264)",        // Violet
  searching: "oklch(0.78 0.14 200)",     // Teal
  browsing: "oklch(0.74 0.16 155)",      // Greenish-blue
  terminal: "oklch(0.68 0.20 15)",       // Orange/Rust
  documentation: "oklch(0.80 0.16 75)",  // Yellowish-orange
  communication: "oklch(0.82 0.08 300)",  // Magenta/Pink
  design: "oklch(0.65 0.25 350)",         // Rose/Red
  other: "oklch(0.6 0.02 0)",            // Muted Gray
  unknown: "oklch(0.6 0.02 0)"
};

const translateActivityType = (type: string) => {
  const map: Record<string, string> = {
    coding: "코딩 및 개발",
    searching: "기술 자료 검색",
    browsing: "일반 웹 서핑",
    terminal: "터미널 명령 수행",
    documentation: "문서 및 오피스 작업",
    communication: "메신저 및 커뮤니케이션",
    design: "디자인 및 기획",
    other: "기타 작업",
    unknown: "기타 작업"
  };
  return map[type] || "기타 작업";
};

export default function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const [, navigate] = useLocation();
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [isInjectingMock, setIsInjectingMock] = useState(false);

  // tRPC queries
  const { data: dashboardData, refetch: refetchDashboard } = trpc.research.getWeeklyDashboardData.useQuery(
    { daysLimit: 7 },
    { enabled: isAuthenticated }
  );

  const { data: researchList, refetch: refetchResearchList } = trpc.research.list.useQuery(
    undefined,
    { enabled: isAuthenticated }
  );

  const { data: trackerStatus, refetch: refetchTrackerStatus } = trpc.research.getTrackerStatus.useQuery(
    undefined,
    { 
      enabled: isAuthenticated,
      refetchInterval: 3000 // Poll status every 3s
    }
  );

  const { data: trackerLogs } = trpc.research.getTrackerLogs.useQuery(
    undefined,
    {
      enabled: isAuthenticated && !!trackerStatus?.isRunning,
      refetchInterval: 2000 // Poll logs every 2s when running
    }
  );

  // tRPC mutations
  const triggerAnalysisMutation = trpc.research.triggerWeeklyAnalysis.useMutation({
    onSuccess: (data) => {
      toast.success("AI 주간 작업 분석 및 앱 기획 제안이 완료되었습니다!");
      refetchResearchList();
    },
    onError: (err) => {
      toast.error(`분석 실패: ${err.message}`);
    }
  });

  const startTrackerMutation = trpc.research.startTracker.useMutation();
  const stopTrackerMutation = trpc.research.stopTracker.useMutation();

  const clearWeeklyActivitiesMutation = trpc.research.clearWeeklyActivities.useMutation({
    onSuccess: () => {
      toast.success("실시간 트래킹 정보가 성공적으로 초기화되었습니다.");
      refetchDashboard();
    },
    onError: (err) => {
      toast.error(`초기화 실패: ${err.message}`);
    }
  });

  const handleClearWeeklyActivities = () => {
    if (window.confirm("정말로 모든 실시간 트래킹 정보를 리셋하시겠습니까? 리셋 후에는 복구할 수 없습니다.")) {
      clearWeeklyActivitiesMutation.mutate();
    }
  };

  const handleToggleTracker = () => {
    if (trackerStatus?.isRunning) {
      stopTrackerMutation.mutate(undefined, {
        onSuccess: (res) => {
          if (res.success) {
            toast.success("실시간 트래킹이 중지되었습니다.");
            refetchTrackerStatus();
          } else {
            toast.error(`트래킹 중지 실패: ${res.error}`);
          }
        },
        onError: (err) => {
          toast.error(`트래킹 중지 오류: ${err.message}`);
        }
      });
    } else {
      toast.info("실시간 트래커 백그라운드 활성화 시도 중...");
      startTrackerMutation.mutate(undefined, {
        onSuccess: (res) => {
          if (res.success) {
            toast.success("실시간 백그라운드 트래킹이 시작되었습니다! (터미널창 없이 백그라운드 구동)");
            refetchTrackerStatus();
          } else {
            toast.error(res.error || "트래커 시작 실패. Python 설치 및 환경을 확인해 주세요.");
          }
        },
        onError: (err) => {
          toast.error(`트래커 실행 오류: ${err.message}`);
        }
      });
    }
  };

  if (!isAuthenticated) {
    window.location.href = getLoginUrl();
    return null;
  }

  const activities = dashboardData?.activities || [];
  const totalSeconds = activities.reduce((sum, act) => sum + act.duration, 0);
  const totalMinutes = Math.round(totalSeconds / 60);
  const totalHours = (totalSeconds / 3600).toFixed(1);

  // Group by activityType
  const typeMap: Record<string, number> = {};
  activities.forEach((act) => {
    typeMap[act.activityType] = (typeMap[act.activityType] || 0) + act.duration;
  });

  const chartData = Object.entries(typeMap)
    .map(([type, dur]) => ({
      name: translateActivityType(type),
      value: Math.round(dur / 60), // in minutes
      rawType: type,
      percentage: totalSeconds > 0 ? ((dur / totalSeconds) * 100).toFixed(1) : "0"
    }))
    .sort((a, b) => b.value - a.value);

  // Group by processName (Top 5)
  const processMap: Record<string, number> = {};
  activities.forEach((act) => {
    processMap[act.processName] = (processMap[act.processName] || 0) + act.duration;
  });

  const topProcesses = Object.entries(processMap)
    .map(([name, dur]) => ({
      name,
      minutes: Math.round(dur / 60),
      percentage: totalSeconds > 0 ? ((dur / totalSeconds) * 100).toFixed(0) : "0"
    }))
    .sort((a, b) => b.minutes - a.minutes)
    .slice(0, 5);

  // Identify AI-generated proposals in the research list
  // They are prefixed with "[AI 제안]" in database
  const aiGeneratedPlans = researchList
    ? researchList.filter((r) => r.keyword.startsWith("[AI 제안]"))
    : [];

  // Function to inject mock data for development demonstration
  const handleInjectMockData = async () => {
    setIsInjectingMock(true);
    const mockData = [
      { windowTitle: "index.tsx - BuildPlanner - Visual Studio Code", processName: "Code.exe", duration: 1800, activityType: "coding" },
      { windowTitle: "react-recharts docs - Google Chrome", processName: "chrome.exe", duration: 900, activityType: "searching" },
      { windowTitle: "npm run dev - Windows PowerShell", processName: "powershell.exe", duration: 600, activityType: "terminal" },
      { windowTitle: "Slack - DeepMind Team Workspace", processName: "Slack.exe", duration: 1200, activityType: "communication" },
      { windowTitle: "Figma - BuildPlanner Mockup UI", processName: "figma.exe", duration: 800, activityType: "design" },
      { windowTitle: "Weekly Report.docx - Microsoft Word", processName: "WINWORD.EXE", duration: 600, activityType: "documentation" },
      { windowTitle: "YouTube - LoFi Coding Music - Google Chrome", processName: "chrome.exe", duration: 1500, activityType: "browsing" }
    ];

    try {
      const response = await fetch("/api/desktop/activities", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ activities: mockData })
      });
      const data = await response.json();
      if (data.success) {
        toast.success("데모용 가상 활동 로그 주입 완료!");
        refetchDashboard();
      } else {
        toast.error("가상 로그 주입 실패: " + data.error);
      }
    } catch (err: any) {
      toast.error("가상 로그 주입 실패: " + err.message);
    } finally {
      setIsInjectingMock(false);
    }
  };

  const handleTriggerAnalysis = () => {
    if (activities.length === 0) {
      toast.warning("주입되거나 추적된 활동 로그가 없습니다. 먼저 로컬 트래커를 돌리거나 모킹 데이터를 주입하세요!");
      return;
    }
    toast.info("AI 분석 파이프라인 가동 중... 잠시만 기다려주세요.");
    triggerAnalysisMutation.mutate();
  };

  return (
    <div className="min-h-screen bg-background relative overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[500px] bg-[oklch(0.72_0.18_264/0.06)] rounded-full blur-[120px]" />
        <div className="absolute bottom-0 right-0 w-[600px] h-[400px] bg-[oklch(0.78_0.14_200/0.04)] rounded-full blur-[100px]" />
        {/* Grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.025]"
          style={{
            backgroundImage: `linear-gradient(oklch(0.72 0.18 264) 1px, transparent 1px), linear-gradient(90deg, oklch(0.72 0.18 264) 1px, transparent 1px)`,
            backgroundSize: "60px 60px"
          }}
        />
      </div>

      {/* Navigation */}
      <nav className="relative z-10 border-b border-border/50 bg-background/50 backdrop-blur-md">
        <div className="container flex items-center justify-between h-16">
          <div className="flex items-center gap-6">
            <button onClick={() => navigate("/")} className="flex items-center gap-2.5 group">
              <div className="w-8 h-8 rounded-lg bg-[oklch(0.72_0.18_264/0.15)] border border-[oklch(0.72_0.18_264/0.3)] flex items-center justify-center group-hover:scale-105 transition-all">
                <Sparkles className="w-4 h-4 text-[oklch(0.82_0.18_264)]" />
              </div>
              <span className="font-semibold text-foreground tracking-tight hidden sm:inline">BuildPlanner</span>
            </button>
            <div className="hidden md:flex items-center gap-4">
              <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">리서처</button>
              <button onClick={() => navigate("/dashboard")} className="text-sm font-medium text-[oklch(0.82_0.18_264)] transition-colors">실시간 모니터링</button>
              <button onClick={() => navigate("/history")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">히스토리</button>
            </div>
          </div>
          <div className="flex items-center gap-1 sm:gap-2 min-w-0">
            <button
              onClick={() => setIsSettingsOpen(true)}
              title="설정"
              aria-label="설정"
              className="flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors px-2.5 py-1.5 rounded-md hover:bg-accent flex-shrink-0"
            >
              <Settings className="w-4 h-4 flex-shrink-0" />
              <span className="hidden lg:inline whitespace-nowrap">설정</span>
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
          </div>
        </div>
      </nav>

      {/* Main Container */}
      <main className="relative z-10 container py-8">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-8">
          <div>
            <div className="flex items-center gap-3 text-sm text-[oklch(0.82_0.18_264)] font-medium mb-1.5">
              <div className="flex items-center gap-1.5">
                <Monitor className="w-4 h-4" />
                <span>OS 수준 사용환경 모니터링</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 transition-all ${
                trackerStatus?.isRunning
                  ? "bg-green-500/10 text-green-500 border-green-500/25"
                  : "bg-muted text-muted-foreground border-border"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${trackerStatus?.isRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                {trackerStatus?.isRunning ? "실시간 연동 중" : "연동 중단됨"}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">활동 통계 및 AI 솔루션 대시보드</h1>
          </div>
          <div className="flex gap-2">
            <button
              onClick={handleClearWeeklyActivities}
              disabled={clearWeeklyActivitiesMutation.isPending}
              className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-lg bg-red-500/10 hover:bg-red-500/20 border border-red-500/30 hover:border-red-500/50 text-red-400 hover:text-red-300 transition-all font-medium disabled:opacity-50"
            >
              {clearWeeklyActivitiesMutation.isPending ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>초기화 중...</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>트래킹 정보 리셋</span>
                </>
              )}
            </button>
            <button
              onClick={handleInjectMockData}
              disabled={isInjectingMock}
              className="flex items-center gap-1.5 text-xs px-4 py-2.5 rounded-lg bg-accent/60 hover:bg-accent border border-border/50 text-muted-foreground hover:text-foreground transition-all"
            >
              {isInjectingMock ? (
                <>
                  <div className="w-3.5 h-3.5 border border-current border-t-transparent rounded-full animate-spin" />
                  <span>주입 중...</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  <span>데모 가상 로그 주입</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Dashboard Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 mb-8">
          
          {/* LEFT: Statistics & Chart */}
          <div className="lg:col-span-8 flex flex-col gap-6">
            
            {/* Stats Summary Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass rounded-2xl p-5 border border-border/30 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[oklch(0.72_0.18_264/0.1)] flex items-center justify-center text-[oklch(0.82_0.18_264)]">
                  <Clock className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">총 모니터링 시간</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{totalHours}시간</p>
                  <p className="text-[10px] text-muted-foreground/60">({totalMinutes}분 수집됨)</p>
                </div>
              </div>

              <div className="glass rounded-2xl p-5 border border-border/30 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[oklch(0.78_0.14_200/0.1)] flex items-center justify-center text-[oklch(0.78_0.14_200)]">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">감지된 고유 프로세스</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{Object.keys(processMap).length}개</p>
                  <p className="text-[10px] text-muted-foreground/60">주요 툴 활성 분석 중</p>
                </div>
              </div>

              <div className="glass rounded-2xl p-5 border border-border/30 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[oklch(0.74_0.16_155/0.1)] flex items-center justify-center text-[oklch(0.74_0.16_155)]">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">가장 높은 비중 활동</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5 truncate max-w-[150px]">
                    {chartData[0] ? chartData[0].name.split(" ")[0] : "기록 없음"}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {chartData[0] ? `${chartData[0].percentage}% 점유` : "데이터를 수집해주세요"}
                  </p>
                </div>
              </div>
            </div>

            {/* Main Visualized Report */}
            <div className="glass rounded-2xl p-6 border border-border/30 flex-1 min-h-[350px] flex flex-col">
              <h2 className="text-lg font-semibold text-foreground mb-4">주간 작업 패턴 분석</h2>
              
              {activities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent/40 flex items-center justify-center mb-4">
                    <Database className="w-8 h-8 text-muted-foreground/60" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">수집된 활동 데이터가 없습니다</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mb-4">
                    우측의 가이드를 따라 로컬 Windows 활동 트래커 스크립트를 다운로드하여 실행하거나, 데모 가상 로그 주입 버튼을 클릭해 보세요.
                  </p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-8 items-center flex-1">
                  
                  {/* Recharts Pie Chart */}
                  <div className="h-[250px] relative">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={chartData}
                          innerRadius={65}
                          outerRadius={85}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {chartData.map((entry, index) => (
                            <Cell 
                              key={`cell-${index}`} 
                              fill={ACTIVITY_COLORS[entry.rawType] || "oklch(0.6 0.02 0)"} 
                            />
                          ))}
                        </Pie>
                        <Tooltip
                          contentStyle={{
                            background: "oklch(0.14 0.008 264 / 0.95)",
                            border: "1px solid oklch(0.28 0.01 264)",
                            borderRadius: "8px",
                            color: "oklch(0.96 0.005 264)"
                          }}
                          formatter={(value) => [`${value}분`, "체류 시간"]}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                      <span className="text-[10px] uppercase tracking-widest text-muted-foreground/60">Total</span>
                      <span className="text-xl font-bold text-foreground">{totalMinutes}m</span>
                    </div>
                  </div>

                  {/* Activity Details List */}
                  <div className="flex flex-col gap-3">
                    <h3 className="text-xs text-muted-foreground/75 uppercase tracking-wider mb-1">분류별 작업 시간</h3>
                    <div className="flex flex-col gap-2.5 max-h-[220px] overflow-y-auto pr-2">
                      {chartData.map((item) => (
                        <div key={item.name} className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <div 
                                className="w-2.5 h-2.5 rounded-full shrink-0" 
                                style={{ backgroundColor: ACTIVITY_COLORS[item.rawType] || "gray" }}
                              />
                              <span className="font-medium text-foreground">{item.name}</span>
                            </div>
                            <div className="text-muted-foreground">
                              <span className="text-foreground font-semibold">{item.value}분</span>
                              <span className="text-[10px] ml-1.5">({item.percentage}%)</span>
                            </div>
                          </div>
                          <div className="w-full bg-accent/40 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="h-full rounded-full transition-all duration-500" 
                              style={{ 
                                width: `${item.percentage}%`,
                                backgroundColor: ACTIVITY_COLORS[item.rawType] || "gray" 
                              }}
                            />
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>

            {/* Top Processes Card */}
            {activities.length > 0 && (
              <div className="glass rounded-2xl p-6 border border-border/30">
                <h2 className="text-sm font-semibold text-foreground mb-4">가장 많이 체류한 앱/프로세스 Top 5</h2>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  {topProcesses.map((proc, idx) => (
                    <div key={proc.name} className="flex flex-col p-4 rounded-xl bg-accent/30 border border-border/10 relative overflow-hidden">
                      <span className="absolute top-2 right-3 text-xs font-mono text-muted-foreground/35 font-bold">#0{idx+1}</span>
                      <span className="text-xs font-semibold text-foreground truncate mb-1 pr-6" title={proc.name}>{proc.name}</span>
                      <span className="text-lg font-bold text-[oklch(0.82_0.18_264)]">{proc.minutes}분</span>
                      <span className="text-[10px] text-muted-foreground mt-1">점유율: {proc.percentage}%</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* RIGHT: Python Tracker Guide & Live Logs */}
          <div className="lg:col-span-4 flex flex-col gap-6">
            <div className="glass rounded-2xl p-6 border border-border/30 flex flex-col justify-between">
              <div>
                <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-[oklch(0.72_0.18_264/0.08)] border border-[oklch(0.72_0.18_264/0.2)] text-[10px] text-[oklch(0.72_0.18_264)] font-mono mb-4">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>client/public/tracker.py</span>
                </div>
                
                <h2 className="text-lg font-semibold text-foreground mb-3">로컬 작업 모니터링 가이드</h2>
                <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                  Windows PC 환경의 백그라운드에서 실행하며 활성 창 제목과 사용 시간을 집계하여 본 서버로 로깅하는 스크립트입니다. 
                  주요 메시지 및 비밀번호 입력 등은 마스킹하여 안전하게 보호됩니다.
                </p>

                <div className="space-y-4 mb-6">
                  {[
                    { step: "1", title: "파이썬 설치 확인", desc: "Python 3.x 이상 버전이 PC에 설치되어 있어야 합니다." },
                    { step: "2", title: "수집기 스크립트 다운로드", desc: "아래 버튼을 클릭해 스크립트를 로컬에 저장합니다." },
                    { step: "3", title: "백그라운드 실행", desc: "터미널에서 'python tracker.py' 명령을 실행합니다." }
                  ].map((s) => (
                    <div key={s.step} className="flex gap-3.5 items-start">
                      <div className="w-5 h-5 rounded-full bg-[oklch(0.72_0.18_264/0.1)] border border-[oklch(0.72_0.18_264/0.3)] flex items-center justify-center text-[10px] font-bold text-[oklch(0.82_0.18_264)] flex-shrink-0 mt-0.5">
                        {s.step}
                      </div>
                      <div>
                        <h4 className="text-xs font-semibold text-foreground">{s.title}</h4>
                        <p className="text-[10px] text-muted-foreground/80 mt-0.5">{s.desc}</p>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="bg-accent/40 rounded-xl p-3 border border-border/20 mb-6">
                  <div className="flex gap-2 items-center text-[10px] font-semibold text-[oklch(0.74_0.16_155)] mb-1">
                    <Lock className="w-3.5 h-3.5" />
                    <span>개인 정보 보호 정책 내장</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/90 leading-relaxed">
                    로그인, 비밀번호, 카드, 카카오톡, 금융 거래 등 민감한 단어가 포함된 활성 창 제목은 "민감한 작업"으로 원천 자동 변환되어 서버로 업로드됩니다.
                  </p>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={handleToggleTracker}
                  disabled={startTrackerMutation.isPending || stopTrackerMutation.isPending}
                  className={`flex items-center justify-center gap-2 w-full py-3 rounded-xl font-semibold text-sm transition-all duration-200 cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed ${
                    trackerStatus?.isRunning
                      ? "bg-[oklch(0.68_0.20_15)] hover:bg-[oklch(0.68_0.20_15/0.85)] text-white"
                      : "bg-[oklch(0.72_0.18_264)] hover:bg-[oklch(0.78_0.18_264)] text-[oklch(0.09_0.005_264)]"
                  }`}
                >
                  {startTrackerMutation.isPending || stopTrackerMutation.isPending ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      <span>처리 중...</span>
                    </>
                  ) : trackerStatus?.isRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>실시간 트래킹 중지</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>실시간 백그라운드 트래킹 시작</span>
                    </>
                  )}
                </button>

                <a
                  href="/tracker.py"
                  download="tracker.py"
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-accent/40 hover:bg-accent/60 border border-border/40 text-muted-foreground hover:text-foreground text-xs font-medium transition-all duration-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>수동 실행용 스크립트 다운로드</span>
                </a>
              </div>
            </div>

            {/* Live Logs Console */}
            {trackerStatus?.isRunning && (
              <div className="glass rounded-2xl p-5 border border-border/30 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[oklch(0.72_0.18_264)]" />
                    <h3 className="text-xs font-semibold text-foreground">실시간 트래킹 로그</h3>
                  </div>
                  <span className="text-[9px] px-2 py-0.5 rounded-full bg-green-500/10 text-green-500 border border-green-500/25 animate-pulse">
                    LIVE
                  </span>
                </div>
                <div className="bg-black/45 rounded-xl p-3.5 font-mono text-[10px] text-muted-foreground border border-border/40 h-[220px] overflow-y-auto flex flex-col gap-1.5 scrollbar-thin">
                  {trackerLogs && trackerLogs.length > 0 ? (
                    [...trackerLogs].reverse().map((log, idx) => (
                      <div key={idx} className="leading-relaxed break-all">
                        {log.includes("[ERROR]") || log.includes("[SYSTEM_ERROR]") ? (
                          <span className="text-red-400">{log}</span>
                        ) : log.includes("Sending") || log.includes("successful") || log.includes("Transmission") || log.includes("Ingestion") ? (
                          <span className="text-[oklch(0.74_0.16_155)] font-semibold">{log}</span>
                        ) : log.includes("[SYSTEM]") ? (
                          <span className="text-[oklch(0.82_0.18_264)] font-medium">{log}</span>
                        ) : (
                          <span>{log}</span>
                        )}
                      </div>
                    ))
                  ) : (
                    <div className="text-center text-[10px] text-muted-foreground/50 py-16">
                      로그를 수집하는 중입니다... (5초 간격)
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* BOTTOM: AI Custom App Proposals */}
        <div className="glass rounded-2xl p-6 border border-border/30">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-[oklch(0.72_0.18_264/0.1)] border border-[oklch(0.72_0.18_264/0.2)] flex items-center justify-center text-[oklch(0.82_0.18_264)]">
                <Brain className="w-5 h-5" />
              </div>
              <div>
                <h2 className="text-lg font-bold text-foreground">🤖 AI 맞춤형 유틸리티 앱 추천</h2>
                <p className="text-xs text-muted-foreground">나의 컴퓨터 작업 환경 및 반복 패턴을 분석하여 효율을 높여줄 솔루션을 기획합니다.</p>
              </div>
            </div>
            
            <button
              onClick={handleTriggerAnalysis}
              disabled={triggerAnalysisMutation.isPending}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[oklch(0.72_0.18_264/0.12)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.25)] text-[oklch(0.82_0.18_264)] font-semibold text-sm transition-all duration-200 disabled:opacity-50"
            >
              {triggerAnalysisMutation.isPending ? (
                <>
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>분석 진단 중...</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>주간 생산성 진단 & 앱 제안 실행</span>
                </>
              )}
            </button>
          </div>

          {/* Proposals / Seeding Results */}
          {aiGeneratedPlans.length === 0 ? (
            <div className="border border-dashed border-border/60 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
              <Lightbulb className="w-12 h-12 text-muted-foreground/35 mb-3" />
              <h3 className="font-semibold text-foreground mb-1">제안된 유틸리티 앱 목록이 없습니다</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                위 "주간 생산성 진단 & 앱 제안 실행" 버튼을 클릭하여 수집된 작업 이력을 진단하고, 나만을 위한 커스텀 자동화 유틸리티 기획서를 자동으로 생성하세요!
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              
              {/* Diagnosis Alert Box */}
              <div className="bg-[oklch(0.72_0.18_264/0.05)] border border-[oklch(0.72_0.18_264/0.15)] rounded-xl p-4 flex gap-3">
                <Brain className="w-5 h-5 text-[oklch(0.82_0.18_264)] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-[oklch(0.82_0.18_264)] mb-1">AI 주간 생산성 병목 분석 진단 리포트</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    활동 분석 결과, 주로 터미널 사용과 기술 레퍼런스 및 관련 소스를 수집하는 정보 검색 과정에서 시간이 많이 누수되는 패턴이 감지되었습니다. 
                    이에 따라 관련 R&D 시간을 대폭 단축하고 복합적인 자료 취합 및 단순 테스트 단계를 기여할 3가지 맞춤형 자동화 유틸리티를 아래와 같이 제안합니다.
                  </p>
                </div>
              </div>

              {/* Proposal Grid */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                {aiGeneratedPlans.map((project) => {
                  // Retrieve details from stored JSON or defaults
                  const planData = project.keyword.replace("[AI 제안] ", "");
                  const badgeColor = "bg-[oklch(0.74_0.16_155/0.1)] text-[oklch(0.74_0.16_155)] border-[oklch(0.74_0.16_155/0.2)]";

                  return (
                    <div 
                      key={project.id}
                      className="glass rounded-xl p-5 border border-border/30 flex flex-col justify-between hover:border-border/60 hover:-translate-y-0.5 transition-all duration-300"
                    >
                      <div>
                        <div className="flex items-center justify-between gap-2 mb-3.5">
                          <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full border ${badgeColor}`}>
                            유틸리티 기획
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono">
                            ID: #{project.id}
                          </span>
                        </div>
                        <h3 className="font-bold text-foreground text-sm mb-2">{planData}</h3>
                        <p className="text-xs text-muted-foreground/80 leading-relaxed mb-4">
                          본 사용자 맞춤형 앱은 주간 활성 창에서 감지된 잦은 검색 및 수동 빌드 실행 등의 패턴 비효율을 자동화하기 위해 제안되었습니다.
                        </p>
                      </div>

                      <button
                        onClick={() => navigate(`/research/${project.id}`)}
                        className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-[oklch(0.72_0.18_264/0.1)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.2)] text-[oklch(0.82_0.18_264)] font-medium text-xs transition-all duration-200"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>상세 빌드 계획서 확인</span>
                        <ChevronRight className="w-3 h-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </main>

      <SettingsModal open={isSettingsOpen} onOpenChange={setIsSettingsOpen} />
    </div>
  );
}
