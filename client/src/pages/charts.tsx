import { useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
  Minus,
  MousePointer2,
  Play,
  Pause,
  LineChart,
  ArrowUpRight,
  ArrowDownRight,
  Lock,
} from "lucide-react";
import { TradingChart } from "@/components/trading-chart";
import { useDashboardConfig } from "@/hooks/use-dashboard-config";

// NSE F&O Stocks (Top stocks available for Futures & Options trading)
const STOCKS = [
  // NIFTY 50 F&O Stocks
  { symbol: "RELIANCE", name: "Reliance Industries", basePrice: 2450, color: "#10b981" },
  { symbol: "TCS", name: "Tata Consultancy Services", basePrice: 3890, color: "#3b82f6" },
  { symbol: "HDFCBANK", name: "HDFC Bank", basePrice: 1650, color: "#f59e0b" },
  { symbol: "INFY", name: "Infosys", basePrice: 1520, color: "#8b5cf6" },
  { symbol: "ICICIBANK", name: "ICICI Bank", basePrice: 1180, color: "#ec4899" },
  { symbol: "HINDUNILVR", name: "Hindustan Unilever", basePrice: 2350, color: "#06b6d4" },
  { symbol: "SBIN", name: "State Bank of India", basePrice: 780, color: "#84cc16" },
  { symbol: "BHARTIARTL", name: "Bharti Airtel", basePrice: 1580, color: "#f97316" },
  { symbol: "ITC", name: "ITC Limited", basePrice: 465, color: "#14b8a6" },
  { symbol: "KOTAKBANK", name: "Kotak Mahindra Bank", basePrice: 1780, color: "#a855f7" },
  { symbol: "LT", name: "Larsen & Toubro", basePrice: 3450, color: "#ef4444" },
  { symbol: "AXISBANK", name: "Axis Bank", basePrice: 1120, color: "#eab308" },
  { symbol: "ASIANPAINT", name: "Asian Paints", basePrice: 2890, color: "#22c55e" },
  { symbol: "MARUTI", name: "Maruti Suzuki", basePrice: 11250, color: "#0ea5e9" },
  { symbol: "HCLTECH", name: "HCL Technologies", basePrice: 1680, color: "#f43f5e" },
  { symbol: "SUNPHARMA", name: "Sun Pharma", basePrice: 1780, color: "#8b5cf6" },
  { symbol: "TITAN", name: "Titan Company", basePrice: 3250, color: "#06b6d4" },
  { symbol: "BAJFINANCE", name: "Bajaj Finance", basePrice: 6890, color: "#10b981" },
  { symbol: "WIPRO", name: "Wipro", basePrice: 450, color: "#3b82f6" },
  { symbol: "ULTRACEMCO", name: "UltraTech Cement", basePrice: 11450, color: "#f59e0b" },
  { symbol: "TATAMOTORS", name: "Tata Motors", basePrice: 950, color: "#ec4899" },
  { symbol: "NTPC", name: "NTPC Limited", basePrice: 385, color: "#84cc16" },
  { symbol: "POWERGRID", name: "Power Grid Corp", basePrice: 320, color: "#f97316" },
  { symbol: "M&M", name: "Mahindra & Mahindra", basePrice: 2850, color: "#14b8a6" },
  { symbol: "TATASTEEL", name: "Tata Steel", basePrice: 145, color: "#a855f7" },
  { symbol: "ONGC", name: "ONGC", basePrice: 265, color: "#ef4444" },
  { symbol: "JSWSTEEL", name: "JSW Steel", basePrice: 890, color: "#eab308" },
  { symbol: "ADANIENT", name: "Adani Enterprises", basePrice: 2450, color: "#22c55e" },
  { symbol: "ADANIPORTS", name: "Adani Ports", basePrice: 1280, color: "#0ea5e9" },
  { symbol: "COALINDIA", name: "Coal India", basePrice: 485, color: "#f43f5e" },
  { symbol: "BPCL", name: "BPCL", basePrice: 625, color: "#8b5cf6" },
  { symbol: "GRASIM", name: "Grasim Industries", basePrice: 2650, color: "#06b6d4" },
  { symbol: "DRREDDY", name: "Dr. Reddy's Labs", basePrice: 1245, color: "#10b981" },
  { symbol: "CIPLA", name: "Cipla", basePrice: 1520, color: "#3b82f6" },
  { symbol: "DIVISLAB", name: "Divi's Laboratories", basePrice: 4850, color: "#f59e0b" },
  { symbol: "APOLLOHOSP", name: "Apollo Hospitals", basePrice: 6780, color: "#ec4899" },
  { symbol: "EICHERMOT", name: "Eicher Motors", basePrice: 4650, color: "#84cc16" },
  { symbol: "HEROMOTOCO", name: "Hero MotoCorp", basePrice: 4280, color: "#f97316" },
  { symbol: "BAJAJ-AUTO", name: "Bajaj Auto", basePrice: 9450, color: "#14b8a6" },
  { symbol: "BAJAJFINSV", name: "Bajaj Finserv", basePrice: 1680, color: "#a855f7" },
  { symbol: "BRITANNIA", name: "Britannia Industries", basePrice: 5450, color: "#ef4444" },
  { symbol: "NESTLEIND", name: "Nestle India", basePrice: 2480, color: "#eab308" },
  { symbol: "TECHM", name: "Tech Mahindra", basePrice: 1650, color: "#22c55e" },
  { symbol: "INDUSINDBK", name: "IndusInd Bank", basePrice: 1480, color: "#0ea5e9" },
  { symbol: "SBILIFE", name: "SBI Life Insurance", basePrice: 1580, color: "#f43f5e" },
  { symbol: "HDFCLIFE", name: "HDFC Life", basePrice: 645, color: "#8b5cf6" },
  { symbol: "TATACONSUM", name: "Tata Consumer", basePrice: 1120, color: "#06b6d4" },
  { symbol: "HINDALCO", name: "Hindalco", basePrice: 625, color: "#10b981" },
  { symbol: "VEDL", name: "Vedanta", basePrice: 445, color: "#3b82f6" },
  // Bank Nifty F&O
  { symbol: "BANDHANBNK", name: "Bandhan Bank", basePrice: 185, color: "#f59e0b" },
  { symbol: "FEDERALBNK", name: "Federal Bank", basePrice: 165, color: "#ec4899" },
  { symbol: "IDFCFIRSTB", name: "IDFC First Bank", basePrice: 72, color: "#84cc16" },
  { symbol: "PNB", name: "Punjab National Bank", basePrice: 105, color: "#f97316" },
  { symbol: "BANKBARODA", name: "Bank of Baroda", basePrice: 265, color: "#14b8a6" },
  // Other Popular F&O
  { symbol: "ZOMATO", name: "Zomato", basePrice: 265, color: "#a855f7" },
  { symbol: "PAYTM", name: "One97 Communications", basePrice: 385, color: "#ef4444" },
  { symbol: "NYKAA", name: "FSN E-Commerce", basePrice: 165, color: "#eab308" },
  { symbol: "DELHIVERY", name: "Delhivery", basePrice: 385, color: "#22c55e" },
  { symbol: "POLICYBZR", name: "PB Fintech", basePrice: 1650, color: "#0ea5e9" },
  { symbol: "IRCTC", name: "IRCTC", basePrice: 885, color: "#f43f5e" },
  { symbol: "HAL", name: "Hindustan Aeronautics", basePrice: 4250, color: "#8b5cf6" },
  { symbol: "BEL", name: "Bharat Electronics", basePrice: 285, color: "#06b6d4" },
  { symbol: "DIXON", name: "Dixon Technologies", basePrice: 12450, color: "#10b981" },
  { symbol: "TRENT", name: "Trent", basePrice: 6850, color: "#3b82f6" },
];

