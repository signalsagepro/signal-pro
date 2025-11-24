import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Code2, Play, Save, AlertCircle, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";

export default function DevStrategyBuilder() {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeframe, setTimeframe] = useState<"5m" | "15m">("5m");
  const [formula, setFormula] = useState("");
  const [validationResult, setValidationResult] = useState<{
    valid: boolean;
    message: string;
  } | null>(null);
  const { toast } = useToast();

  const validateMutation = useMutation({
    mutationFn: (code: string) =>
      apiRequest("POST", "/api/strategies/validate", { formula: code }),
    onSuccess: (data: any) => {
      setValidationResult({ valid: true, message: data.message || "Formula is valid" });
    },
    onError: (error: any) => {
      setValidationResult({ valid: false, message: error.message || "Invalid formula" });
    },
  });

  const saveMutation = useMutation({
    mutationFn: (data: any) => apiRequest("POST", "/api/strategies", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/strategies"] });
      toast({
        title: "Strategy created",
        description: "Your custom strategy has been saved successfully.",
      });
      setName("");
      setDescription("");
      setFormula("");
      setValidationResult(null);
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to create strategy",
        variant: "destructive",
      });
    },
  });

  const handleValidate = () => {
    if (!formula.trim()) {
      setValidationResult({ valid: false, message: "Formula cannot be empty" });
      return;
    }
    validateMutation.mutate(formula);
  };

  const handleSave = () => {
    if (!name.trim() || !formula.trim()) {
      toast({
        title: "Validation Error",
        description: "Name and formula are required",
        variant: "destructive",
      });
      return;
    }

    saveMutation.mutate({
      name,
      description,
      timeframe,
      type: "custom",
      formula,
      conditions: { custom: true },
      enabled: true,
      isCustom: true,
    });
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h1 className="text-2xl font-semibold" data-testid="heading-strategy-builder">
            Strategy Builder
          </h1>
          <Badge variant="secondary">Developer Mode</Badge>
        </div>
        <p className="text-sm text-muted-foreground">
          Create custom trading strategies using JavaScript-like formulas
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Strategy Details</CardTitle>
              <CardDescription>Basic information about your strategy</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="strategy-name">Strategy Name *</Label>
                <Input
                  id="strategy-name"
                  placeholder="My Custom Strategy"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  data-testid="input-strategy-name"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strategy-description">Description</Label>
                <Textarea
                  id="strategy-description"
                  placeholder="Describe what your strategy does..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={3}
                  data-testid="textarea-strategy-description"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="strategy-timeframe">Timeframe *</Label>
                <Select value={timeframe} onValueChange={(v) => setTimeframe(v as "5m" | "15m")}>
                  <SelectTrigger id="strategy-timeframe" data-testid="select-timeframe">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="5m">5 Minutes</SelectItem>
                    <SelectItem value="15m">15 Minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Available Variables</CardTitle>
              <CardDescription>Use these in your formula</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-2 text-sm font-mono">
                <div className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-muted-foreground">price</span>
                  <span>Current candle close price</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-muted-foreground">ema50</span>
                  <span>50-period EMA value</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-muted-foreground">ema200</span>
                  <span>200-period EMA value</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-muted-foreground">high</span>
                  <span>Candle high price</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-muted-foreground">low</span>
                  <span>Candle low price</span>
                </div>
                <div className="flex items-center justify-between p-2 rounded-md bg-muted">
                  <span className="text-muted-foreground">open</span>
                  <span>Candle open price</span>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Example Formulas</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3 text-xs font-mono">
              <div className="p-3 rounded-md bg-muted space-y-1">
                <div className="text-muted-foreground mb-2">Bullish crossover:</div>
                <code className="block">price &gt; ema50 && ema50 &gt; ema200</code>
              </div>
              <div className="p-3 rounded-md bg-muted space-y-1">
                <div className="text-muted-foreground mb-2">Price touches EMA:</div>
                <code className="block">
                  (low &lt;= ema200 && price &gt;= ema200) || price === ema200
                </code>
              </div>
              <div className="p-3 rounded-md bg-muted space-y-1">
                <div className="text-muted-foreground mb-2">Strong momentum:</div>
                <code className="block">
                  price &gt; ema50 * 1.02 && ema50 &gt; ema200
                </code>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <Code2 className="h-5 w-5" />
                Formula Editor
              </CardTitle>
              <CardDescription>
                Write your strategy logic using JavaScript expressions
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <Textarea
                placeholder="// Example: price > ema50 && ema50 > ema200"
                value={formula}
                onChange={(e) => {
                  setFormula(e.target.value);
                  setValidationResult(null);
                }}
                rows={12}
                className="font-mono text-sm"
                data-testid="textarea-formula"
              />
              <div className="flex items-center gap-2">
                <Button
                  onClick={handleValidate}
                  disabled={validateMutation.isPending}
                  variant="outline"
                  size="sm"
                  data-testid="button-validate"
                >
                  <Play className="h-4 w-4 mr-2" />
                  {validateMutation.isPending ? "Validating..." : "Validate"}
                </Button>
                <Button
                  onClick={handleSave}
                  disabled={saveMutation.isPending || !name || !formula}
                  size="sm"
                  data-testid="button-save-strategy"
                >
                  <Save className="h-4 w-4 mr-2" />
                  {saveMutation.isPending ? "Saving..." : "Save Strategy"}
                </Button>
              </div>

              {validationResult && (
                <Alert variant={validationResult.valid ? "default" : "destructive"}>
                  {validationResult.valid ? (
                    <CheckCircle2 className="h-4 w-4" />
                  ) : (
                    <AlertCircle className="h-4 w-4" />
                  )}
                  <AlertDescription>{validationResult.message}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Formula Guidelines</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm text-muted-foreground">
              <p>• Return true when signal conditions are met</p>
              <p>• Use comparison operators: &gt;, &lt;, &gt;=, &lt;=, ===, !==</p>
              <p>• Combine conditions with && (AND) or || (OR)</p>
              <p>• Use arithmetic operators: +, -, *, /, %</p>
              <p>• Formula must be a valid JavaScript expression</p>
              <p>• Avoid complex logic; keep formulas simple and readable</p>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
