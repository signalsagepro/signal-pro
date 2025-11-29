import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X, ChevronDown } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

const CONDITION_TYPES = [
  { label: "Price > EMA50", value: "price_above_ema50" },
  { label: "Price >= EMA50", value: "price_gte_ema50" },
  { label: "Price < EMA50", value: "price_below_ema50" },
  { label: "Price <= EMA50", value: "price_lte_ema50" },
  { label: "Price > EMA200", value: "price_above_ema200" },
  { label: "Price >= EMA200", value: "price_gte_ema200" },
  { label: "Price < EMA200", value: "price_below_ema200" },
  { label: "Price <= EMA200", value: "price_lte_ema200" },
  { label: "EMA50 > EMA200", value: "ema50_above_ema200" },
  { label: "EMA50 < EMA200", value: "ema50_below_ema200" },
  { label: "EMA200 > EMA50", value: "ema200_above_ema50" },
  { label: "Price touches EMA200", value: "price_touches_ema200" },
  { label: "Candle close confirmed", value: "candle_close" },
];

interface Condition {
  id: string;
  type: string;
  label: string;
}

interface AdvancedStrategyBuilderProps {
  onBuild: (strategy: any) => void;
  isLoading?: boolean;
}

export function AdvancedStrategyBuilder({ onBuild, isLoading }: AdvancedStrategyBuilderProps) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [timeframe, setTimeframe] = useState("5m");
  const [conditions, setConditions] = useState<Condition[]>([]);
  const [conditionLogic, setConditionLogic] = useState<"AND" | "OR">("AND");
  const [nextConditionId, setNextConditionId] = useState(1);

  const conditionMap: { [key: string]: string } = {
    price_above_ema50: "price > ema50",
    price_gte_ema50: "price >= ema50",
    price_below_ema50: "price < ema50",
    price_lte_ema50: "price <= ema50",
    price_above_ema200: "price > ema200",
    price_gte_ema200: "price >= ema200",
    price_below_ema200: "price < ema200",
    price_lte_ema200: "price <= ema200",
    ema50_above_ema200: "ema50 > ema200",
    ema50_below_ema200: "ema50 < ema200",
    ema200_above_ema50: "ema200 > ema50",
    price_touches_ema200: "price ≈ ema200",
    candle_close: "candle closes",
  };

  const addCondition = (type: string) => {
    const conditionLabel = CONDITION_TYPES.find((c) => c.value === type)?.label || type;
    const newCondition: Condition = {
      id: `cond-${nextConditionId}`,
      type,
      label: conditionLabel,
    };
    setConditions([...conditions, newCondition]);
    setNextConditionId(nextConditionId + 1);
  };

  const removeCondition = (id: string) => {
    setConditions(conditions.filter((c) => c.id !== id));
  };

  const buildFormula = (): string => {
    if (conditions.length === 0) return "";
    return conditions.map((c) => conditionMap[c.type] || c.type).join(` ${conditionLogic} `);
  };

  const handleBuild = () => {
    if (!name || conditions.length === 0) {
      alert("Please enter strategy name and add at least one condition");
      return;
    }

    const formula = buildFormula();
    const conditionsObj: any = {};
    conditions.forEach((c) => {
      conditionsObj[c.type] = true;
    });

    onBuild({
      name,
      description,
      type: `custom_${Date.now()}`,
      timeframe,
      conditions: conditionsObj,
      isCustom: true,
      enabled: true,
      formula: null,
    });
  };

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="strategy-name">Strategy Name</Label>
        <Input
          id="strategy-name"
          placeholder="e.g., EMA Bullish Crossover"
          value={name}
          onChange={(e) => setName(e.target.value)}
          data-testid="input-strategy-name"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="strategy-desc">Description (optional)</Label>
        <Input
          id="strategy-desc"
          placeholder="What does this strategy do?"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          data-testid="input-strategy-desc"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="timeframe">Timeframe</Label>
          <Select value={timeframe} onValueChange={setTimeframe}>
            <SelectTrigger id="timeframe" data-testid="select-timeframe">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="5m">5 Minutes</SelectItem>
              <SelectItem value="15m">15 Minutes</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Condition Logic</Label>
          <div className="flex gap-2 pt-1">
            <Button
              size="sm"
              variant={conditionLogic === "AND" ? "default" : "outline"}
              onClick={() => setConditionLogic("AND")}
              className="flex-1"
              data-testid="button-logic-and"
            >
              AND
            </Button>
            <Button
              size="sm"
              variant={conditionLogic === "OR" ? "default" : "outline"}
              onClick={() => setConditionLogic("OR")}
              className="flex-1"
              data-testid="button-logic-or"
            >
              OR
            </Button>
          </div>
        </div>
      </div>

      <Collapsible defaultOpen>
        <CollapsibleTrigger asChild>
          <Button variant="outline" size="sm" className="w-full gap-2" data-testid="button-add-conditions">
            <Plus className="h-4 w-4" />
            Add Conditions
            <ChevronDown className="h-4 w-4 ml-auto" />
          </Button>
        </CollapsibleTrigger>
        <CollapsibleContent className="mt-3">
          <div className="grid grid-cols-2 gap-2">
            {CONDITION_TYPES.map((condition) => (
              <Button
                key={condition.value}
                variant="ghost"
                size="sm"
                className="text-xs h-8 justify-start"
                onClick={() => addCondition(condition.value)}
                data-testid={`button-add-condition-${condition.value}`}
              >
                {condition.label}
              </Button>
            ))}
          </div>
        </CollapsibleContent>
      </Collapsible>

      {conditions.length > 0 && (
        <Card className="bg-muted/30">
          <CardHeader>
            <CardTitle className="text-sm">Selected Conditions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-2">
              {conditions.map((cond, idx) => (
                <div key={cond.id} className="flex items-center justify-between gap-2 p-2 bg-background rounded border">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    {idx > 0 && <Badge variant="secondary" className="text-xs shrink-0">{conditionLogic}</Badge>}
                    <span className="text-sm truncate">{cond.label}</span>
                  </div>
                  <Button
                    size="icon"
                    variant="ghost"
                    className="h-6 w-6 shrink-0"
                    onClick={() => removeCondition(cond.id)}
                    data-testid={`button-remove-condition-${cond.id}`}
                  >
                    <X className="h-3 w-3" />
                  </Button>
                </div>
              ))}
            </div>

            {buildFormula() && (
              <div className="mt-4 p-3 bg-background rounded border-l-2 border-l-chart-1">
                <p className="text-xs text-muted-foreground mb-1">Formula</p>
                <p className="text-sm font-mono text-foreground break-words">{buildFormula()}</p>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Button
        onClick={handleBuild}
        disabled={!name || conditions.length === 0 || isLoading}
        className="w-full"
        data-testid="button-build-strategy"
      >
        {isLoading ? "Creating..." : "Create Strategy"}
      </Button>
    </div>
  );
}
