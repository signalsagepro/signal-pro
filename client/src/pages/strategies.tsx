import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Plus, TrendingUp, Edit, Trash2, ChevronDown, ChevronUp, Merge, Info } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/use-auth";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { Strategy, InsertStrategy } from "@shared/schema";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";

const PRESET_STRATEGIES = [
  {
    name: "15M Above 50 EMA Bullish",
    type: "15m_above_50_bullish",
    timeframe: "15m",
    description: "Signal when 15-min candle closes above 50 EMA with EMA50 > EMA200",
    conditions: {
      priceAbove: "ema50",
      ema50Above: "ema200",
      candleClose: true,
    },
  },
  {
    name: "5M Above 200 EMA Reversal",
    type: "5m_above_200_reversal",
    timeframe: "5m",
    description: "Signal when 5-min candle closes above 200 EMA with EMA200 > EMA50",
    conditions: {
      priceAboveOrOn: "ema200",
      ema200Above: "ema50",
      candleClose: true,
    },
  },
  {
    name: "5M Pullback to 200 EMA",
    type: "5m_pullback_to_200",
    timeframe: "5m",
    description: "Signal when price touches or closes at 200 EMA with Price > EMA50 > EMA200",
    conditions: {
      ema50Above: "ema200",
      priceTouchesOrCloses: "ema200",
      priceAbove: "ema50",
    },
  },
  {
    name: "5M Below 200 EMA Bearish",
    type: "5m_below_200_bearish",
    timeframe: "5m",
    description: "Signal when 5-min candle closes on or below 200 EMA with EMA50 > EMA200",
    conditions: {
      ema50Above: "ema200",
      priceOnOrBelow: "ema200",
      candleClose: true,
    },
  },
  {
    name: "5M Touch 200 Downtrend",
    type: "5m_touch_200_downtrend",
    timeframe: "5m",
    description: "Signal when candle touches or closes on 200 EMA with EMA200 > EMA50 > Price",
    conditions: {
      ema200Above: "ema50",
      ema50Above: "price",
      priceTouchesOrCloses: "ema200",
    },
  },
  {
    name: "15M Below 200 Breakdown",
    type: "15m_below_200_breakdown",
    timeframe: "15m",
    description: "Signal when 15-min candle closes below 200 EMA with EMA50 > EMA200 > Price",
    conditions: {
      ema50Above: "ema200",
      ema200Above: "price",
      candleClose: true,
    },
  },
];

const STRATEGY_FORMULAS = {
  "15m_above_50_bullish": {
    formula: "Price > EMA50 AND EMA50 > EMA200",
    example: "Price: $100 | EMA50: $99 | EMA200: $98 ✓ Signal fires",
  },
  "5m_above_200_reversal": {
    formula: "Price >= EMA200 AND EMA200 > EMA50",
    example: "Price: $100 | EMA200: $99 | EMA50: $98 ✓ Signal fires",
  },
  "5m_pullback_to_200": {
    formula: "Price >= EMA200 AND EMA50 > EMA200 AND Price > EMA50",
    example: "Price touches 200EMA | EMA50 > EMA200 | Price recovers above EMA50",
  },
  "5m_below_200_bearish": {
    formula: "Price <= EMA200 AND EMA50 > EMA200",
    example: "Price: $98 | EMA200: $99 | EMA50: $100 ✓ Signal fires",
  },
  "5m_touch_200_downtrend": {
    formula: "EMA200 > EMA50 > Price AND Price touches EMA200",
    example: "EMA200: $100 | EMA50: $99 | Price: $98.5 touches $100",
  },
  "15m_below_200_breakdown": {
    formula: "Price <= EMA200 AND EMA50 > EMA200 > Price",
    example: "Price: $97 | EMA200: $99 | EMA50: $100 ✓ Signal fires",
  },
};