// Major Forex Pairs
const FOREX_PAIRS = [
  { symbol: "USDINR", name: "US Dollar / Indian Rupee", basePrice: 84.25, color: "#10b981" },
  { symbol: "EURINR", name: "Euro / Indian Rupee", basePrice: 88.45, color: "#3b82f6" },
  { symbol: "GBPINR", name: "British Pound / Indian Rupee", basePrice: 105.80, color: "#f59e0b" },
  { symbol: "JPYINR", name: "Japanese Yen / Indian Rupee", basePrice: 0.55, color: "#ec4899" },
  { symbol: "EURUSD", name: "Euro / US Dollar", basePrice: 1.0520, color: "#8b5cf6" },
  { symbol: "GBPUSD", name: "British Pound / US Dollar", basePrice: 1.2565, color: "#06b6d4" },
  { symbol: "USDJPY", name: "US Dollar / Japanese Yen", basePrice: 153.25, color: "#84cc16" },
  { symbol: "AUDUSD", name: "Australian Dollar / US Dollar", basePrice: 0.6425, color: "#f97316" },
  { symbol: "USDCAD", name: "US Dollar / Canadian Dollar", basePrice: 1.4125, color: "#14b8a6" },
  { symbol: "USDCHF", name: "US Dollar / Swiss Franc", basePrice: 0.8925, color: "#a855f7" },
  { symbol: "NZDUSD", name: "New Zealand Dollar / US Dollar", basePrice: 0.5825, color: "#ef4444" },
  { symbol: "EURGBP", name: "Euro / British Pound", basePrice: 0.8365, color: "#eab308" },
  { symbol: "EURJPY", name: "Euro / Japanese Yen", basePrice: 161.25, color: "#22c55e" },
  { symbol: "GBPJPY", name: "British Pound / Japanese Yen", basePrice: 192.65, color: "#0ea5e9" },
  { symbol: "XAUUSD", name: "Gold / US Dollar", basePrice: 2650.50, color: "#fbbf24" },
  { symbol: "XAGUSD", name: "Silver / US Dollar", basePrice: 31.25, color: "#94a3b8" },
];

