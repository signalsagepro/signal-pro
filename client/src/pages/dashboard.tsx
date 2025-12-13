import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, Layers, Signal, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import type { Signal as SignalType, Strategy, Asset } from "@shared/schema";
import { formatDistanceToNow } from "date-fns";

export default function Dashboard() {
  const { data: signals = [], isLoading: signalsLoading } = useQuery<SignalType[]>({
    queryKey: ["/api/signals"],
  });

  const { data: strategies = [], isLoading: strategiesLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const { data: assets = [], isLoading: assetsLoading } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

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
      value: "Online",
      icon: Activity,
      color: "text-status-online",
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
          <div className="p-2 bg-gradient-to-br from-emerald-500/10 to-teal-500/10 rounded-lg">
            <Activity className="h-7 w-7 text-emerald-500" />
          </div>
          <div>
            <h1 className="text-4xl font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent" data-testid="heading-dashboard">
              Trading Command Center
            </h1>
            <p className="text-base text-muted-foreground mt-1">
              Real-time market intelligence and signal monitoring
            </p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {metricCards.map((metric) => {
          const isLoading = signalsLoading || strategiesLoading || assetsLoading;
          
          return (
            <Card key={metric.title} data-testid={metric.testId} className="shadow-lg border-2 border-emerald-500/20 hover:shadow-emerald-500/20 hover:border-emerald-500/40 transition-all duration-300 bg-gradient-to-br from-background to-emerald-500/5">
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
                <CardTitle className="text-sm font-bold text-muted-foreground uppercase tracking-wide">
                  {metric.title}
                </CardTitle>
                <div className="p-2.5 rounded-xl bg-gradient-to-br from-emerald-500/20 to-teal-500/20 shadow-lg">
                  <metric.icon className="h-5 w-5 text-emerald-600" />
                </div>
              </CardHeader>
              <CardContent>
                {isLoading ? (
                  <Skeleton className="h-8 w-20" />
                ) : (
                  <div className="space-y-1">
                    <div className="text-3xl font-mono font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">
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

      <Card className="shadow-xl border-2 border-emerald-500/20">
        <CardHeader className="bg-gradient-to-r from-emerald-500/10 to-teal-500/10 border-b border-emerald-500/20">
          <div className="flex items-center gap-2">
            <Signal className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-xl font-bold">Recent Trading Signals</CardTitle>
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
                    className="flex items-start gap-4 p-4 rounded-lg border-2 border-emerald-500/20 hover:border-emerald-500/40 hover:shadow-lg hover:shadow-emerald-500/10 transition-all duration-300 bg-gradient-to-r from-background to-emerald-500/5"
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
                        {strategy?.name} • {formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="shadow-lg border-2 border-teal-500/20">
          <CardHeader className="bg-gradient-to-r from-teal-500/10 to-emerald-500/10 border-b border-teal-500/20">
            <div className="flex items-center gap-2">
              <TrendingUp className="h-5 w-5 text-teal-600" />
              <CardTitle className="text-lg font-bold">Active Strategies</CardTitle>
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
                    className="flex items-center justify-between p-3 rounded-lg border-2 border-teal-500/20 hover:border-teal-500/40 hover:shadow-md transition-all duration-200 bg-gradient-to-r from-background to-teal-500/5"
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

        <Card className="shadow-lg border-2 border-blue-500/20">
          <CardHeader className="bg-gradient-to-r from-blue-500/10 to-teal-500/10 border-b border-blue-500/20">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-blue-600" />
              <CardTitle className="text-lg font-bold">Connected Assets</CardTitle>
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
                    className="flex items-center justify-between p-3 rounded-lg border-2 border-blue-500/20 hover:border-blue-500/40 hover:shadow-md transition-all duration-200 bg-gradient-to-r from-background to-blue-500/5"
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
      </div>
    </div>
  );
}
