import { useEffect, useRef, useState } from "react";
import { createChart, ColorType, CandlestickSeries, LineSeries } from "lightweight-charts";
import type { IChartApi, ISeriesApi, CandlestickData, LineData } from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { RefreshCw, TrendingUp, TrendingDown } from "lucide-react";

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

export function EmaDebugChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const ema50SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ema200SeriesRef = useRef<ISeriesApi<"Line"> | null>(null);

  const [availableAssets, setAvailableAssets] = useState<AvailableAsset[]>([]);
  const [selectedAsset, setSelectedAsset] = useState<string>("");
  const [chartData, setChartData] = useState<ChartResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Fetch available assets
  const fetchAvailableAssets = async () => {
    try {
      const response = await fetch("/api/ema/available-assets");
      const data = await response.json();
      setAvailableAssets(data.assets || []);
      
      // Auto-select first asset if none selected
      if (data.assets?.length > 0 && !selectedAsset) {
        setSelectedAsset(data.assets[0].key);
      }
    } catch (err) {
      console.error("Failed to fetch available assets:", err);
    }
  };

  // Fetch chart data for selected asset
  const fetchChartData = async () => {
    if (!selectedAsset) return;
    
    setLoading(true);
    setError(null);
    
    try {
      // Use query param to avoid UUID routing issues
      const response = await fetch(`/api/ema/chart?key=${encodeURIComponent(selectedAsset)}&limit=100`);
      
      // Check content type before parsing
      const contentType = response.headers.get("content-type");
      if (!contentType?.includes("application/json")) {
        throw new Error(`API returned non-JSON response. Server may need restart.`);
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

  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: "#1a1a2e" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: {
          color: "#2a2a4a",
        },
        horzLines: {
          color: "#2a2a4a",
        },
      },
      timeScale: {
        timeVisible: true,
        secondsVisible: false,
        tickMarkFormatter: (time: any) => {
          const date = new Date(time * 1000); // Convert back to milliseconds
          return date.toLocaleString('en-IN', { 
            timeZone: 'Asia/Kolkata',
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
          });
        },
      },
    });

    // Candlestick series (v5.x API)
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: "#26a69a",
      downColor: "#ef5350",
      borderVisible: false,
      wickUpColor: "#26a69a",
      wickDownColor: "#ef5350",
    });

    // EMA 50 line (blue)
    const ema50Series = chart.addSeries(LineSeries, {
      color: "#2196F3",
      lineWidth: 2,
      title: "EMA 50",
    });

    // EMA 200 line (orange)
    const ema200Series = chart.addSeries(LineSeries, {
      color: "#FF9800",
      lineWidth: 2,
      title: "EMA 200",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    ema50SeriesRef.current = ema50Series;
    ema200SeriesRef.current = ema200Series;

    // Handle resize
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
    if (!candleSeriesRef.current || !ema50SeriesRef.current || !ema200SeriesRef.current) return;

    // Prepare candlestick data
    const candleData: CandlestickData[] = data.data.map((d) => ({
      time: d.time as any,
      open: d.open,
      high: d.high,
      low: d.low,
      close: d.close,
    }));

    // Prepare EMA data (filter out nulls)
    const ema50Data: LineData[] = data.data
      .filter((d) => d.ema50 !== null)
      .map((d) => ({
        time: d.time as any,
        value: d.ema50!,
      }));

    const ema200Data: LineData[] = data.data
      .filter((d) => d.ema200 !== null)
      .map((d) => ({
        time: d.time as any,
        value: d.ema200!,
      }));

    candleSeriesRef.current.setData(candleData);
    ema50SeriesRef.current.setData(ema50Data);
    ema200SeriesRef.current.setData(ema200Data);

    // Fit content
    chartRef.current?.timeScale().fitContent();
  };

  // Load available assets on mount
  useEffect(() => {
    fetchAvailableAssets();
    
    // Refresh every 30 seconds
    const interval = setInterval(fetchAvailableAssets, 30000);
    return () => clearInterval(interval);
  }, []);

  // Fetch chart data when asset changes
  useEffect(() => {
    if (selectedAsset) {
      fetchChartData();
    }
  }, [selectedAsset]);

  // Auto-refresh chart data every 10 seconds
  useEffect(() => {
    if (!selectedAsset) return;
    
    const interval = setInterval(fetchChartData, 10000);
    return () => clearInterval(interval);
  }, [selectedAsset]);

  const ema50AboveEma200 = chartData && chartData.latestEma50 > chartData.latestEma200;

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              EMA Debug Chart
              {chartData && (
                ema50AboveEma200 ? (
                  <TrendingUp className="h-5 w-5 text-green-500" />
                ) : (
                  <TrendingDown className="h-5 w-5 text-red-500" />
                )
              )}
            </CardTitle>
            <CardDescription>
              Visualize candlesticks with EMA 50 (blue) and EMA 200 (orange)
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Select value={selectedAsset} onValueChange={setSelectedAsset}>
              <SelectTrigger className="w-[250px]">
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
            <Button 
              variant="outline" 
              size="icon"
              onClick={fetchChartData}
              disabled={loading || !selectedAsset}
            >
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <div className="mb-4 p-3 bg-red-500/10 border border-red-500/20 rounded-md text-red-500">
            {error}
          </div>
        )}
        
        {chartData && (
          <div className="mb-4 grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
            <div className="p-3 bg-muted rounded-md">
              <div className="text-muted-foreground">Symbol</div>
              <div className="font-bold">{chartData.symbol}</div>
            </div>
            <div className="p-3 bg-muted rounded-md">
              <div className="text-muted-foreground">Timeframe</div>
              <div className="font-bold">{chartData.timeframe}</div>
            </div>
            <div className="p-3 bg-blue-500/10 rounded-md">
              <div className="text-blue-400">EMA 50</div>
              <div className="font-bold text-blue-500">
                ₹{chartData.latestEma50?.toFixed(2) || "N/A"}
              </div>
            </div>
            <div className="p-3 bg-orange-500/10 rounded-md">
              <div className="text-orange-400">EMA 200</div>
              <div className="font-bold text-orange-500">
                ₹{chartData.latestEma200?.toFixed(2) || "N/A"}
              </div>
            </div>
          </div>
        )}

        {chartData && (
          <div className="mb-4 p-3 bg-muted rounded-md text-sm">
            <div className="flex items-center gap-4">
              <span>
                <strong>Total Candles:</strong> {chartData.totalCandles}
              </span>
              <span>
                <strong>Displayed:</strong> {chartData.returnedCandles}
              </span>
              <span>
                <strong>Trend:</strong>{" "}
                <span className={ema50AboveEma200 ? "text-green-500" : "text-red-500"}>
                  {ema50AboveEma200 ? "Bullish (EMA50 > EMA200)" : "Bearish (EMA50 < EMA200)"}
                </span>
              </span>
            </div>
          </div>
        )}

        <div ref={chartContainerRef} className="w-full rounded-md overflow-hidden" />

        {!selectedAsset && availableAssets.length === 0 && (
          <div className="flex items-center justify-center h-[400px] text-muted-foreground">
            No candle data available. Start the signal generator to collect data.
          </div>
        )}
      </CardContent>
    </Card>
  );
}
