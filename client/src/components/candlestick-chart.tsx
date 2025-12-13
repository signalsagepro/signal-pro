import { useEffect, useState, useCallback } from "react";
import {
  ComposedChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  Cell,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { TrendingUp, TrendingDown, Activity, Zap } from "lucide-react";

interface CandleData {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

interface CandlestickChartProps {
  symbol?: string;
  onSymbolChange?: (symbol: string) => void;
}

const SYMBOLS = [
  { value: "RELIANCE", label: "Reliance Industries" },
  { value: "TCS", label: "Tata Consultancy Services" },
  { value: "INFY", label: "Infosys" },
  { value: "HDFCBANK", label: "HDFC Bank" },
  { value: "ICICIBANK", label: "ICICI Bank" },
  { value: "SBIN", label: "State Bank of India" },
  { value: "EURUSD", label: "EUR/USD" },
  { value: "GBPUSD", label: "GBP/USD" },
];

// Generate realistic price movement
const generateInitialData = (basePrice: number): CandleData[] => {
  const data: CandleData[] = [];
  let price = basePrice;
  const now = new Date();
  
  for (let i = 29; i >= 0; i--) {
    const time = new Date(now.getTime() - i * 60000);
    const volatility = basePrice * 0.002;
    const change = (Math.random() - 0.5) * volatility * 2;
    
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * volatility * 0.5;
    const low = Math.min(open, close) - Math.random() * volatility * 0.5;
    const volume = Math.floor(Math.random() * 100000) + 50000;
    
    data.push({
      time: time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      open: parseFloat(open.toFixed(2)),
      high: parseFloat(high.toFixed(2)),
      low: parseFloat(low.toFixed(2)),
      close: parseFloat(close.toFixed(2)),
      volume,
    });
    
    price = close;
  }
  
  return data;
};

// Generate next candle based on last price
const generateNextCandle = (lastCandle: CandleData, basePrice: number): CandleData => {
  const now = new Date();
  const volatility = basePrice * 0.003;
  const trend = Math.random() > 0.5 ? 1 : -1;
  const change = trend * Math.random() * volatility;
  
  const open = lastCandle.close;
  const close = open + change;
  const high = Math.max(open, close) + Math.random() * volatility * 0.3;
  const low = Math.min(open, close) - Math.random() * volatility * 0.3;
  const volume = Math.floor(Math.random() * 100000) + 50000;
  
  return {
    time: now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
    open: parseFloat(open.toFixed(2)),
    high: parseFloat(high.toFixed(2)),
    low: parseFloat(low.toFixed(2)),
    close: parseFloat(close.toFixed(2)),
    volume,
  };
};

const getBasePrice = (symbol: string): number => {
  const prices: Record<string, number> = {
    RELIANCE: 2450,
    TCS: 3890,
    INFY: 1520,
    HDFCBANK: 1650,
    ICICIBANK: 1180,
    SBIN: 780,
    EURUSD: 1.0850,
    GBPUSD: 1.2650,
  };
  return prices[symbol] || 1000;
};

// Custom Candlestick shape
const Candlestick = (props: any) => {
  const { x, y, width, height, payload } = props;
  const { open, close, high, low } = payload;
  
  const isGreen = close >= open;
  const fill = isGreen ? "#10b981" : "#ef4444";
  const stroke = isGreen ? "#059669" : "#dc2626";
  
  const candleHeight = Math.abs(close - open);
  const wickTop = high;
  const wickBottom = low;
  const bodyTop = Math.max(open, close);
  const bodyBottom = Math.min(open, close);
  
  // Scale calculations
  const yScale = height / (high - low || 1);
  const candleWidth = Math.max(width * 0.6, 4);
  const wickX = x + width / 2;
  const bodyX = x + (width - candleWidth) / 2;
  
  const scaledWickTop = y;
  const scaledWickBottom = y + height;
  const scaledBodyTop = y + (high - bodyTop) * yScale;
  const scaledBodyBottom = y + (high - bodyBottom) * yScale;
  const scaledBodyHeight = Math.max(scaledBodyBottom - scaledBodyTop, 1);
  
  return (
    <g>
      {/* Wick */}
      <line
        x1={wickX}
        y1={scaledWickTop}
        x2={wickX}
        y2={scaledWickBottom}
        stroke={stroke}
        strokeWidth={1}
      />
      {/* Body */}
      <rect
        x={bodyX}
        y={scaledBodyTop}
        width={candleWidth}
        height={scaledBodyHeight}
        fill={fill}
        stroke={stroke}
        strokeWidth={1}
        rx={1}
      />
    </g>
  );
};

// Custom tooltip
const CustomTooltip = ({ active, payload }: any) => {
  if (active && payload && payload.length) {
    const data = payload[0].payload;
    const isGreen = data.close >= data.open;
    const change = data.close - data.open;
    const changePercent = ((change / data.open) * 100).toFixed(2);
    
    return (
      <div className="bg-white/95 backdrop-blur-sm border border-emerald-200 rounded-lg p-3 shadow-xl">
        <p className="text-xs text-slate-500 mb-2">{data.time}</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm">
          <span className="text-slate-500">Open:</span>
          <span className="font-mono font-semibold text-slate-700">{data.open.toFixed(2)}</span>
          <span className="text-slate-500">High:</span>
          <span className="font-mono font-semibold text-emerald-600">{data.high.toFixed(2)}</span>
          <span className="text-slate-500">Low:</span>
          <span className="font-mono font-semibold text-red-500">{data.low.toFixed(2)}</span>
          <span className="text-slate-500">Close:</span>
          <span className={`font-mono font-semibold ${isGreen ? 'text-emerald-600' : 'text-red-500'}`}>
            {data.close.toFixed(2)}
          </span>
        </div>
        <div className={`mt-2 pt-2 border-t border-slate-100 flex items-center gap-1 ${isGreen ? 'text-emerald-600' : 'text-red-500'}`}>
          {isGreen ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
          <span className="font-mono text-sm font-semibold">
            {isGreen ? '+' : ''}{change.toFixed(2)} ({isGreen ? '+' : ''}{changePercent}%)
          </span>
        </div>
      </div>
    );
  }
  return null;
};

export function CandlestickChart({ symbol = "RELIANCE", onSymbolChange }: CandlestickChartProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(symbol);
  const [data, setData] = useState<CandleData[]>([]);
  const [isLive, setIsLive] = useState(true);
  
  const basePrice = getBasePrice(selectedSymbol);
  
  // Initialize data
  useEffect(() => {
    setData(generateInitialData(basePrice));
  }, [selectedSymbol, basePrice]);
  
  // Real-time updates
  useEffect(() => {
    if (!isLive || data.length === 0) return;
    
    const interval = setInterval(() => {
      setData(prevData => {
        if (prevData.length === 0) return prevData;
        
        const newCandle = generateNextCandle(prevData[prevData.length - 1], basePrice);
        const newData = [...prevData.slice(1), newCandle];
        return newData;
      });
    }, 2000); // Update every 2 seconds
    
    return () => clearInterval(interval);
  }, [isLive, basePrice, data.length]);
  
  const handleSymbolChange = (value: string) => {
    setSelectedSymbol(value);
    onSymbolChange?.(value);
  };
  
  const currentPrice = data.length > 0 ? data[data.length - 1].close : basePrice;
  const openPrice = data.length > 0 ? data[0].open : basePrice;
  const priceChange = currentPrice - openPrice;
  const priceChangePercent = ((priceChange / openPrice) * 100).toFixed(2);
  const isPositive = priceChange >= 0;
  
  const minPrice = data.length > 0 ? Math.min(...data.map(d => d.low)) * 0.999 : basePrice * 0.99;
  const maxPrice = data.length > 0 ? Math.max(...data.map(d => d.high)) * 1.001 : basePrice * 1.01;
  
  return (
    <Card className="shadow-md border border-emerald-100">
      <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100 pb-4">
        <div className="flex items-center justify-between flex-wrap gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg shadow-md">
              <Activity className="h-5 w-5 text-white" />
            </div>
            <div>
              <CardTitle className="text-xl font-bold text-slate-800">Live Market Chart</CardTitle>
              <p className="text-sm text-slate-500">Real-time candlestick visualization</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            <Select value={selectedSymbol} onValueChange={handleSymbolChange}>
              <SelectTrigger className="w-[180px] bg-white border-emerald-200">
                <SelectValue placeholder="Select symbol" />
              </SelectTrigger>
              <SelectContent>
                {SYMBOLS.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.value}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            <Badge 
              variant={isLive ? "default" : "secondary"}
              className={`flex items-center gap-1 ${isLive ? 'bg-emerald-500 hover:bg-emerald-600' : ''}`}
              onClick={() => setIsLive(!isLive)}
              style={{ cursor: 'pointer' }}
            >
              <Zap className={`h-3 w-3 ${isLive ? 'animate-pulse' : ''}`} />
              {isLive ? 'LIVE' : 'PAUSED'}
            </Badge>
          </div>
        </div>
        
        {/* Price info */}
        <div className="flex items-center gap-6 mt-4 pt-4 border-t border-emerald-100">
          <div>
            <p className="text-xs text-slate-500 uppercase tracking-wide">Current Price</p>
            <p className="text-2xl font-mono font-bold text-slate-800">
              {selectedSymbol.includes('USD') ? '$' : '₹'}{currentPrice.toFixed(2)}
            </p>
          </div>
          <div className={`flex items-center gap-1 px-3 py-1.5 rounded-lg ${isPositive ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
            {isPositive ? <TrendingUp className="h-4 w-4" /> : <TrendingDown className="h-4 w-4" />}
            <span className="font-mono font-semibold">
              {isPositive ? '+' : ''}{priceChange.toFixed(2)} ({isPositive ? '+' : ''}{priceChangePercent}%)
            </span>
          </div>
          <div className="text-xs text-slate-400">
            Updated every 2s
          </div>
        </div>
      </CardHeader>
      
      <CardContent className="pt-6">
        <div className="h-[400px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <ComposedChart
              data={data}
              margin={{ top: 10, right: 30, left: 0, bottom: 0 }}
            >
              <XAxis 
                dataKey="time" 
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                interval="preserveStartEnd"
              />
              <YAxis 
                domain={[minPrice, maxPrice]}
                axisLine={false}
                tickLine={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                tickFormatter={(value) => value.toFixed(selectedSymbol.includes('USD') ? 4 : 0)}
                width={60}
              />
              <Tooltip content={<CustomTooltip />} />
              <ReferenceLine y={openPrice} stroke="#94a3b8" strokeDasharray="3 3" />
              <Bar
                dataKey="high"
                shape={<Candlestick />}
                isAnimationActive={false}
              >
                {data.map((entry, index) => (
                  <Cell key={`cell-${index}`} />
                ))}
              </Bar>
            </ComposedChart>
          </ResponsiveContainer>
        </div>
        
        {/* Volume indicator */}
        <div className="mt-4 pt-4 border-t border-emerald-100">
          <p className="text-xs text-slate-500 mb-2">Volume (Last 30 candles)</p>
          <div className="flex items-end gap-0.5 h-12">
            {data.map((candle, i) => {
              const maxVol = Math.max(...data.map(d => d.volume));
              const height = (candle.volume / maxVol) * 100;
              const isGreen = candle.close >= candle.open;
              return (
                <div
                  key={i}
                  className={`flex-1 rounded-t ${isGreen ? 'bg-emerald-400' : 'bg-red-400'}`}
                  style={{ height: `${height}%`, opacity: 0.7 }}
                />
              );
            })}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CandlestickChart;
