import { useEffect, useRef, useState, useCallback } from "react";
import { createChart, IChartApi, ISeriesApi, CandlestickData, Time, LineStyle, CrosshairMode, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp,
  TrendingDown,
  Zap,
  Minus,
  MousePointer2,
  Trash2,
  BarChart3,
} from "lucide-react";

interface TradingChartProps {
  symbol: string;
  name: string;
  basePrice: number;
  color: string;
  isLive: boolean;
  selectedTool: string;
}

// Generate initial candle data
const generateInitialData = (basePrice: number, count: number = 100): CandlestickData[] => {
  const data: CandlestickData[] = [];
  let price = basePrice;
  const now = Math.floor(Date.now() / 1000);
  
  for (let i = count - 1; i >= 0; i--) {
    const time = (now - i * 60) as Time;
    const volatility = basePrice * 0.003;
    const trend = Math.sin(i / 15) * volatility * 0.5;
    const change = (Math.random() - 0.5) * volatility * 2 + trend;
    
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    
    data.push({
      time,
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
    });
    
    price = close;
  }
  
  return data;
};

export function TradingChart({ symbol, name, basePrice, color, isLive, selectedTool }: TradingChartProps) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const selectedToolRef = useRef(selectedTool);
  const [currentData, setCurrentData] = useState<CandlestickData[]>([]);
  const [currentPrice, setCurrentPrice] = useState(basePrice);
  const [priceChange, setPriceChange] = useState(0);
  const [horizontalLines, setHorizontalLines] = useState<any[]>([]);
  
  // Keep ref in sync with prop
  useEffect(() => {
    selectedToolRef.current = selectedTool;
  }, [selectedTool]);
  
  // Initialize chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    
    // Create chart
    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { color: '#ffffff' },
        textColor: '#333',
      },
      grid: {
        vertLines: { color: '#f0f0f0' },
        horzLines: { color: '#f0f0f0' },
      },
      crosshair: {
        mode: CrosshairMode.Normal,
        vertLine: {
          width: 1,
          color: '#10b981',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#10b981',
        },
        horzLine: {
          width: 1,
          color: '#10b981',
          style: LineStyle.Dashed,
          labelBackgroundColor: '#10b981',
        },
      },
      rightPriceScale: {
        borderColor: '#e0e0e0',
        scaleMargins: {
          top: 0.1,
          bottom: 0.2,
        },
      },
      timeScale: {
        borderColor: '#e0e0e0',
        timeVisible: true,
        secondsVisible: false,
      },
      handleScroll: {
        vertTouchDrag: false,
      },
    });
    
    // Add candlestick series
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#10b981',
      downColor: '#ef4444',
      borderUpColor: '#059669',
      borderDownColor: '#dc2626',
      wickUpColor: '#059669',
      wickDownColor: '#dc2626',
    });
    
    // Add volume series
    const volumeSeries = chart.addSeries(HistogramSeries, {
      color: '#94a3b8',
      priceFormat: {
        type: 'volume',
      },
      priceScaleId: '',
    });
    
    volumeSeries.priceScale().applyOptions({
      scaleMargins: {
        top: 0.85,
        bottom: 0,
      },
    });
    
    // Generate and set initial data
    const initialData = generateInitialData(basePrice);
    candleSeries.setData(initialData);
    
    // Generate volume data
    const volumeData = initialData.map(candle => ({
      time: candle.time,
      value: Math.floor(Math.random() * 100000) + 50000,
      color: candle.close >= candle.open ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
    }));
    volumeSeries.setData(volumeData);
    
    setCurrentData(initialData);
    setCurrentPrice(initialData[initialData.length - 1].close);
    setPriceChange(initialData[initialData.length - 1].close - initialData[0].open);
    
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    
    // Fit content
    chart.timeScale().fitContent();
    
    // Handle resize
    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({
          width: chartContainerRef.current.clientWidth,
        });
      }
    };
    
    window.addEventListener('resize', handleResize);
    handleResize();
    
    // Handle click for drawing
    chart.subscribeClick((param) => {
      const currentTool = selectedToolRef.current;
      if (currentTool !== 'select' && param.point) {
        const price = candleSeries.coordinateToPrice(param.point.y);
        if (price !== null && price !== undefined) {
          // Add line with current tool
          const colors: Record<string, string> = {
            horizontal: '#f59e0b',
            support: '#10b981',
            resistance: '#ef4444',
          };
          const lineColor = colors[currentTool] || '#3b82f6';
          const lineStyle = currentTool === 'horizontal' ? LineStyle.Dashed : LineStyle.Solid;
          
          const line = candleSeries.createPriceLine({
            price: price,
            color: lineColor,
            lineWidth: 2,
            lineStyle: lineStyle,
            axisLabelVisible: true,
            title: currentTool === 'support' ? 'Support' : currentTool === 'resistance' ? 'Resistance' : '',
          });
          
          setHorizontalLines(prev => [...prev, { line, tool: currentTool, price }]);
        }
      }
    });
    
    return () => {
      window.removeEventListener('resize', handleResize);
      chart.remove();
    };
  }, [symbol, basePrice]);
  
  // Add horizontal line
  const addHorizontalLine = useCallback((price: number, tool: string) => {
    if (!candleSeriesRef.current) return;
    
    const colors: Record<string, string> = {
      horizontal: '#f59e0b',
      support: '#10b981',
      resistance: '#ef4444',
    };
    
    const lineColor = colors[tool] || '#3b82f6';
    const lineStyle = tool === 'horizontal' ? LineStyle.Dashed : LineStyle.Solid;
    
    const line = candleSeriesRef.current.createPriceLine({
      price: price,
      color: lineColor,
      lineWidth: 2,
      lineStyle: lineStyle,
      axisLabelVisible: true,
      title: tool === 'support' ? 'Support' : tool === 'resistance' ? 'Resistance' : '',
    });
    
    setHorizontalLines(prev => [...prev, { line, tool, price }]);
  }, []);
  
  // Delete a single line
  const deleteLine = useCallback((index: number) => {
    if (!candleSeriesRef.current) return;
    
    const lineToRemove = horizontalLines[index];
    if (lineToRemove?.line) {
      candleSeriesRef.current.removePriceLine(lineToRemove.line);
    }
    
    setHorizontalLines(prev => prev.filter((_, i) => i !== index));
  }, [horizontalLines]);
  
  // Clear all lines
  const clearAllLines = useCallback(() => {
    if (!candleSeriesRef.current) return;
    
    horizontalLines.forEach(({ line }) => {
      candleSeriesRef.current?.removePriceLine(line);
    });
    
    setHorizontalLines([]);
  }, [horizontalLines]);
  
  // Real-time updates
  useEffect(() => {
    if (!isLive || !candleSeriesRef.current || !volumeSeriesRef.current || currentData.length === 0) return;
    
    const interval = setInterval(() => {
      setCurrentData(prevData => {
        if (prevData.length === 0) return prevData;
        
        const lastCandle = prevData[prevData.length - 1];
        const volatility = basePrice * 0.002;
        const tickChange = (Math.random() - 0.5) * volatility;
        
        // 20% chance to create new candle
        if (Math.random() > 0.8) {
          const now = Math.floor(Date.now() / 1000) as Time;
          const newOpen = lastCandle.close;
          const newClose = newOpen + tickChange;
          
          const newCandle: CandlestickData = {
            time: now,
            open: parseFloat(newOpen.toFixed(2)),
            high: parseFloat(Math.max(newOpen, newClose).toFixed(2)),
            low: parseFloat(Math.min(newOpen, newClose).toFixed(2)),
            close: parseFloat(newClose.toFixed(2)),
          };
          
          candleSeriesRef.current?.update(newCandle);
          volumeSeriesRef.current?.update({
            time: now,
            value: Math.floor(Math.random() * 100000) + 50000,
            color: newClose >= newOpen ? 'rgba(16, 185, 129, 0.5)' : 'rgba(239, 68, 68, 0.5)',
          });
          
          setCurrentPrice(newClose);
          setPriceChange(newClose - prevData[0].open);
          
          return [...prevData.slice(1), newCandle];
        } else {
          // Update current candle
          const updatedCandle: CandlestickData = {
            ...lastCandle,
            close: parseFloat((lastCandle.close + tickChange).toFixed(2)),
            high: parseFloat(Math.max(lastCandle.high, lastCandle.close + tickChange).toFixed(2)),
            low: parseFloat(Math.min(lastCandle.low, lastCandle.close + tickChange).toFixed(2)),
          };
          
          candleSeriesRef.current?.update(updatedCandle);
          
          setCurrentPrice(updatedCandle.close);
          setPriceChange(updatedCandle.close - prevData[0].open);
          
          return [...prevData.slice(0, -1), updatedCandle];
        }
      });
    }, 300); // Fast updates for smooth animation
    
    return () => clearInterval(interval);
  }, [isLive, basePrice, currentData.length]);
  
  const isPositive = priceChange >= 0;
  const priceChangePercent = currentData.length > 0 
    ? ((priceChange / currentData[0].open) * 100).toFixed(2)
    : '0.00';
  
  return (
    <Card className="shadow-lg border border-emerald-100 overflow-hidden">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 py-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg" style={{ backgroundColor: `${color}20` }}>
              <BarChart3 className="h-5 w-5" style={{ color }} />
            </div>
            <div>
              <CardTitle className="text-lg font-bold text-slate-800">{symbol}</CardTitle>
              <p className="text-xs text-slate-500">{name}</p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="text-right">
              <p className="text-xl font-mono font-bold text-slate-800">₹{currentPrice.toFixed(2)}</p>
              <div className={`flex items-center gap-1 text-sm ${isPositive ? 'text-emerald-600' : 'text-red-500'}`}>
                {isPositive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                <span className="font-mono">
                  {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent}%)
                </span>
              </div>
            </div>
            
            {isLive && (
              <Badge className="bg-emerald-500 animate-pulse">
                <Zap className="h-3 w-3 mr-1" />
                LIVE
              </Badge>
            )}
            
            {horizontalLines.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearAllLines}
                className="text-red-500 hover:text-red-600 hover:bg-red-50"
                title="Clear Lines"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            )}
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="p-0">
        <div 
          ref={chartContainerRef} 
          className="w-full" 
          style={{ height: '400px' }}
        />
        
        {/* Drawing info */}
        {selectedTool !== 'select' && (
          <div className="px-4 py-2 bg-amber-50 border-t border-amber-200 text-sm text-amber-800">
            Click on the chart to place a{' '}
            <strong>
              {selectedTool === 'support' ? 'Support' : selectedTool === 'resistance' ? 'Resistance' : 'Horizontal'} Line
            </strong>
          </div>
        )}
        
        {/* Active lines */}
        {horizontalLines.length > 0 && (
          <div className="px-4 py-2 border-t border-slate-100 flex items-center gap-2 flex-wrap">
            <span className="text-xs text-slate-500">Lines:</span>
            {horizontalLines.map((item, i) => (
              <Badge 
                key={i} 
                variant="outline" 
                className="text-xs pr-1 flex items-center gap-1 cursor-pointer hover:opacity-80"
                style={{ borderColor: item.tool === 'support' ? '#10b981' : item.tool === 'resistance' ? '#ef4444' : '#f59e0b' }}
              >
                {item.tool}: ₹{item.price.toFixed(0)}
                <button
                  onClick={() => deleteLine(i)}
                  className="ml-1 p-0.5 rounded hover:bg-red-100 text-red-500"
                  title="Delete line"
                >
                  <svg className="h-3 w-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </Badge>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default TradingChart;