// Combined list for charts
const ALL_INSTRUMENTS = [...STOCKS, ...FOREX_PAIRS];

const DRAWING_TOOLS = [
  { id: "select", icon: MousePointer2, label: "Select", color: "#64748b" },
  { id: "horizontal", icon: Minus, label: "Horizontal Line", color: "#f59e0b" },
  { id: "support", icon: ArrowUpRight, label: "Support Line", color: "#10b981" },
  { id: "resistance", icon: ArrowDownRight, label: "Resistance Line", color: "#ef4444" },
];

// Main Charts Page
export default function Charts() {
  const [selectedStocks, setSelectedStocks] = useState<string[]>(["RELIANCE", "TCS"]);
  const [isLive, setIsLive] = useState(true);
  const [selectedTool, setSelectedTool] = useState("select");
  const { config, isLoaded } = useDashboardConfig();
  
  const addStock = (symbol: string) => {
    if (!selectedStocks.includes(symbol)) {
      setSelectedStocks(prev => [...prev, symbol]);
    }
  };
  
  const removeStock = (symbol: string) => {
    setSelectedStocks(prev => prev.filter(s => s !== symbol));
  };

  // Check if charts are enabled via API config
  if (isLoaded && !config.showChartsSection) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full">
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <div className="mx-auto w-16 h-16 bg-slate-100 rounded-full flex items-center justify-center mb-4">
                <Lock className="h-8 w-8 text-slate-400" />
              </div>
              <h3 className="text-xl font-semibold text-slate-800 mb-2">Charts Disabled</h3>
              <p className="text-slate-500 mb-4">
                Charts are currently disabled. Please contact your administrator to enable this feature.
              </p>
              <Badge variant="secondary" className="text-xs">
                Feature requires API enablement
              </Badge>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg">
            <LineChart className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-800">Live Charts</h1>
            <p className="text-slate-500 mt-1">Professional candlestick charts with drawing tools</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <Button
            variant={isLive ? "default" : "outline"}
            onClick={() => setIsLive(!isLive)}
            className={isLive ? "bg-emerald-500 hover:bg-emerald-600" : ""}
          >
            {isLive ? <Pause className="h-4 w-4 mr-2" /> : <Play className="h-4 w-4 mr-2" />}
            {isLive ? "Pause" : "Resume"}
          </Button>
        </div>
      </div>
      
      {/* Toolbar */}
      <Card className="shadow-md border border-emerald-100">
        <CardContent className="p-4">
          <div className="flex items-center justify-between flex-wrap gap-4">
            {/* Instrument Selector */}
            <div className="flex items-center gap-3">
              <span className="text-sm font-medium text-slate-600">Add Chart:</span>
              <Select onValueChange={addStock}>
                <SelectTrigger className="w-[280px] bg-white border-emerald-200">
                  <SelectValue placeholder="Select F&O Stock or Forex" />
                </SelectTrigger>
                <SelectContent className="max-h-[400px]">
                  <div className="px-2 py-1.5 text-xs font-semibold text-emerald-600 bg-emerald-50">NSE F&O Stocks</div>
                  {STOCKS.filter(s => !selectedStocks.includes(s.symbol)).slice(0, 30).map((stock) => (
                    <SelectItem key={stock.symbol} value={stock.symbol}>
                      {stock.symbol} - {stock.name}
                    </SelectItem>
                  ))}
                  <div className="px-2 py-1.5 text-xs font-semibold text-blue-600 bg-blue-50 mt-1">Forex Pairs</div>
                  {FOREX_PAIRS.filter(s => !selectedStocks.includes(s.symbol)).map((pair) => (
                    <SelectItem key={pair.symbol} value={pair.symbol}>
                      {pair.symbol} - {pair.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* Drawing Tools */}
            <div className="flex items-center gap-1">
              <span className="text-sm font-medium text-slate-600 mr-2">Draw:</span>
              {DRAWING_TOOLS.map((tool) => (
                <Button
                  key={tool.id}
                  variant={selectedTool === tool.id ? "default" : "ghost"}
                  size="sm"
                  onClick={() => setSelectedTool(tool.id)}
                  className={selectedTool === tool.id ? "bg-emerald-500 hover:bg-emerald-600" : "hover:bg-slate-100"}
                  title={tool.label}
                >
                  <tool.icon className="h-4 w-4" style={{ color: selectedTool === tool.id ? "white" : tool.color }} />
                </Button>
              ))}
            </div>
          </div>
          
          {/* Active Charts */}
          <div className="flex items-center gap-2 mt-4 pt-4 border-t border-slate-100">
            <span className="text-sm font-medium text-slate-600">Active Charts:</span>
            {selectedStocks.map((symbol) => {
              const instrument = ALL_INSTRUMENTS.find(s => s.symbol === symbol);
              return (
                <Badge
                  key={symbol}
                  variant="secondary"
                  className="px-3 py-1 cursor-pointer hover:bg-slate-200"
                  style={{ borderLeft: `3px solid ${instrument?.color}` }}
                  onClick={() => removeStock(symbol)}
                >
                  {symbol}
                  <span className="ml-2 text-slate-400">×</span>
                </Badge>
              );
            })}
            {selectedStocks.length === 0 && (
              <span className="text-sm text-slate-400">No charts selected</span>
            )}
          </div>
        </CardContent>
      </Card>
      
      {/* Drawing Tools Legend */}
      {selectedTool !== "select" && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-2 text-sm text-amber-800">
          <strong>{DRAWING_TOOLS.find(t => t.id === selectedTool)?.label}:</strong>
          {" "}Click on the chart to place the line at your desired price level.
        </div>
      )}
      
      {/* Charts Grid */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {selectedStocks.map((symbol) => {
          const instrument = ALL_INSTRUMENTS.find(s => s.symbol === symbol);
          if (!instrument) return null;
          
          return (
            <TradingChart
              key={symbol}
              symbol={instrument.symbol}
              name={instrument.name}
              basePrice={instrument.basePrice}
              color={instrument.color}
              isLive={isLive}
              selectedTool={selectedTool}
            />
          );
        })}
      </div>
      
      {selectedStocks.length === 0 && (
        <Card className="shadow-md border border-emerald-100">
          <CardContent className="py-16 text-center">
            <LineChart className="h-16 w-16 text-slate-300 mx-auto mb-4" />
            <h3 className="text-xl font-semibold text-slate-600 mb-2">No Charts Selected</h3>
            <p className="text-slate-500 mb-4">Add a stock from the dropdown above to start viewing live charts</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
