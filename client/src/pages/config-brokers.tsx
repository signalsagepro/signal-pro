import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Switch } from "@/components/ui/switch";
import { Settings, CheckCircle2, XCircle, Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { BrokerConfig } from "@shared/schema";

const INDIAN_BROKERS = [
  { id: "zerodha", name: "Zerodha Kite", description: "India's largest broker" },
  { id: "upstox", name: "Upstox", description: "Low-cost Indian broker" },
  { id: "angel", name: "Angel One", description: "Angel Broking platform" },
];

const FOREX_BROKERS = [
  { id: "oanda", name: "OANDA", description: "Professional forex trading" },
  { id: "ib", name: "Interactive Brokers", description: "Global trading platform" },
  { id: "fxcm", name: "FXCM", description: "Forex capital markets" },
];

interface BrokerCardState {
  [key: string]: {
    apiKey: string;
    apiSecret: string;
    enabled: boolean;
  };
}

export default function ConfigBrokers() {
  const { user } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (user && user.role !== "admin") {
      navigate("/");
    }
  }, [user, navigate]);

  if (!user || user.role !== "admin") {
    return null;
  }

  return <ConfigBrokersContent />;
}

function ConfigBrokersContent() {
  const [testingConnection, setTestingConnection] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<BrokerCardState>({});
  const { toast } = useToast();

  const { data: brokerConfigs = [], isLoading } = useQuery<BrokerConfig[]>({
    queryKey: ["/api/broker-configs"],
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<BrokerConfig> }) =>
      apiRequest("PATCH", `/api/broker-configs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/broker-configs"] });
      toast({
        title: "Configuration saved",
        description: "Broker configuration has been updated.",
      });
    },
  });

  const testConnectionMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/broker-configs/${id}/test`, {}),
    onSuccess: (data, id) => {
      queryClient.invalidateQueries({ queryKey: ["/api/broker-configs"] });
      toast({
        title: "Connection successful",
        description: "Successfully connected to the broker API.",
      });
      setTestingConnection(null);
    },
    onError: (error: any, id) => {
      toast({
        title: "Connection failed",
        description: error.message || "Failed to connect to broker API.",
        variant: "destructive",
      });
      setTestingConnection(null);
    },
  });

  const handleSave = (configId: string, data: { apiKey?: string; apiSecret?: string; enabled?: boolean }) => {
    saveMutation.mutate({ id: configId, data });
  };

  const handleTestConnection = (configId: string) => {
    setTestingConnection(configId);
    testConnectionMutation.mutate(configId);
  };

  const renderBrokerCard = (broker: typeof INDIAN_BROKERS[0] | typeof FOREX_BROKERS[0], type: "indian" | "forex") => {
    const config = brokerConfigs.find((c) => c.name === broker.id && c.type === type);
    const stateKey = `${broker.id}-${type}`;
    
    const cardState = cardStates[stateKey] || {
      apiKey: config?.apiKey || "",
      apiSecret: config?.apiSecret || "",
      enabled: config?.enabled || false,
    };
    
    const apiKey = cardState.apiKey;
    const apiSecret = cardState.apiSecret;
    const enabled = cardState.enabled;

    const setApiKey = (value: string) => {
      setCardStates({
        ...cardStates,
        [stateKey]: { ...cardState, apiKey: value },
      });
    };

    const setApiSecret = (value: string) => {
      setCardStates({
        ...cardStates,
        [stateKey]: { ...cardState, apiSecret: value },
      });
    };

    const setEnabled = (value: boolean) => {
      setCardStates({
        ...cardStates,
        [stateKey]: { ...cardState, enabled: value },
      });
    };

    const hasChanges = apiKey !== (config?.apiKey || "") || 
                       apiSecret !== (config?.apiSecret || "") || 
                       enabled !== (config?.enabled || false);

    return (
      <Card key={broker.id} data-testid={`broker-card-${broker.id}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="space-y-1">
              <CardTitle className="text-base">{broker.name}</CardTitle>
              <CardDescription className="text-sm">{broker.description}</CardDescription>
            </div>
            <div className="flex items-center gap-2">
              {config?.connected ? (
                <Badge variant="default" className="text-xs gap-1">
                  <CheckCircle2 className="h-3 w-3" />
                  Connected
                </Badge>
              ) : config?.enabled ? (
                <Badge variant="secondary" className="text-xs gap-1">
                  <XCircle className="h-3 w-3" />
                  Not Connected
                </Badge>
              ) : null}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor={`${broker.id}-api-key`}>API Key</Label>
            <Input
              id={`${broker.id}-api-key`}
              type="password"
              placeholder="Enter API key"
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              data-testid={`input-api-key-${broker.id}`}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`${broker.id}-api-secret`}>API Secret</Label>
            <Input
              id={`${broker.id}-api-secret`}
              type="password"
              placeholder="Enter API secret"
              value={apiSecret}
              onChange={(e) => setApiSecret(e.target.value)}
              data-testid={`input-api-secret-${broker.id}`}
            />
          </div>
          <div className="flex items-center justify-between pt-2">
            <Label htmlFor={`${broker.id}-enabled`}>Enable Integration</Label>
            <Switch
              id={`${broker.id}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid={`switch-${broker.id}`}
            />
          </div>
        </CardContent>
        <CardFooter className="flex items-center gap-2 justify-end border-t pt-4">
          {config && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => handleTestConnection(config.id)}
              disabled={!enabled || testingConnection === config.id}
              data-testid={`button-test-${broker.id}`}
            >
              {testingConnection === config.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Connection"
              )}
            </Button>
          )}
          {hasChanges && config && (
            <Button
              size="sm"
              onClick={() => handleSave(config.id, { apiKey, apiSecret, enabled })}
              disabled={saveMutation.isPending}
              data-testid={`button-save-${broker.id}`}
            >
              {saveMutation.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Saving...
                </>
              ) : (
                "Save Changes"
              )}
            </Button>
          )}
        </CardFooter>
      </Card>
    );
  };

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-96" />
        </div>
        {[1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Broker Configuration</h1>
        <p className="text-muted-foreground">Connect your trading broker accounts</p>
      </div>

      <Tabs defaultValue="indian" className="w-full">
        <TabsList>
          <TabsTrigger value="indian" data-testid="tab-indian">Indian Brokers</TabsTrigger>
          <TabsTrigger value="forex" data-testid="tab-forex">Forex Brokers</TabsTrigger>
        </TabsList>

        <TabsContent value="indian" className="space-y-4 mt-6">
          {INDIAN_BROKERS.map((broker) => renderBrokerCard(broker, "indian"))}
        </TabsContent>

        <TabsContent value="forex" className="space-y-4 mt-6">
          {FOREX_BROKERS.map((broker) => renderBrokerCard(broker, "forex"))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
