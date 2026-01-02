import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries } from "lightweight-charts";
import type { IChartApi } from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { 
  RefreshCw, 
  TrendingUp, 
  TrendingDown, 
  Bug, 
  CheckCircle2, 
  XCircle, 
  AlertCircle,
  Activity,
  BarChart3
} from "lucide-react";

interface ChartDataPoint {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  ema50: number | null;
  ema200: number | null;
}

interface AvailableAsset {
  key: string;
  assetId: string;
  assetName: string;
  symbol: string;
  timeframe: string;
  candleCount: number;
}

interface ChartResponse {
  assetId: string;
  assetName: string;
  symbol: string;
  timeframe: string;
  totalCandles: number;
  returnedCandles: number;
  latestEma50: number;
  latestEma200: number;
  data: ChartDataPoint[];
}

interface Strategy {
  id: string;
  name: string;
  type: string;
  timeframe: string;
  enabled: boolean;
}

interface SignalCondition {
  name: string;
  description: string;
  met: boolean;
  value: string;
}

interface SignalCheckResponse {
  assetId: string;
  assetName: string;
  symbol: string;
  timeframe: string;
  strategyId: string;
  strategyName: string;
  strategyType: string;
  currentPrice: number;
  ema50: number;
  ema200: number;
  candleHigh: number;
  candleLow: number;
  conditions: SignalCondition[];
  wouldSignal: boolean;
  onCooldown: boolean;
  cooldownRemaining?: number;
  // Diagnostic info
  totalCandles?: number;
  emaAccurate?: boolean;
  emaWarning?: string | null;
}

