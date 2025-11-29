import { useState, useRef } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Play, Copy, Check } from "lucide-react";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { DevLogsViewer } from "@/components/dev-logs-viewer";
import { devLogger } from "@/lib/dev-logger";
import { STRATEGY_VARIABLES, STRATEGY_OPERATORS, STRATEGY_FUNCTIONS } from "@/lib/strategy-variables";
import { useToast } from "@/hooks/use-toast";

const DEFAULT_FORMULA = `// Available variables:
// price, ema50, ema200, high, low, open, close, volume

// Example: Price above EMA50 AND EMA50 above EMA200
price > ema50 && ema50 > ema200`;

export default function DevStrategyBuilder() {
  const [name, setName] = useState("My Code Strategy");
  const [description, setDescription] = useState("");
  const [formula, setFormula] = useState(DEFAULT_FORMULA);
  const [timeframe, setTimeframe] = useState("5m");
  const formulaRef = useRef<HTMLTextAreaElement>(null);
  const { toast } = useToast();

  const createMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/strategies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      devLogger.info("Strategy created successfully", { name });
      toast({
        title: "Strategy created",
        description: "Your code-based strategy has been created.",
      });
    },
    onError: (error: any) => {
      devLogger.error("Failed to create strategy", { error: error.message });
      toast({
        title: "Error",
        description: "Failed to create strategy.",
        variant: "destructive",
      });
    },
  });

  const testFormula = () => {
    devLogger.info("Testing formula", { formula });

    try {
      const testData = {
        price: 100,
        ema50: 99,
        ema200: 98,
        high: 102,
        low: 99,
        open: 100.5,
        close: 100.25,
        volume: 1500000,
      };

      const fn = new Function(
        "price",
        "ema50",
        "ema200",
        "high",
        "low",
        "open",
        "close",
        "volume",
        `return ${formula}`
      );

      const result = fn(
        testData.price,
        testData.ema50,
        testData.ema200,
        testData.high,
        testData.low,
        testData.open,
        testData.close,
        testData.volume
      );

      devLogger.info("Formula result", { result, testData });

      toast({
        title: "Formula valid",
        description: `Result: ${result}`,
      });
    } catch (error: any) {
      devLogger.error("Formula error", { error: error.message });
      toast({
        title: "Formula error",
        description: error.message,
        variant: "destructive",
      });
    }
  };

  const createStrategy = () => {
    if (!name || !formula) {
      devLogger.warn("Missing required fields", { name, formula });
      toast({
        title: "Validation error",
        description: "Please enter strategy name and formula.",
        variant: "destructive",
      });
      return;
    }

    devLogger.info("Creating strategy", { name, timeframe, formula });

    createMutation.mutate({
      name,
      description,
      type: `code_${Date.now()}`,
      timeframe,
      conditions: { formula },
      isCustom: true,
      enabled: true,
      formula: null,
    });
  };

  return (
    <div className="space-y-6 hacker-mode">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold text-green-400 font-mono">
          DEV STRATEGY BUILDER
        </h1>
        <p className="text-green-300 text-sm">Write trading strategies in code</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
        {/* Left: Code Editor */}
        <div className="lg:col-span-2 space-y-4 flex flex-col">
          <Card className="flex-1 flex flex-col border-l-4 border-l-green-500 bg-black">
            <CardHeader className="pb-3">
              <CardTitle className="text-sm font-mono text-green-400">CODE EDITOR</CardTitle>
            </CardHeader>
            <CardContent className="flex-1 p-0 overflow-hidden">
              <Textarea
                ref={formulaRef}
                value={formula}
                onChange={(e) => setFormula(e.target.value)}
                className="h-full min-h-96 rounded-none border-0 font-mono text-xs bg-black text-green-400 resize-none focus-visible:ring-0 focus-visible:ring-offset-0 p-4"
                placeholder="Write your strategy formula..."
                data-testid="textarea-formula"
              />
            </CardContent>
          </Card>

          <div className="space-y-2">
            <div className="grid grid-cols-2 gap-2">
              <div className="space-y-2">
                <Label htmlFor="strategy-name" className="text-green-400 text-xs font-mono">
                  Strategy Name
                </Label>
                <Input
                  id="strategy-name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="bg-black border-green-500/30 text-green-400 text-sm font-mono"
                  data-testid="input-strategy-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="timeframe" className="text-green-400 text-xs font-mono">
                  Timeframe
                </Label>
                <select
                  id="timeframe"
                  value={timeframe}
                  onChange={(e) => setTimeframe(e.target.value)}
                  className="w-full px-3 py-2 rounded bg-black border border-green-500/30 text-green-400 text-sm font-mono"
                >
                  <option value="5m">5m</option>
                  <option value="15m">15m</option>
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="description" className="text-green-400 text-xs font-mono">
                Description (optional)
              </Label>
              <Input
                id="description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="bg-black border-green-500/30 text-green-400 text-sm font-mono"
                placeholder="What does this strategy do?"
                data-testid="input-description"
              />
            </div>
            <div className="flex gap-2 pt-2">
              <Button
                onClick={testFormula}
                className="flex-1 bg-green-600 hover:bg-green-700 text-black font-mono text-sm"
                data-testid="button-test-formula"
              >
                <Play className="h-4 w-4 mr-2" />
                Test Formula
              </Button>
              <Button
                onClick={createStrategy}
                disabled={createMutation.isPending}
                className="flex-1 bg-green-500 hover:bg-green-600 text-black font-mono text-sm"
                data-testid="button-create-strategy"
              >
                {createMutation.isPending ? "Creating..." : "Create Strategy"}
              </Button>
            </div>
          </div>
        </div>

        {/* Right: Reference & Logs */}
        <div className="space-y-4 flex flex-col overflow-hidden">
          <Tabs defaultValue="variables" className="flex-1 flex flex-col">
            <TabsList className="grid w-full grid-cols-3 bg-black border-b border-green-500/30">
              <TabsTrigger value="variables" className="text-green-300 data-[state=active]:text-green-400">
                Variables
              </TabsTrigger>
              <TabsTrigger value="operators" className="text-green-300 data-[state=active]:text-green-400">
                Operators
              </TabsTrigger>
              <TabsTrigger value="functions" className="text-green-300 data-[state=active]:text-green-400">
                Functions
              </TabsTrigger>
            </TabsList>

            <TabsContent value="variables" className="flex-1 overflow-y-auto">
              <div className="space-y-2 p-3">
                {Object.entries(STRATEGY_VARIABLES).map(([key, value]) => (
                  <div
                    key={key}
                    className="p-2 bg-black border border-green-500/20 rounded text-xs font-mono hover-elevate cursor-pointer"
                    onClick={() => {
                      if (formulaRef.current) {
                        formulaRef.current.value += key;
                        setFormula(formulaRef.current.value);
                      }
                    }}
                  >
                    <div className="flex items-center justify-between gap-1">
                      <span className="text-green-400 font-bold">{key}</span>
                      <Badge variant="outline" className="text-xs text-green-300">
                        {value.type}
                      </Badge>
                    </div>
                    <p className="text-green-300/70 text-xs mt-1">{value.description}</p>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="operators" className="flex-1 overflow-y-auto">
              <div className="space-y-2 p-3">
                {Object.entries(STRATEGY_OPERATORS).map(([key, value]) => (
                  <div
                    key={key}
                    className="p-2 bg-black border border-green-500/20 rounded text-xs font-mono hover-elevate cursor-pointer"
                    onClick={() => {
                      if (formulaRef.current) {
                        formulaRef.current.value += ` ${key} `;
                        setFormula(formulaRef.current.value);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-yellow-400 font-bold">{key}</span>
                      <span className="text-green-300/70">{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>

            <TabsContent value="functions" className="flex-1 overflow-y-auto">
              <div className="space-y-2 p-3">
                {Object.entries(STRATEGY_FUNCTIONS).map(([key, value]) => (
                  <div
                    key={key}
                    className="p-2 bg-black border border-green-500/20 rounded text-xs font-mono hover-elevate cursor-pointer"
                    onClick={() => {
                      if (formulaRef.current) {
                        formulaRef.current.value += key;
                        setFormula(formulaRef.current.value);
                      }
                    }}
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-blue-400 font-bold">{key}</span>
                      <span className="text-green-300/70">{value}</span>
                    </div>
                  </div>
                ))}
              </div>
            </TabsContent>
          </Tabs>

          <DevLogsViewer />
        </div>
      </div>
    </div>
  );
}