export default function Strategies() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isInfoDialogOpen, setIsInfoDialogOpen] = useState(false);
  const [selectedFormulaKey, setSelectedFormulaKey] = useState<string | null>(null);
  const [editingStrategy, setEditingStrategy] = useState<Strategy | null>(null);
  const [expandedStrategies, setExpandedStrategies] = useState<Set<string>>(new Set());
  const [mergeMode, setMergeMode] = useState(false);
  const [selectedStrategies, setSelectedStrategies] = useState<string[]>([]);
  const [mergeLogic, setMergeLogic] = useState<"AND" | "OR">("AND");
  const [mergeTimeWindow, setMergeTimeWindow] = useState(60);
  const { toast } = useToast();
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";

  const { data: strategies = [], isLoading } = useQuery<Strategy[]>({
    queryKey: ["/api/strategies"],
  });

  const createMutation = useMutation({
    mutationFn: (data: InsertStrategy) => apiRequest("POST", "/api/strategies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      setIsAddDialogOpen(false);
      toast({
        title: "Strategy created",
        description: "Your strategy has been created successfully.",
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<Strategy> }) =>
      apiRequest("PATCH", `/api/strategies/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({
        title: "Strategy updated",
        description: "Your strategy has been updated successfully.",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => apiRequest("DELETE", `/api/strategies/${id}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({
        title: "Strategy deleted",
        description: "The strategy has been deleted.",
      });
    },
  });

  const mergeMutation = useMutation({
    mutationFn: ({ strategy1Id, strategy2Id, logic, timeWindow }: { strategy1Id: string; strategy2Id: string; logic: "AND" | "OR"; timeWindow: number }) =>
      apiRequest("POST", "/api/strategies/merge", { strategy1Id, strategy2Id, logic, timeWindow }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      setMergeMode(false);
      setSelectedStrategies([]);
      setMergeTimeWindow(60);
      toast({
        title: "Strategies merged",
        description: "A new merged strategy has been created.",
      });
    },
  });

  const handleToggleStrategy = (strategy: Strategy) => {
    updateMutation.mutate({
      id: strategy.id,
      data: { enabled: !strategy.enabled },
    });
  };

  const handleAddPreset = (preset: typeof PRESET_STRATEGIES[0]) => {
    createMutation.mutate({
      name: preset.name,
      description: preset.description,
      type: preset.type,
      timeframe: preset.timeframe,
      conditions: preset.conditions,
      enabled: true,
      isCustom: false,
    });
  };

  const toggleExpanded = (id: string) => {
    setExpandedStrategies((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const toggleStrategySelection = (id: string) => {
    setSelectedStrategies((prev) => {
      if (prev.includes(id)) {
        return prev.filter((s) => s !== id);
      } else if (prev.length < 2) {
        return [...prev, id];
      }
      return prev;
    });
  };

  const handleMerge = () => {
    if (selectedStrategies.length === 2) {
      mergeMutation.mutate({
        strategy1Id: selectedStrategies[0],
        strategy2Id: selectedStrategies[1],
        logic: mergeLogic,
        timeWindow: mergeTimeWindow,
      });
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="space-y-2">
          <h1 className="text-3xl font-bold" data-testid="heading-strategies">
            Strategies
          </h1>
          <p className="text-base text-muted-foreground">
            {isAdmin ? "Build and manage your trading strategies" : "View active trading strategies"}
          </p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2 flex-wrap">
            {!mergeMode && (
              <Button
                variant="outline"
                onClick={() => setMergeMode(true)}
                disabled={strategies.length < 2}
                data-testid="button-merge-strategies"
                className="gap-2"
              >
                <Merge className="h-4 w-4" />
                <span className="hidden sm:inline">Merge</span>
              </Button>
            )}
            <Button
              onClick={() => setIsAddDialogOpen(true)}
              data-testid="button-add-strategy"
              className="gap-2"
            >
              <Plus className="h-4 w-4" />
              <span className="hidden sm:inline">Add Strategy</span>
              <span className="sm:hidden">Add</span>
            </Button>
          </div>
        )}
      </div>

      {mergeMode && (
        <Card className="border-chart-2">
          <CardHeader>
            <CardTitle className="text-base">Merge Strategies</CardTitle>
            <CardDescription>Select 2 strategies to merge with AND/OR logic</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {strategies.map((strategy) => (
                <Card
                  key={strategy.id}
                  className={`cursor-pointer transition-all ${
                    selectedStrategies.includes(strategy.id)
                      ? "ring-2 ring-chart-1 bg-muted"
                      : "hover-elevate"
                  }`}
                  onClick={() => toggleStrategySelection(strategy.id)}
                  data-testid={`card-merge-${strategy.id}`}
                >
                  <CardHeader>
                    <CardTitle className="text-sm">{strategy.name}</CardTitle>
                  </CardHeader>
                </Card>
              ))}
            </div>
            {selectedStrategies.length === 2 && (
              <div className="space-y-4">
                <div className="flex items-center gap-4">
                  <Button
                    size="sm"
                    variant={mergeLogic === "AND" ? "default" : "outline"}
                    onClick={() => setMergeLogic("AND")}
                    className="flex-1"
                    data-testid="button-logic-and"
                  >
                    AND
                  </Button>
                  <Button
                    size="sm"
                    variant={mergeLogic === "OR" ? "default" : "outline"}
                    onClick={() => setMergeLogic("OR")}
                    className="flex-1"
                    data-testid="button-logic-or"
                  >
                    OR
                  </Button>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="merge-time-window">Time Window (seconds)</Label>
                  <Input
                    id="merge-time-window"
                    type="number"
                    min="1"
                    value={mergeTimeWindow}
                    onChange={(e) => setMergeTimeWindow(Math.max(1, parseInt(e.target.value) || 60))}
                    placeholder="60"
                    data-testid="input-merge-time-window"
                  />
                  <p className="text-xs text-muted-foreground">Only trigger if both strategies fire within this window</p>
                </div>
              </div>
            )}
          </CardContent>
          <CardFooter className="flex gap-2 justify-end border-t pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setMergeMode(false);
                setSelectedStrategies([]);
              }}
              data-testid="button-cancel-merge"
            >
              Cancel
            </Button>
            <Button
              onClick={handleMerge}
              disabled={selectedStrategies.length !== 2 || mergeMutation.isPending}
              data-testid="button-confirm-merge"
            >
              {mergeMutation.isPending ? "Merging..." : "Merge"}
            </Button>
          </CardFooter>
        </Card>
      )}

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardHeader>
            </Card>
          ))}
        </div>
      ) : strategies.length === 0 ? (
        <Card>
          <CardContent className="pt-12 pb-12">
            <div className="text-center">
              <TrendingUp className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">{isAdmin ? "No strategies yet" : "No active strategies"}</h3>
              <p className="text-sm text-muted-foreground mb-6">
                {isAdmin ? "Get started by adding a preset strategy" : "Check back later for active strategies"}
              </p>
              {isAdmin && (
                <Button onClick={() => setIsAddDialogOpen(true)} data-testid="button-add-first-strategy">
                  <Plus className="h-4 w-4 mr-2" />
                  Add Your First Strategy
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {strategies.map((strategy) => {
            const isExpanded = expandedStrategies.has(strategy.id);
            
            return (
              <Card key={strategy.id} data-testid={`strategy-${strategy.id}`} className={mergeMode ? "cursor-pointer" : ""}>
                <CardHeader className="flex flex-row items-start justify-between gap-4 space-y-0">
                  <div 
                    className="flex-1 space-y-2"
                    onClick={mergeMode ? () => toggleStrategySelection(strategy.id) : undefined}
                  >
                    <div className="flex items-center gap-2 flex-wrap">
                      <CardTitle className="text-base">{strategy.name}</CardTitle>
                      <Badge variant="outline" className="text-xs">
                        {strategy.timeframe.toUpperCase()}
                      </Badge>
                      {strategy.isCustom && (
                        <Badge variant="secondary" className="text-xs">
                          Custom
                        </Badge>
                      )}
                      {!strategy.isCustom && STRATEGY_FORMULAS[strategy.type as keyof typeof STRATEGY_FORMULAS] && (
                        <Popover>
                          <PopoverTrigger asChild>
                            <button 
                              className="p-1 hover:bg-muted rounded transition-colors"
                              onClick={(e) => e.stopPropagation()}
                              data-testid={`button-info-${strategy.id}`}
                            >
                              <Info className="h-4 w-4 text-muted-foreground" />
                            </button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 text-sm">
                            <div className="space-y-3">
                              <div>
                                <h4 className="font-semibold mb-2">Formula</h4>
                                <code className="block bg-muted p-2 rounded text-xs font-mono break-words">
                                  {STRATEGY_FORMULAS[strategy.type as keyof typeof STRATEGY_FORMULAS]?.formula}
                                </code>
                              </div>
                              <div>
                                <h4 className="font-semibold mb-2">Example</h4>
                                <div className="bg-muted p-2 rounded text-xs">
                                  {STRATEGY_FORMULAS[strategy.type as keyof typeof STRATEGY_FORMULAS]?.example}
                                </div>
                              </div>
                            </div>
                          </PopoverContent>
                        </Popover>
                      )}
                    </div>
                    {strategy.description && (
                      <CardDescription className="text-sm">
                        {strategy.description}
                      </CardDescription>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {mergeMode && isAdmin ? (
                      <div className={`w-5 h-5 border-2 rounded ${selectedStrategies.includes(strategy.id) ? 'bg-chart-1 border-chart-1' : 'border-muted-foreground'}`} />
                    ) : isAdmin ? (
                      <Switch
                        checked={strategy.enabled}
                        onCheckedChange={() => handleToggleStrategy(strategy)}
                        data-testid={`switch-strategy-${strategy.id}`}
                      />
                    ) : (
                      <Badge variant={strategy.enabled ? "default" : "secondary"}>
                        {strategy.enabled ? "Active" : "Inactive"}
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent>
                  <Collapsible open={isExpanded} onOpenChange={() => toggleExpanded(strategy.id)}>
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-4 text-xs font-mono text-muted-foreground">
                        <span>Signals: {strategy.signalCount}</span>
                        <span>Type: {strategy.type}</span>
                      </div>
                      <CollapsibleTrigger asChild>
                        <Button variant="ghost" size="sm" data-testid={`button-expand-${strategy.id}`}>
                          {isExpanded ? (
                            <ChevronUp className="h-4 w-4" />
                          ) : (
                            <ChevronDown className="h-4 w-4" />
                          )}
                        </Button>
                      </CollapsibleTrigger>
                    </div>
                    <CollapsibleContent className="space-y-4">
                      <div className="rounded-md bg-muted p-4">
                        <h4 className="text-xs font-medium mb-3">Conditions</h4>
                        <div className="space-y-2 text-xs font-mono">
                          {Object.entries(strategy.conditions as Record<string, any>).map(
                            ([key, value]) => (
                              <div key={key} className="flex items-center gap-2">
                                <span className="text-muted-foreground">{key}:</span>
                                <span className="text-foreground">
                                  {typeof value === "boolean"
                                    ? value.toString()
                                    : JSON.stringify(value)}
                                </span>
                              </div>
                            )
                          )}
                        </div>
                      </div>
                    </CollapsibleContent>
                  </Collapsible>
                </CardContent>
                {isAdmin && (
                  <CardFooter className="flex items-center gap-2 justify-end border-t pt-4">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        if (confirm("Are you sure you want to delete this strategy?")) {
                          deleteMutation.mutate(strategy.id);
                        }
                      }}
                      data-testid={`button-delete-${strategy.id}`}
                    >
                      <Trash2 className="h-4 w-4 mr-2" />
                      Delete
                    </Button>
                  </CardFooter>
                )}
              </Card>
            );
          })}
        </div>
      )}

      {isAdmin && (
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Add Strategy</DialogTitle>
              <DialogDescription>
                Select a preset strategy to add to your collection
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4">
              {PRESET_STRATEGIES.map((preset) => {
                const alreadyAdded = strategies.some((s) => s.type === preset.type);
                
                return (
                  <Card key={preset.type} className={alreadyAdded ? "opacity-50" : ""}>
                    <CardHeader>
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1 space-y-2">
                          <div className="flex items-center gap-2">
                            <CardTitle className="text-sm">{preset.name}</CardTitle>
                            <Badge variant="outline" className="text-xs">
                              {preset.timeframe.toUpperCase()}
                            </Badge>
                          </div>
                          <CardDescription className="text-xs">
                            {preset.description}
                          </CardDescription>
                        </div>
                        <Button
                          size="sm"
                          onClick={() => handleAddPreset(preset)}
                          disabled={alreadyAdded || createMutation.isPending}
                          data-testid={`button-add-preset-${preset.type}`}
                        >
                          {alreadyAdded ? "Added" : "Add"}
                        </Button>
                      </div>
                    </CardHeader>
                  </Card>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
