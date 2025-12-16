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

const FOREX_DATA_PROVIDERS = [
  { id: "finnhub", name: "Finnhub", description: "FREE forex WebSocket data", type: "finnhub", requiresSecret: false },
  { id: "twelvedata", name: "TwelveData", description: "2000+ forex pairs ($79/mo for WebSocket)", type: "twelvedata", requiresSecret: false },
  { id: "tiingo", name: "Tiingo", description: "Real-time forex data ($10/mo)", type: "tiingo", requiresSecret: false },
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
  const [verifyingConnection, setVerifyingConnection] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<BrokerCardState>({});
  const [realtimeActive, setRealtimeActive] = useState(false);
  const [startingRealtime, setStartingRealtime] = useState(false);
  const { toast } = useToast();

  const { data: brokerConfigs = [], isLoading } = useQuery<BrokerConfig[]>({
    queryKey: ["/api/broker-configs"],
  });

  // Check if Zerodha is connected
  const zerodhaConnected = brokerConfigs.some(c => c.name === "zerodha" && c.connected);

  // Check real-time status on mount and periodically
  useEffect(() => {
    const checkStatus = () => {
      if (zerodhaConnected) {
        fetch("/api/realtime/status", { credentials: "include" })
          .then(res => res.json())
          .then(data => {
            console.log("[Config Brokers] WebSocket status data:", data);
            // Check if zerodha WebSocket is connected (boolean true)
            setRealtimeActive(data.websocketStatus?.zerodha === true);
          })
          .catch(console.error);
      }
    };

    // Check immediately
    checkStatus();
    
    // Check every 5 seconds to keep status updated
    const interval = setInterval(checkStatus, 5000);
    
    return () => clearInterval(interval);
  }, [zerodhaConnected]);

  // Listen for OAuth popup messages
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data.type === 'zerodha_connected') {
        if (event.data.success) {
          toast({
            title: "Zerodha Connected!",
            description: "Successfully authenticated with Zerodha Kite.",
          });
          queryClient.invalidateQueries({ queryKey: ["/api/broker-configs"] });
        } else {
          toast({
            title: "Connection Failed",
            description: event.data.error || "Failed to connect to Zerodha",
            variant: "destructive",
          });
        }
      }
    };

    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [toast]);

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
      // Check if this is an OAuth flow requirement
      const errorMsg = error.message || "";
      if (errorMsg.includes("OAuth login flow") || errorMsg.includes("kite.zerodha.com")) {
        // Extract OAuth URL from error message
        const urlMatch = errorMsg.match(/https:\/\/kite\.zerodha\.com[^\s"]*/);
        if (urlMatch) {
          toast({
            title: "OAuth Login Required",
            description: "Opening Zerodha login page. Complete login to connect.",
          });
          // Open Zerodha login in new window
          window.open(urlMatch[0], "_blank", "width=600,height=700");
          setTestingConnection(null);
          return;
        }
      }
      
      // Check if token was invalid and cleared - refresh configs so Connect button works
      if (error.needsReauth) {
        queryClient.invalidateQueries({ queryKey: ["/api/broker-configs"] });
        toast({
          title: "Token Expired",
          description: "Please click 'Connect' to re-authenticate with Zerodha.",
          variant: "destructive",
        });
        setTestingConnection(null);
        return;
      }
      
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

  const handleTestConnection = async (configId: string) => {
    const config = brokerConfigs.find(c => c.id === configId);
    
    // For Zerodha, check if we need OAuth flow (name is "zerodha", type is "indian")
    if (config?.name === "zerodha") {
      // Check if already connected with access token
      const metadata = config.metadata as Record<string, unknown> | null;
      if (!metadata?.accessToken) {
        // Need OAuth flow - get the OAuth URL and redirect
        try {
          setTestingConnection(configId);
          const response = await fetch(`/api/broker-configs/${configId}/oauth-url`);
          if (response.ok) {
            const data = await response.json();
            toast({
              title: "OAuth Login Required",
              description: "Opening Zerodha login page. Complete login to connect.",
            });
            window.open(data.url, "_blank", "width=600,height=700");
            setTestingConnection(null);
            return;
          }
        } catch (error) {
          console.error("Failed to get OAuth URL:", error);
        }
      }
    }
    
    setTestingConnection(configId);
    testConnectionMutation.mutate(configId);
  };

  const handleVerifyConnection = async (configId: string) => {
    setVerifyingConnection(configId);
    try {
      const response = await fetch(`/api/broker-configs/${configId}/verify`);
      const data = await response.json();
      
      if (response.ok && data.success) {
        toast({
          title: "✅ Connection Verified!",
          description: data.testQuote 
            ? `Live quote: ${data.testQuote.symbol} @ ₹${data.testQuote.lastPrice}`
            : data.message,
        });
      } else if (data.needsReauth) {
        // Token is invalid/expired - refresh configs and prompt user to reconnect
        await queryClient.invalidateQueries({ queryKey: ["/api/broker-configs"] });
        toast({
          title: "Token Expired",
          description: "Please click 'Connect' to re-authenticate with Zerodha.",
          variant: "destructive",
        });
      } else {
        toast({
          title: "Verification Failed",
          description: data.error || data.message || "Could not verify connection",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Verification Error",
        description: "Failed to verify broker connection",
        variant: "destructive",
      });
    } finally {
      setVerifyingConnection(null);
    }
  };

  const renderBrokerCard = (broker: typeof INDIAN_BROKERS[0] | typeof FOREX_DATA_PROVIDERS[0], type: "indian" | "forex") => {
    // For forex data providers, use the provider's type (e.g., "finnhub") instead of "forex"
    const brokerType = "type" in broker ? broker.type : type;
    const config = brokerConfigs.find((c) => c.name === broker.id && c.type === brokerType);
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
        <CardFooter className="flex items-center gap-2 justify-end border-t pt-4 flex-wrap">
          {config && config.connected && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => handleVerifyConnection(config.id)}
              disabled={verifyingConnection === config.id}
              className="text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
              data-testid={`button-verify-${broker.id}`}
            >
              {verifyingConnection === config.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Verifying...
                </>
              ) : (
                <>
                  <CheckCircle2 className="h-4 w-4 mr-1" />
                  Verify API
                </>
              )}
            </Button>
          )}
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
                  {config.connected ? "Reconnecting..." : "Connecting..."}
                </>
              ) : (
                config.connected ? "Reconnect" : "Connect"
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

  const handleToggleRealtime = async () => {
    setStartingRealtime(true);
    try {
      const endpoint = realtimeActive ? "/api/realtime/stop" : "/api/realtime/start";
      const response = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
      });

      const data = await response.json();
      if (response.ok) {
        setRealtimeActive(!realtimeActive);
        toast({
          title: realtimeActive ? "Real-time Stopped" : "Real-time Started",
          description: data.message,
        });
      } else {
        toast({
          title: "Failed to toggle real-time mode",
          description: data.error || "An error occurred",
          variant: "destructive",
        });
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to toggle real-time mode",
        variant: "destructive",
      });
    } finally {
      setStartingRealtime(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Broker Configuration</h1>
        <p className="text-muted-foreground">Connect your trading broker accounts</p>
      </div>

      {zerodhaConnected && (
        <Card className="border-emerald-200 bg-emerald-50/50">
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div className="space-y-1">
                <h3 className="font-semibold text-emerald-900">Real-time WebSocket Signals</h3>
                <p className="text-sm text-emerald-700">
                  {realtimeActive 
                    ? "🟢 Connected to Zerodha WebSocket - receiving live tick data" 
                    : "🔄 Connecting to Zerodha WebSocket..."}
                </p>
                <p className="text-xs text-emerald-600 mt-1">
                  WebSocket auto-connects on server startup and reconnects automatically if disconnected
                </p>
              </div>
              <div className="flex items-center gap-2">
                {realtimeActive ? (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-emerald-100 rounded-full">
                    <div className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse"></div>
                    <span className="text-xs font-medium text-emerald-700">Live</span>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 px-3 py-1.5 bg-slate-100 rounded-full">
                    <div className="w-2 h-2 bg-slate-400 rounded-full"></div>
                    <span className="text-xs font-medium text-slate-600">Connecting</span>
                  </div>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Tabs defaultValue="indian" className="w-full">
        <TabsList>
          <TabsTrigger value="indian" data-testid="tab-indian">Indian Brokers</TabsTrigger>
          <TabsTrigger value="forex" data-testid="tab-forex">Forex Brokers</TabsTrigger>
        </TabsList>

        <TabsContent value="indian" className="space-y-4 mt-6">
          {INDIAN_BROKERS.map((broker) => renderBrokerCard(broker, "indian"))}
        </TabsContent>

        <TabsContent value="forex" className="space-y-4 mt-6">
          {FOREX_DATA_PROVIDERS.map((broker) => renderBrokerCard(broker, "forex"))}
        </TabsContent>
      </Tabs>
    </div>
  );
}
