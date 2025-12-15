import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Signal as SignalIcon, Search, X, TrendingUp, TrendingDown, Activity } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Signal, Strategy, Asset } from "@shared/schema";
import { formatDistanceToNow, format } from "date-fns";

// Aggregated signal type for grouping
interface AggregatedSignal {
  assetId: string;
  assetSymbol: string;
  assetName: string;
  latestSignal: Signal;
  signalCount: number;
  signals: Signal[];
}

export default function Signals() {
  const [searchQuery, setSearchQuery] = useState("");
  const [timeframeFilter, setTimeframeFilter] = useState<string>("all");
  const [typeFilter, setTypeFilter] = useState<string>("all");
  const { toast } = useToast();

  const { data: signals = [], isLoading: signalsLoading } = useQuery<Signal[]>({
    queryKey: ["/api/signals"],
  });

  const { data: strategies = [] } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const { data: assets = [] } = useQuery<Asset[]>({
    queryKey: ["/api/assets"],
  });

  const dismissMutation = useMutation({
    mutationFn: (id: string) =>
      apiRequest("PATCH", `/api/signals/${id}`, { dismissed: true }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/signals"] });
      toast({
        title: "Signal dismissed",
        description: "The signal has been dismissed.",
      });
    },
  });

  // Filter signals first
  const filteredSignals = signals.filter((signal) => {
    const asset = assets.find((a) => a.id === signal.assetId);
    const strategy = strategies.find((s) => s.id === signal.strategyId);

    const matchesSearch =
      asset?.symbol.toLowerCase().includes(searchQuery.toLowerCase()) ||
      asset?.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      strategy?.name.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesTimeframe = timeframeFilter === "all" || signal.timeframe === timeframeFilter;
    const matchesType = typeFilter === "all" || signal.type === typeFilter;

    return matchesSearch && matchesTimeframe && matchesType && !signal.dismissed;
  });

  // Sort by latest first (most recent createdAt)
  const sortedSignals = [...filteredSignals].sort(
    (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
  );

  // Aggregate signals by asset - group all signals for same asset together
  const aggregatedSignals: AggregatedSignal[] = [];
  const assetSignalMap = new Map<string, Signal[]>();

  for (const signal of sortedSignals) {
    const existing = assetSignalMap.get(signal.assetId);
    if (existing) {
      existing.push(signal);
    } else {
      assetSignalMap.set(signal.assetId, [signal]);
    }
  }

  // Convert to aggregated format, sorted by latest signal time
  Array.from(assetSignalMap.entries()).forEach(([assetId, assetSignals]) => {
    const asset = assets.find((a) => a.id === assetId);
    const latestSignal = assetSignals[0]; // Already sorted, first is latest
    aggregatedSignals.push({
      assetId,
      assetSymbol: asset?.symbol || "Unknown",
      assetName: asset?.name || "Unknown Asset",
      latestSignal,
      signalCount: assetSignals.length,
      signals: assetSignals,
    });
  });

  // Sort aggregated by latest signal time
  aggregatedSignals.sort(
    (a, b) => new Date(b.latestSignal.createdAt).getTime() - new Date(a.latestSignal.createdAt).getTime()
  );

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

  const getSignalIcon = (type: string) => {
    if (type.includes("bullish") || type.includes("reversal")) return TrendingUp;
    if (type.includes("bearish") || type.includes("breakdown")) return TrendingDown;
    return Activity;
  };

  const stats = {
    total: signals.filter((s) => !s.dismissed).length,
    today: signals.filter(
      (s) => !s.dismissed && new Date(s.createdAt).toDateString() === new Date().toDateString()
    ).length,
    bullish: signals.filter(
      (s) => !s.dismissed && (s.type.includes("bullish") || s.type.includes("reversal"))
    ).length,
    bearish: signals.filter(
      (s) => !s.dismissed && (s.type.includes("bearish") || s.type.includes("breakdown"))
    ).length,
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold" data-testid="heading-signals">
          Trading Signals
        </h1>
        <p className="text-base text-muted-foreground">
          Real-time trading alerts from your active strategies
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="shadow-md border-primary/10 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Active Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary" data-testid="stat-total-signals">
              {stats.total}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md border-primary/10 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Today</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-primary" data-testid="stat-today-signals">
              {stats.today}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md border-chart-2/10 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Bullish Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-chart-2" data-testid="stat-bullish-signals">
              {stats.bullish}
            </div>
          </CardContent>
        </Card>
        <Card className="shadow-md border-destructive/10 hover:shadow-lg transition-shadow">
          <CardHeader className="pb-2">
            <CardTitle className="text-xs font-semibold text-muted-foreground">Bearish Signals</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-4xl font-bold text-destructive" data-testid="stat-bearish-signals">
              {stats.bearish}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card className="shadow-md">
        <CardHeader className="pb-4">
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search signals..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-10 h-10"
                data-testid="input-search-signals"
              />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Select value={timeframeFilter} onValueChange={setTimeframeFilter}>
                <SelectTrigger data-testid="select-timeframe-filter">
                  <SelectValue placeholder="Timeframe" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Timeframes</SelectItem>
                  <SelectItem value="5m">5 Min</SelectItem>
                  <SelectItem value="15m">15 Min</SelectItem>
                </SelectContent>
              </Select>
              <Select value={typeFilter} onValueChange={setTypeFilter}>
                <SelectTrigger data-testid="select-type-filter">
                  <SelectValue placeholder="Signal Type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  <SelectItem value="15m_above_50_bullish">15M Bullish</SelectItem>
                  <SelectItem value="5m_above_200_reversal">5M Reversal</SelectItem>
                  <SelectItem value="5m_pullback_to_200">5M Pullback</SelectItem>
                  <SelectItem value="5m_below_200_bearish">5M Bearish</SelectItem>
                  <SelectItem value="5m_touch_200_downtrend">5M Downtrend</SelectItem>
                  <SelectItem value="15m_below_200_breakdown">15M Breakdown</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {signalsLoading ? (
            <div className="space-y-4">
              {[...Array(5)].map((_, i) => (
                <Skeleton key={i} className="h-32 w-full" />
              ))}
            </div>
          ) : filteredSignals.length === 0 ? (
            <div className="text-center py-12">
              <SignalIcon className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">
                {signals.filter((s) => !s.dismissed).length === 0
                  ? "No signals yet"
                  : "No matching signals"}
              </h3>
              <p className="text-sm text-muted-foreground">
                {signals.filter((s) => !s.dismissed).length === 0
                  ? "Signals will appear here when your strategies detect trading opportunities"
                  : "Try adjusting your search or filters"}
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {aggregatedSignals.map((agg) => {
                const signal = agg.latestSignal;
                const strategy = strategies.find((s) => s.id === signal.strategyId);
                const Icon = getSignalIcon(signal.type);

                return (
                  <Card key={agg.assetId} data-testid={`signal-${signal.id}`} className="shadow-sm hover:shadow-md transition-shadow border-l-4" style={{borderLeftColor: signal.type.includes("bullish") || signal.type.includes("reversal") ? "hsl(var(--chart-2))" : signal.type.includes("pullback") ? "hsl(var(--chart-3))" : "hsl(var(--destructive))"}}>
                    <CardContent className="p-4">
                      <div className="flex items-start gap-4">
                        <div className={`p-3 rounded-lg flex-shrink-0 ${
                          signal.type.includes("bullish") || signal.type.includes("reversal")
                            ? "bg-chart-2/20 text-chart-2"
                            : signal.type.includes("pullback")
                            ? "bg-chart-3/20 text-chart-3"
                            : "bg-destructive/20 text-destructive"
                        }`}>
                          <Icon className="h-6 w-6" />
                        </div>
                        <div className="flex-1 space-y-3 min-w-0">
                          <div className="flex items-start justify-between gap-3 flex-wrap sm:flex-nowrap">
                            <div className="space-y-2 min-w-0">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-xl font-mono font-bold text-primary">
                                  {agg.assetSymbol}
                                </span>
                                <Badge className="text-xs font-semibold">
                                  {signal.timeframe.toUpperCase()}
                                </Badge>
                                {agg.signalCount > 1 && (
                                  <Badge variant="secondary" className="text-xs font-semibold">
                                    {agg.signalCount} signals
                                  </Badge>
                                )}
                              </div>
                              <p className="text-sm text-muted-foreground font-medium truncate">
                                {agg.assetName}
                              </p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => dismissMutation.mutate(signal.id)}
                              disabled={dismissMutation.isPending}
                              data-testid={`button-dismiss-${signal.id}`}
                              className="flex-shrink-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-3 rounded-lg bg-muted/60">
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">Latest Price</div>
                              <div className="text-sm font-mono font-semibold">
                                ₹{signal.price.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">EMA 50</div>
                              <div className="text-sm font-mono font-semibold">
                                {signal.ema50.toFixed(2)}
                              </div>
                            </div>
                            <div>
                              <div className="text-xs text-muted-foreground mb-1">EMA 200</div>
                              <div className="text-sm font-mono font-semibold">
                                {signal.ema200.toFixed(2)}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center justify-between text-xs text-muted-foreground flex-wrap gap-2">
                            <span>{strategy?.name || "Unknown Strategy"}</span>
                            <span>
                              {format(new Date(signal.createdAt), "MMM d, yyyy 'at' h:mm:ss a")} •{" "}
                              {formatDistanceToNow(new Date(signal.createdAt), { addSuffix: true })}
                            </span>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
