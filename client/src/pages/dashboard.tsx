import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Layers, Signal, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { TradingChart } from "@/components/trading-chart";
import { useDashboardConfig } from "@/hooks/use-dashboard-config";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket } from "@/hooks/use-websocket";
import type { Signal as SignalType, Strategy, Asset } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

export default function Dashboard() {
  const { user } = useAuth();
  const { config, isLoaded } = useDashboardConfig();
  const { isConnected } = useWebSocket();
  const isAdmin = user?.role === "admin";

  const { data: signals = [], isLoading: signalsLoading } = useQuery<SignalType[]>({
    queryKey: ["/api/signals"],
  });

  const { data: strategies = [], isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  // Check visibility based on config and user role
  const showMetrics = config.showMetricCards && (!config.adminOnlyMetrics || isAdmin);
  const showNifty = config.showNiftyChart && (!config.adminOnlyCharts || isAdmin);
  const showSensex = config.showSensexChart && (!config.adminOnlyCharts || isAdmin);
  const showSignals = config.showRecentSignals && (!config.adminOnlySignals || isAdmin);
  const showStrategies = config.showActiveStrategies && (!config.adminOnlyStrategies || isAdmin);
  const showAssets = config.showConnectedAssets && (!config.adminOnlyAssets || isAdmin);

  const todaySignals = signals.filter(
    (s) => new Date(s.createdAt).toDateString() === new Date().toDateString()
  );

  const activeStrategies = strategies.filter((s) => s.enabled);
  const enabledAssets = assets.filter((a) => a.enabled);

  const recentSignals = signals.slice(0, 10);

  const metricCards = [
    {
      title: "Signals Today",
      value: todaySignals.length,
      icon: Signal,
      color: "text-chart-1",
      testId: "metric-signals-today",
    },
    {
      title: "Active Strategies",
      value: activeStrategies.length,
      total: strategies.length,
      icon: TrendingUp,
      color: "text-chart-2",
      testId: "metric-active-strategies",
    },
    {
      title: "Connected Assets",
      value: enabledAssets.length,
      total: assets.length,
      icon: Layers,
      color: "text-chart-3",
      testId: "metric-connected-assets",
    },
    {
      title: "System Status",
      value: isConnected ? "Live" : "Offline",
      icon: Activity,
      color: isConnected ? "text-emerald-600" : "text-red-500",
      testId: "metric-system-status",
    },
  ];

  const getSignalTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      "15m_above_50_bullish": "15M Above 50 (Bullish)",
      "5m_above_200_reversal": "5M Above 200 (Reversal)",
      "5m_pullback_to_200": "5M Pullback to 200",
      "5m_below_200_bearish": "5M Below 200 (Bearish)",
      "5m_touch_200_downtrend": "5M Touch 200 (Downtrend)",
      "15m_below_200_breakdown": "15M Below 200 (Breakdown)",
    };
    return labels[type] || type;
  };

  const getSignalVariant = (type: string): "default" | "secondary" | "destructive" => {
    if (type.includes("bullish") || type.includes("reversal")) return "default";
    if (type.includes("pullback")) return "secondary";
    return "destructive";
  };

  return (
    <div className="space-y-8">
      <div className="space-y-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg">
            <Activity className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-800" data-testid="heading-dashboard">
              Trading Command Center
            </h1>
            <p className="text-base text-slate-500 mt-1">
              Real-time market intelligence and signal monitoring
            </p>
          </div>
        </div>
      </div>

      {showMetrics && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {metricCards.map((metric) => {
            const isLoading = signalsLoading || strategiesLoading || assetsLoading;
            
            return (
              <Card key={metric.title} data-testid={metric.testId} className="shadow-md border border-emerald-100 hover:shadow-lg hover:border-emerald-200 transition-all duration-300 bg-white">
                <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                  <CardTitle className="text-sm font-semibold text-slate-500 uppercase tracking-wide">
                    {metric.title}
                  </CardTitle>
                  <div className="p-2 rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 shadow-md">
                    <metric.icon className="h-5 w-5 text-white" />
                  </div>
                </CardHeader>
                <CardContent>
                  {isLoading ? (
                    <Skeleton className="h-8 w-20" />
                  ) : (
                    <div className="space-y-1">
                      <div className="text-3xl font-mono font-bold text-slate-800">
                        {typeof metric.value === "number" ? metric.value : metric.value}
                        {metric.total && (
                          <span className="text-lg text-muted-foreground font-normal">
                            {" "}/ {metric.total}
                          </span>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* Real-time Index Charts - NIFTY & SENSEX */}
      {(showNifty || showSensex) && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
          {showNifty && (
            <TradingChart
              symbol="NIFTY 50"
              name="NSE Nifty 50 Index"
              basePrice={24850}
              color="#10b981"
              isLive={true}
              selectedTool="select"
            />
          )}
          {showSensex && (
            <TradingChart
              symbol="SENSEX"
              name="BSE Sensex Index"
              basePrice={82350}
              color="#3b82f6"
              isLive={true}
              selectedTool="select"
            />
          )}
        </div>
      )}

      {showSignals && (
        <Card className="shadow-md border border-emerald-100">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <Signal className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-xl font-bold text-slate-800">Recent Trading Signals</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {signalsLoading ? (
              <div className="space-y-4">
                {[...Array(5)].map((_, i) => (
                  <div key={i} className="flex items-center gap-4">
                    <Skeleton className="h-12 w-12 rounded-md" />
                    <div className="space-y-2 flex-1">
                      <Skeleton className="h-4 w-1/3" />
                      <Skeleton className="h-3 w-1/2" />
                    </div>
                  </div>
                ))}
              </div>
            ) : recentSignals.length === 0 ? (
              <div className="text-center py-12">
                <Signal className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
                <p className="text-sm text-muted-foreground">No signals yet</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Signals will appear here when your strategies detect trading opportunities
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentSignals.map((signal) => {
                  const asset = assets.find((a) => a.id === signal.assetId);
                  const strategy = strategies.find((s) => s.id === signal.strategyId);

                  return (
                    <div
                      key={signal.id}
                      className="flex items-start gap-4 p-4 rounded-lg border border-emerald-100 hover:border-emerald-200 hover:shadow-md transition-all duration-300 bg-white"
                      data-testid={`signal-${signal.id}`}
                    >
                      <div className="flex-1 space-y-2">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-mono font-semibold">
                            {asset?.symbol || "Unknown"}
                          </span>
                          <Badge variant={getSignalVariant(signal.type)} className="text-xs">
                            {signal.timeframe.toUpperCase()}
                          </Badge>
                          <Badge variant="outline" className="text-xs">
                            {getSignalTypeLabel(signal.type)}
                          </Badge>
                        </div>
                        <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground flex-wrap">
                          <span>Price: {signal.price.toFixed(2)}</span>
                          <span>EMA50: {signal.ema50.toFixed(2)}</span>
                          <span>EMA200: {signal.ema200.toFixed(2)}</span>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {strategy?.name} • {format(new Date(signal.createdAt), "h:mm:ss a")} • {formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true })}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {(showStrategies || showAssets) && (
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {showStrategies && (
        <Card className="shadow-md border border-emerald-100">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg font-bold text-slate-800">Active Strategies</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {strategiesLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : activeStrategies.length === 0 ? (
              <div className="text-center py-8">
                <TrendingUp className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No active strategies</p>
              </div>
            ) : (
              <div className="space-y-3">
                {activeStrategies.slice(0, 5).map((strategy) => (
                  <div
                    key={strategy.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-emerald-100 hover:border-emerald-200 hover:shadow-sm transition-all duration-200 bg-white"
                    data-testid={`strategy-card-${strategy.id}`}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-medium">{strategy.name}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {strategy.timeframe.toUpperCase()} • {strategy.signalCount} signals
                      </div>
                    </div>
                    <Badge variant="secondary" className="text-xs">
                      Active
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}

        {showAssets && (
        <Card className="shadow-md border border-emerald-100">
          <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-emerald-600" />
              <CardTitle className="text-lg font-bold text-slate-800">Connected Assets</CardTitle>
            </div>
          </CardHeader>
          <CardContent>
            {assetsLoading ? (
              <div className="space-y-3">
                {[...Array(3)].map((_, i) => (
                  <Skeleton key={i} className="h-16 w-full" />
                ))}
              </div>
            ) : enabledAssets.length === 0 ? (
              <div className="text-center py-8">
                <Layers className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
                <p className="text-sm text-muted-foreground">No connected assets</p>
              </div>
            ) : (
              <div className="space-y-3">
                {enabledAssets.slice(0, 5).map((asset) => (
                  <div
                    key={asset.id}
                    className="flex items-center justify-between p-3 rounded-lg border border-emerald-100 hover:border-emerald-200 hover:shadow-sm transition-all duration-200 bg-white"
                    data-testid={`asset-card-${asset.id}`}
                  >
                    <div className="flex-1">
                      <div className="text-sm font-mono font-medium">{asset.symbol}</div>
                      <div className="text-xs text-muted-foreground mt-1">
                        {asset.name}
                      </div>
                    </div>
                    <Badge variant="outline" className="text-xs">
                      {asset.type === "indian_stock" ? "Indian" : "Forex"}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
        )}
      </div>
      )}
    </div>
  );
}