export default function DevEmaDebug() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);

  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [strategies, setStrategies] = useState<Strategy[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [selectedStrategy, setSelectedStrategy] = useState<string>("");
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [signalCheck, setSignalCheck] = useState<SignalCheckResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [debugStatus, setDebugStatus] = useState<any>(null);
  const [todayOnly, setTodayOnly] = useState(true); // Default to today only

  // Fetch debug status
  const fetchDebugStatus = async () => {
    try {
      const response = await fetch("/api/ema/debug/status");
      const data = await response.json();
      setDebugStatus(data);
    } catch (err) {
      console.error("Failed to fetch debug status:", err);
    }
  };

  // Fetch available assets
  const fetchAvailableAssets = async () => {
    try {
      const response = await fetch("/api/ema/available-assets");
      const data = await response.json();
      setAvailableAssets(data.assets || []);
      
      if (data.assets?.length > 0 && !selectedAsset) {
        setSelectedAsset(data.assets[0].key);
      }
    } catch (err) {
      console.error("Failed to fetch available assets:", err);
    }
  };

  // Fetch strategies
  const fetchStrategies = async () => {
    try {
      const response = await fetch("/api/strategies");
      const data = await response.json();
      setStrategies(data || []);
      
      if (data?.length > 0 && !selectedStrategy) {
        setSelectedStrategy(data[0].id);
      }
    } catch (err) {
      console.error("Failed to fetch strategies:", err);
    }
  };

  // Parse asset key - format is "assetId-timeframe" where assetId is a UUID with dashes
  const parseAssetKey = (key: string): { assetId: string; timeframe: string } => {
    const parts = key.split("-");
    const timeframe = parts.pop()!; // Last part is timeframe (5m, 15m)
    const assetId = parts.join("-"); // Rest is the UUID
    return { assetId, timeframe };
  };

  // Fetch chart data for selected asset
  const fetchChartData = async () => {
    if (!selectedAsset) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use query param to avoid UUID routing issues
      const response = await fetch(`/api/ema/chart?key=${encodeURIComponent(selectedAsset)}&limit=100&today=${todayOnly}`);
      
      // Check content type before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`API returned non-JSON response (${response.status}). Server may need restart.`);
      }
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.message || "Failed to fetch chart data");
      }
      
      const data: ChartResponse = await response.json();
      setChartData(data);
      updateChart(data);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Fetch signal check for selected asset and strategy
  const fetchSignalCheck = async () => {
    if (!selectedAsset || !selectedStrategy) return;
    
    try {
      // Use query params to avoid UUID routing issues
      const response = await fetch(`/api/ema/signal-check?key=${encodeURIComponent(selectedAsset)}&strategyId=${selectedStrategy}`);
      
      if (!response.ok) {
        const errorData = await response.json();
        console.error("Signal check failed:", errorData);
        setSignalCheck(null);
        return;
      }
      
      const data: SignalCheckResponse = await response.json();
      setSignalCheck(data);
    } catch (err) {
      console.error("Failed to fetch signal check:", err);
      setSignalCheck(null);
    }
  };

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#1a1a2e" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#2a2a4a" },
        horzLines: { color: "#2a2a4a" },
      },
      width: chartContainerRef.current.clientWidth,
      height: 450,
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        // Timestamps are already in IST from server, just format them
        tickMarkFormatter: (time: number) => {
          const date = new Date(time * 1000);
          const hours = date.getUTCHours().toString().padStart(2, '0');
          const mins = date.getUTCMinutes().toString().padStart(2, '0');
          const day = date.getUTCDate().toString().padStart(2, '0');
          const month = (date.getUTCMonth() + 1).toString().padStart(2, '0');
          return `${day}/${month}, ${hours}:${mins}`;
        },
      },
    });

    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    const ema50Series = chart.addSeries(LineSeries, {
      color: "#2196F3",
      lineWidth: 2,
      title: "EMA 50",
    });

    const ema200Series = chart.addSeries(LineSeries, {
      color: "#FF9800",
      lineWidth: 2,
      title: "EMA 200",
    });

    chartRef.current = chart;
    (chartRef.current as any).candleSeries = candleSeries;
    (chartRef.current as any).ema50Series = ema50Series;
    (chartRef.current as any).ema200Series = ema200Series;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth 
        });
      }
    };

    window.addEventListener("resize", handleResize);

    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  // Update chart with data
  const updateChart = (data: ChartResponse) => {
    if (!chartRef.current) return;
    
    const chart = chartRef.current as any;
    if (!chart.candleSeries || !chart.ema50Series || !chart.ema200Series) return;

    const candleData = data.data.map((d) => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    const ema50Data = data.data
      .filter((d) => d.ema50 !== null)
      .map((d) => ({
        time: d.time as any,
        value: d.ema50!,
      }));

    const ema200Data = data.data
      .filter((d) => d.ema200 !== null)
      .map((d) => ({
        time: d.time as any,
        value: d.ema200!,
      }));

    chart.candleSeries.setData(candleData);
    chart.ema50Series.setData(ema50Data);
    chart.ema200Series.setData(ema200Data);

    chartRef.current?.timeScale().fitContent();
  };

  // Load data on mount
  useEffect(() => {
    fetchDebugStatus();
    fetchAvailableAssets();
    fetchStrategies();
    
    const interval = setInterval(() => {
      fetchDebugStatus();
      fetchAvailableAssets();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch data when asset or todayOnly changes
  useEffect(() => {
    if (selectedAsset) {
      fetchChartData();
      fetchSignalCheck();
    }
  }, [selectedAsset, todayOnly]);

  // Fetch signal check when strategy changes
  useEffect(() => {
    if (selectedAsset && selectedStrategy) {
      fetchSignalCheck();
    }
  }, [selectedStrategy]);

  // Auto-refresh
  useEffect(() => {
    if (!selectedAsset) return;
    
    const interval = setInterval(() => {
      fetchChartData();
      fetchSignalCheck();
    }, 5000);
    return () => clearInterval(interval);
  }, [selectedAsset, selectedStrategy]);

  const ema50AboveEma200 = chartData && chartData.latestEma50 > chartData.latestEma200;
  const selectedStrategyData = strategies.find(s => s.id === selectedStrategy);

  // Filter strategies by timeframe
  const filteredStrategies = selectedAsset 
    ? strategies.filter(s => {
        const { timeframe } = parseAssetKey(selectedAsset);
        return s.timeframe === timeframe;
      })
    : strategies;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="p-2.5 bg-gradient-to-br from-purple-500 to-pink-500 rounded-xl shadow-lg">
          <Bug className="h-7 w-7 text-white" />
        </div>
        <div>
          <h1 className="text-4xl font-bold text-slate-800">EMA Signal Debug</h1>
          <p className="text-slate-500 mt-1">Debug signal conditions for each asset and strategy</p>
        </div>
      </div>

      {/* Controls */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Asset:</span>
              <Select value={selectedAsset} onValueChange={setSelectedAsset}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select asset" />
                </SelectTrigger>
                <SelectContent>
                  {availableAssets.map((asset) => (
                    <SelectItem key={asset.key} value={asset.key}>
                      {asset.symbol} - {asset.timeframe} ({asset.candleCount} candles)
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <span className="text-sm font-medium text-slate-600">Strategy:</span>
              <Select value={selectedStrategy} onValueChange={setSelectedStrategy}>
                <SelectTrigger className="w-[280px]">
                  <SelectValue placeholder="Select strategy" />
                </SelectTrigger>
                <SelectContent>
                  {filteredStrategies.map((strategy) => (
                    <SelectItem key={strategy.id} value={strategy.id}>
                      {strategy.name} ({strategy.timeframe})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center gap-2">
              <Button 
                variant={todayOnly ? "default" : "outline"} 
                size="sm"
                onClick={() => setTodayOnly(true)}
                className={todayOnly ? "bg-blue-500 hover:bg-blue-600" : ""}
              >
                📅 Today Only
              </Button>
              <Button 
                variant={!todayOnly ? "default" : "outline"} 
                size="sm"
                onClick={() => setTodayOnly(false)}
                className={!todayOnly ? "bg-blue-500 hover:bg-blue-600" : ""}
              >
                📊 All Data
              </Button>
            </div>

            <Button 
              variant="outline" 
              size="sm"
              onClick={() => {
                fetchChartData();
                fetchSignalCheck();
              }}
              disabled={loading || !selectedAsset}
            >
              <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      {error && (
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500">
          {error}
        </div>
      )}

      {/* Debug Status Panel - shows when no assets available */}
      {availableAssets.length === 0 && debugStatus && (
        <Card className="border-amber-200 bg-amber-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-amber-700">
              <AlertCircle className="h-5 w-5" />
              Signal Generator Status
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 text-sm">
              <div className="p-2 bg-white rounded border">
                <div className="text-slate-500">Initialized</div>
                <div className={`font-bold ${debugStatus.isInitialized ? "text-green-600" : "text-red-600"}`}>
                  {debugStatus.isInitialized ? "Yes" : "No"}
                </div>
              </div>
              <div className="p-2 bg-white rounded border">
                <div className="text-slate-500">Candle Histories</div>
                <div className="font-bold">{debugStatus.candleHistoriesSize}</div>
              </div>
              <div className="p-2 bg-white rounded border">
                <div className="text-slate-500">Asset Token Map</div>
                <div className="font-bold">{debugStatus.assetTokenMapSize}</div>
              </div>
              <div className="p-2 bg-white rounded border">
                <div className="text-slate-500">Assets in DB</div>
                <div className="font-bold">{debugStatus.totalAssetsInDb}</div>
              </div>
            </div>
            
            {debugStatus.candleHistoriesSize === 0 && (
              <div className="p-3 bg-amber-100 rounded text-amber-800 text-sm">
                <strong>No candle data yet.</strong> This could mean:
                <ul className="list-disc ml-5 mt-2">
                  <li>Zerodha WebSocket is not connected</li>
                  <li>Market is closed (IST 9:15 AM - 3:30 PM)</li>
                  <li>No ticks have been received yet</li>
                  <li>Signal generator hasn't been initialized</li>
                </ul>
              </div>
            )}

            {debugStatus.assetsInDb?.length > 0 && (
              <div className="text-sm">
                <strong>Assets in Database:</strong>
                <div className="flex flex-wrap gap-2 mt-2">
                  {debugStatus.assetsInDb.map((a: any) => (
                    <Badge key={a.id} variant="outline">{a.symbol}</Badge>
                  ))}
                </div>
              </div>
            )}

            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm"
                onClick={() => {
                  fetchDebugStatus();
                  fetchAvailableAssets();
                }}
              >
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh Status
              </Button>
              <Button 
                variant="default" 
                size="sm"
                onClick={async () => {
                  try {
                    const res = await fetch("/api/ema/fetch-historical", { method: "POST" });
                    const data = await res.json();
                    alert(data.message || "Historical fetch triggered");
                    setTimeout(() => {
                      fetchDebugStatus();
                      fetchAvailableAssets();
                    }, 2000);
                  } catch (err) {
                    alert("Failed to trigger historical fetch");
                  }
                }}
              >
                📊 Fetch Historical Data
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Signal Conditions Panel */}
        <Card className="lg:col-span-1">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Activity className="h-5 w-5" />
              Signal Conditions
            </CardTitle>
            <CardDescription>
              {selectedStrategyData?.name || "Select a strategy"}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {signalCheck ? (
              <div className="space-y-4">
                {/* Current Values */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-700">Current Values</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="p-2 bg-slate-100 rounded">
                      <div className="text-slate-500">Price</div>
                      <div className="font-bold">
                        {signalCheck.currentPrice ? `₹${signalCheck.currentPrice.toFixed(2)}` : "N/A"}
                      </div>
                    </div>
                    <div className="p-2 bg-blue-50 rounded">
                      <div className="text-blue-500">EMA 50</div>
                      <div className="font-bold text-blue-600">
                        {signalCheck.ema50 ? `₹${signalCheck.ema50.toFixed(2)}` : "N/A"}
                      </div>
                    </div>
                    <div className="p-2 bg-orange-50 rounded">
                      <div className="text-orange-500">EMA 200</div>
                      <div className="font-bold text-orange-600">
                        {signalCheck.ema200 ? `₹${signalCheck.ema200.toFixed(2)}` : "N/A"}
                      </div>
                    </div>
                    <div className="p-2 bg-slate-100 rounded">
                      <div className="text-slate-500">Candle H/L</div>
                      <div className="font-bold text-xs">
                        {signalCheck.candleHigh ? signalCheck.candleHigh.toFixed(2) : "N/A"} / {signalCheck.candleLow ? signalCheck.candleLow.toFixed(2) : "N/A"}
                      </div>
                    </div>
                  </div>
                  {(!signalCheck.ema50 || !signalCheck.ema200) && (
                    <div className="p-2 bg-amber-50 border border-amber-200 rounded text-xs text-amber-700">
                      EMA values not available yet. Need more candles (50 for EMA50, 200 for EMA200).
                    </div>
                  )}
                  {signalCheck.emaWarning && (
                    <div className="p-2 bg-red-50 border border-red-200 rounded text-xs text-red-700">
                      ⚠️ {signalCheck.emaWarning}
                    </div>
                  )}
                  {signalCheck.totalCandles && (
                    <div className="text-xs text-slate-500">
                      Total candles: {signalCheck.totalCandles} {signalCheck.emaAccurate ? "✅" : "⚠️"}
                    </div>
                  )}
                </div>

                {/* Distance from EMAs */}
                {signalCheck.ema50 && signalCheck.ema200 && signalCheck.currentPrice && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-semibold text-slate-700">Distance from EMAs</h4>
                    <div className="text-sm space-y-1">
                      <div className="flex justify-between">
                        <span>Price to EMA50:</span>
                        <span className={signalCheck.currentPrice > signalCheck.ema50 ? "text-green-600" : "text-red-600"}>
                          {((signalCheck.currentPrice - signalCheck.ema50) / signalCheck.ema50 * 100).toFixed(3)}%
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span>Price to EMA200:</span>
                        <span className={signalCheck.currentPrice > signalCheck.ema200 ? "text-green-600" : "text-red-600"}>
                          {((signalCheck.currentPrice - signalCheck.ema200) / signalCheck.ema200 * 100).toFixed(3)}%
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Conditions */}
                <div className="space-y-2">
                  <h4 className="text-sm font-semibold text-slate-700">Conditions Check</h4>
                  <div className="space-y-2">
                    {signalCheck.conditions?.map((condition, i) => (
                      <div 
                        key={i} 
                        className={`p-2 rounded border ${
                          condition.met 
                            ? "bg-green-50 border-green-200" 
                            : "bg-red-50 border-red-200"
                        }`}
                      >
                        <div className="flex items-center gap-2">
                          {condition.met ? (
                            <CheckCircle2 className="h-4 w-4 text-green-600" />
                          ) : (
                            <XCircle className="h-4 w-4 text-red-600" />
                          )}
                          <span className="font-medium text-sm">{condition.name}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-1">{condition.description}</div>
                        <div className="text-xs font-mono mt-1">{condition.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Result */}
                <div className={`p-3 rounded-lg ${
                  signalCheck.wouldSignal 
                    ? "bg-green-100 border border-green-300" 
                    : "bg-slate-100 border border-slate-200"
                }`}>
                  <div className="flex items-center gap-2">
                    {signalCheck.wouldSignal ? (
                      <>
                        <CheckCircle2 className="h-5 w-5 text-green-600" />
                        <span className="font-bold text-green-700">SIGNAL WOULD FIRE</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-5 w-5 text-slate-500" />
                        <span className="font-bold text-slate-600">No Signal</span>
                      </>
                    )}
                  </div>
                  {signalCheck.onCooldown && (
                    <div className="flex items-center gap-2 mt-2 text-sm text-amber-600">
                      <AlertCircle className="h-4 w-4" />
                      On cooldown ({Math.ceil((signalCheck.cooldownRemaining || 0) / 60000)} min remaining)
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Activity className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>Select an asset and strategy to see conditions</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Chart Panel */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <div className="flex items-center justify-between">
              <div>
                <CardTitle className="flex items-center gap-2">
                  <BarChart3 className="h-5 w-5" />
                  {chartData?.symbol || "Chart"} - {chartData?.timeframe || ""}
                  {chartData && (
                    ema50AboveEma200 ? (
                      <TrendingUp className="h-5 w-5 text-green-500" />
                    ) : (
                      <TrendingDown className="h-5 w-5 text-red-500" />
                    )
                  )}
                </CardTitle>
                <CardDescription>
                  Candlesticks with EMA 50 (blue) and EMA 200 (orange)
                </CardDescription>
              </div>
              {chartData && (
                <div className="flex gap-2">
                  <Badge variant="outline" className="bg-blue-50 text-blue-600">
                    EMA50: ₹{chartData.latestEma50?.toFixed(2)}
                  </Badge>
                  <Badge variant="outline" className="bg-orange-50 text-orange-600">
                    EMA200: ₹{chartData.latestEma200?.toFixed(2)}
                  </Badge>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {chartData && (
              <div className="mb-4 p-3 bg-muted rounded-md text-sm">
                <div className="flex items-center gap-4 flex-wrap">
                  <span><strong>Total Candles:</strong> {chartData.totalCandles}</span>
                  <span><strong>Displayed:</strong> {chartData.returnedCandles}</span>
                  <span>
                    <strong>Trend:</strong>{" "}
                    <span className={ema50AboveEma200 ? "text-green-600" : "text-red-600"}>
                      {ema50AboveEma200 ? "Bullish (EMA50 > EMA200)" : "Bearish (EMA50 < EMA200)"}
                    </span>
                  </span>
                </div>
              </div>
            )}

            <div ref={chartContainerRef} className="w-full rounded-md overflow-hidden" />

            {!selectedAsset && (
              <div className="flex items-center justify-center h-[450px] text-muted-foreground">
                Select an asset to view the chart
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
