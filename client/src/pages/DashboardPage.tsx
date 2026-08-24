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
import { useT } from "@/lib/i18n";
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

/** Takes the message bundle as an argument: this lives outside the component. */
const translateActivityType = (type: string, t: ReturnType<typeof useT>) => {
  const map: Record<string, string> = {
    coding: t.dashboard.activity.coding,
    searching: t.dashboard.activity.searching,
    browsing: t.dashboard.activity.browsing,
    terminal: t.dashboard.activity.terminal,
    documentation: t.dashboard.activity.documentation,
    communication: t.dashboard.activity.communication,
    design: t.dashboard.activity.design,
    other: t.dashboard.activity.other,
    unknown: t.dashboard.activity.other
  };
  return map[type] || t.dashboard.activity.other;
};

export default function DashboardPage() {
  const { isAuthenticated, user } = useAuth();
  const t = useT();
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
      toast.success(t.dashboard.toasts.analysisDone);
      refetchResearchList();
    },
    onError: (err) => {
      toast.error(t.dashboard.toasts.analysisFailed(err.message));
    }
  });

  const startTrackerMutation = trpc.research.startTracker.useMutation();
  const stopTrackerMutation = trpc.research.stopTracker.useMutation();

  const clearWeeklyActivitiesMutation = trpc.research.clearWeeklyActivities.useMutation({
    onSuccess: () => {
      toast.success(t.dashboard.toasts.resetDone);
      refetchDashboard();
    },
    onError: (err) => {
      toast.error(t.dashboard.toasts.resetFailed(err.message));
    }
  });

  const handleClearWeeklyActivities = () => {
    if (window.confirm(t.dashboard.toasts.confirmReset)) {
      clearWeeklyActivitiesMutation.mutate();
    }
  };

  const handleToggleTracker = () => {
    if (trackerStatus?.isRunning) {
      stopTrackerMutation.mutate(undefined, {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(t.dashboard.toasts.trackingStopped);
            refetchTrackerStatus();
          } else {
            toast.error(t.dashboard.toasts.stopFailed(res.error ?? ""));
          }
        },
        onError: (err) => {
          toast.error(t.dashboard.toasts.stopFailed(err.message));
        }
      });
    } else {
      toast.info(t.dashboard.toasts.startingTracker);
      startTrackerMutation.mutate(undefined, {
        onSuccess: (res) => {
          if (res.success) {
            toast.success(t.dashboard.toasts.trackingStarted);
            refetchTrackerStatus();
          } else {
            toast.error(res.error || t.dashboard.toasts.startFailed);
          }
        },
        onError: (err) => {
          toast.error(t.dashboard.toasts.startError(err.message));
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
      name: translateActivityType(type, t),
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
        toast.success(t.dashboard.toasts.mockInjected);
        refetchDashboard();
      } else {
        toast.error(t.dashboard.toasts.mockFailed(String(data.error)));
      }
    } catch (err: any) {
      toast.error(t.dashboard.toasts.mockFailed(err.message));
    } finally {
      setIsInjectingMock(false);
    }
  };

  const handleTriggerAnalysis = () => {
    if (activities.length === 0) {
      toast.warning(t.dashboard.toasts.noLogs);
      return;
    }
    toast.info(t.dashboard.toasts.pipelineRunning);
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
              <button onClick={() => navigate("/")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t.dashboard.navResearcher}</button>
              <button onClick={() => navigate("/dashboard")} className="text-sm font-medium text-[oklch(0.82_0.18_264)] transition-colors">{t.dashboard.navMonitoring}</button>
              <button onClick={() => navigate("/history")} className="text-sm text-muted-foreground hover:text-foreground transition-colors">{t.dashboard.navHistory}</button>
            </div>
          </div>
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
                <span>{t.dashboard.osMonitoring}</span>
              </div>
              <span className={`text-[10px] px-2 py-0.5 rounded-full border flex items-center gap-1 transition-all ${
                trackerStatus?.isRunning
                  ? "bg-green-500/10 text-green-500 border-green-500/25"
                  : "bg-muted text-muted-foreground border-border"
              }`}>
                <span className={`w-1.5 h-1.5 rounded-full ${trackerStatus?.isRunning ? "bg-green-500 animate-pulse" : "bg-muted-foreground"}`} />
                {trackerStatus?.isRunning ? t.dashboard.connected : t.dashboard.disconnected}
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-foreground">{t.dashboard.title}</h1>
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
                  <span>{t.dashboard.resetting}</span>
                </>
              ) : (
                <>
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>{t.dashboard.resetTracking}</span>
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
                  <span>{t.dashboard.injecting}</span>
                </>
              ) : (
                <>
                  <Database className="w-3.5 h-3.5" />
                  <span>{t.dashboard.injectDemoLogs}</span>
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
                  <p className="text-xs text-muted-foreground">{t.dashboard.totalTime}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{t.dashboard.hours(totalHours)}</p>
                  <p className="text-[10px] text-muted-foreground/60">{t.dashboard.minutesCollected(totalMinutes)}</p>
                </div>
              </div>

              <div className="glass rounded-2xl p-5 border border-border/30 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[oklch(0.78_0.14_200/0.1)] flex items-center justify-center text-[oklch(0.78_0.14_200)]">
                  <Cpu className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.dashboard.uniqueProcesses}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5">{t.dashboard.processesUnit(Object.keys(processMap).length)}</p>
                  <p className="text-[10px] text-muted-foreground/60">{t.dashboard.analysingTools}</p>
                </div>
              </div>

              <div className="glass rounded-2xl p-5 border border-border/30 flex items-center gap-4">
                <div className="w-12 h-12 rounded-xl bg-[oklch(0.74_0.16_155/0.1)] flex items-center justify-center text-[oklch(0.74_0.16_155)]">
                  <TrendingUp className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">{t.dashboard.topActivity}</p>
                  <p className="text-2xl font-bold text-foreground mt-0.5 truncate max-w-[150px]">
                    {chartData[0] ? chartData[0].name.split(" ")[0] : t.dashboard.noRecord}
                  </p>
                  <p className="text-[10px] text-muted-foreground/60">
                    {chartData[0] ? t.dashboard.share(chartData[0].percentage) : t.dashboard.collectData}
                  </p>
                </div>
              </div>
            </div>

            {/* Main Visualized Report */}
            <div className="glass rounded-2xl p-6 border border-border/30 flex-1 min-h-[350px] flex flex-col">
              <h2 className="text-lg font-semibold text-foreground mb-4">{t.dashboard.weeklyPattern}</h2>
              
              {activities.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center p-8 text-center">
                  <div className="w-16 h-16 rounded-2xl bg-accent/40 flex items-center justify-center mb-4">
                    <Database className="w-8 h-8 text-muted-foreground/60" />
                  </div>
                  <h3 className="font-semibold text-foreground mb-1">{t.dashboard.noDataTitle}</h3>
                  <p className="text-xs text-muted-foreground max-w-sm mb-4">
                    {t.dashboard.noDataDesc}
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
                          formatter={(value) => [t.dashboard.minutes(String(value)), t.dashboard.dwellTime]}
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
                    <h3 className="text-xs text-muted-foreground/75 uppercase tracking-wider mb-1">{t.dashboard.byCategory}</h3>
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
                              <span className="text-foreground font-semibold">{t.dashboard.minutes(item.value)}</span>
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
                <h2 className="text-sm font-semibold text-foreground mb-4">{t.dashboard.top5}</h2>
                <div className="grid grid-cols-1 sm:grid-cols-5 gap-4">
                  {topProcesses.map((proc, idx) => (
                    <div key={proc.name} className="flex flex-col p-4 rounded-xl bg-accent/30 border border-border/10 relative overflow-hidden">
                      <span className="absolute top-2 right-3 text-xs font-mono text-muted-foreground/35 font-bold">#0{idx+1}</span>
                      <span className="text-xs font-semibold text-foreground truncate mb-1 pr-6" title={proc.name}>{proc.name}</span>
                      <span className="text-lg font-bold text-[oklch(0.82_0.18_264)]">{t.dashboard.minutes(proc.minutes)}</span>
                      <span className="text-[10px] text-muted-foreground mt-1">{t.dashboard.occupancy}: {proc.percentage}%</span>
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
                
                <h2 className="text-lg font-semibold text-foreground mb-3">{t.dashboard.guideTitle}</h2>
                <p className="text-xs text-muted-foreground leading-relaxed mb-6">
                  {t.dashboard.guideDesc1} {t.dashboard.guideDesc2}
                </p>

                <div className="space-y-4 mb-6">
                  {[
                    { step: "1", title: t.dashboard.step1Title, desc: t.dashboard.step1Desc },
                    { step: "2", title: t.dashboard.step2Title, desc: t.dashboard.step2Desc },
                    { step: "3", title: t.dashboard.step3Title, desc: t.dashboard.step3Desc }
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
                    <span>{t.dashboard.privacyTitle}</span>
                  </div>
                  <p className="text-[9px] text-muted-foreground/90 leading-relaxed">
                    {t.dashboard.privacyDesc}
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
                      <span>{t.dashboard.processing}</span>
                    </>
                  ) : trackerStatus?.isRunning ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>{t.dashboard.stopTracking}</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4 fill-current" />
                      <span>{t.dashboard.startTracking}</span>
                    </>
                  )}
                </button>

                <a
                  href="/tracker.py"
                  download="tracker.py"
                  className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-xl bg-accent/40 hover:bg-accent/60 border border-border/40 text-muted-foreground hover:text-foreground text-xs font-medium transition-all duration-200"
                >
                  <Download className="w-3.5 h-3.5" />
                  <span>{t.dashboard.downloadScript}</span>
                </a>
              </div>
            </div>

            {/* Live Logs Console */}
            {trackerStatus?.isRunning && (
              <div className="glass rounded-2xl p-5 border border-border/30 flex flex-col">
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <Terminal className="w-4 h-4 text-[oklch(0.72_0.18_264)]" />
                    <h3 className="text-xs font-semibold text-foreground">{t.dashboard.logTitle}</h3>
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
                      {t.dashboard.collectingLogs}
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
                <h2 className="text-lg font-bold text-foreground">{t.dashboard.aiTitle}</h2>
                <p className="text-xs text-muted-foreground">{t.dashboard.aiSubtitle}</p>
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
                  <span>{t.dashboard.analysing}</span>
                </>
              ) : (
                <>
                  <Brain className="w-4 h-4" />
                  <span>{t.dashboard.runAnalysis}</span>
                </>
              )}
            </button>
          </div>

          {/* Proposals / Seeding Results */}
          {aiGeneratedPlans.length === 0 ? (
            <div className="border border-dashed border-border/60 rounded-2xl p-12 text-center flex flex-col items-center justify-center">
              <Lightbulb className="w-12 h-12 text-muted-foreground/35 mb-3" />
              <h3 className="font-semibold text-foreground mb-1">{t.dashboard.noProposalsTitle}</h3>
              <p className="text-xs text-muted-foreground max-w-md">
                {t.dashboard.noProposalsDesc}
              </p>
            </div>
          ) : (
            <div className="flex flex-col gap-6">
              
              {/* Diagnosis Alert Box */}
              <div className="bg-[oklch(0.72_0.18_264/0.05)] border border-[oklch(0.72_0.18_264/0.15)] rounded-xl p-4 flex gap-3">
                <Brain className="w-5 h-5 text-[oklch(0.82_0.18_264)] shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-xs font-semibold text-[oklch(0.82_0.18_264)] mb-1">{t.dashboard.reportTitle}</h4>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {t.dashboard.reportBody}
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
                            {t.dashboard.utilityPlan}
                          </span>
                          <span className="text-[10px] text-muted-foreground/60 font-mono">
                            ID: #{project.id}
                          </span>
                        </div>
                        <h3 className="font-bold text-foreground text-sm mb-2">{planData}</h3>
                        <p className="text-xs text-muted-foreground/80 leading-relaxed mb-4">
                          {t.dashboard.proposalNote}
                        </p>
                      </div>

                      <button
                        onClick={() => navigate(`/research/${project.id}`)}
                        className="flex items-center justify-center gap-1.5 w-full py-2.5 rounded-lg bg-[oklch(0.72_0.18_264/0.1)] hover:bg-[oklch(0.72_0.18_264/0.2)] border border-[oklch(0.72_0.18_264/0.2)] text-[oklch(0.82_0.18_264)] font-medium text-xs transition-all duration-200"
                      >
                        <FileText className="w-3.5 h-3.5" />
                        <span>{t.dashboard.viewPlan}</span>
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
