import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Webhook, CheckCircle2, Loader2, X, Settings } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/hooks/use-toast";
import { apiRequest, queryClient } from "@/lib/queryClient";
import type { NotificationConfig } from "@shared/schema";
import { Textarea } from "@/components/ui/textarea";

const NOTIFICATION_CHANNELS = [
  {
    channel: "email",
    name: "Email",
    icon: Mail,
    description: "Receive signals via email",
    setupGuide: `Choose one email service:
1. **SendGrid** - Professional email service (recommended for production)
2. **Resend** - Modern email API
3. **Gmail** - Your personal Gmail account
4. **Outlook** - Your Outlook account
5. **Custom SMTP** - Any SMTP server (set SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASSWORD env vars)`,
    fields: [
      { key: "recipients", label: "Email Recipients", type: "array-email", placeholder: "your@email.com" },
    ],
  },
  {
    channel: "sms",
    name: "SMS",
    icon: MessageSquare,
    description: "Get SMS notifications for signals",
    setupGuide: `To use SMS notifications:
1. Sign up at Twilio (https://www.twilio.com)
2. Get your Account SID and Auth Token
3. Get a Twilio phone number
4. Enter your configuration below`,
    fields: [
      { key: "phoneNumbers", label: "Phone Numbers", type: "array-tel", placeholder: "+1234567890" },
      { key: "twilioAccountSid", label: "Twilio Account SID", type: "password", placeholder: "ACxxxx" },
      { key: "twilioAuthToken", label: "Twilio Auth Token", type: "password", placeholder: "Your auth token" },
    ],
  },
  {
    channel: "webhook",
    name: "Webhook",
    icon: Webhook,
    description: "Send signals to a custom webhook URL",
    setupGuide: `To use webhooks:
1. Prepare a URL that can receive POST requests
2. (Optional) Configure custom headers for authentication
3. Enter your webhook URL and test
4. You'll receive signals as JSON POST requests`,
    fields: [
      { key: "url", label: "Webhook URL", type: "url", placeholder: "https://your-webhook.com/signals" },
      { key: "headers", label: "Custom Headers (JSON)", type: "textarea", placeholder: '{"Authorization": "Bearer token"}' },
    ],
  },
  {
    channel: "discord",
    name: "Discord",
    icon: MessageSquare,
    description: "Post signals to a Discord channel",
    setupGuide: `To set up Discord:
1. Go to your Discord server settings
2. Go to "Webhooks" under "Integrations"
3. Click "New Webhook" and select a channel
4. Copy the webhook URL
5. Paste it below and test`,
    fields: [
      { key: "webhookUrl", label: "Discord Webhook URL", type: "url", placeholder: "https://discord.com/api/webhooks/..." },
    ],
  },
  {
    channel: "telegram",
    name: "Telegram",
    icon: MessageSquare,
    description: "Get signal notifications via Telegram",
    setupGuide: `To set up Telegram:
1. Create a bot with @BotFather on Telegram
2. Copy your Bot Token
3. Message your bot and get your Chat ID (use /getid in a group or direct message)
4. Enter both below and test`,
    fields: [
      { key: "botToken", label: "Bot Token", type: "password", placeholder: "123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11" },
      { key: "chatId", label: "Chat ID", type: "text", placeholder: "123456789" },
    ],
  },
];

interface NotificationCardState {
  [key: string]: {
    enabled: boolean;
    configData: Record<string, string | string[]>;
    showSettings: boolean;
  };
}

export default function ConfigNotifications() {
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

  return <ConfigNotificationsContent />;
}

function ConfigNotificationsContent() {
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
  const [cardStates, setCardStates] = useState<NotificationCardState>({});
  const { toast } = useToast();

  const { data: notificationConfigs = [], isLoading } = useQuery<NotificationConfig[]>({
    queryKey: ["/api/notification-configs"],
  });

  const saveMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Partial<NotificationConfig> }) =>
      apiRequest("PATCH", `/api/notification-configs/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-configs"] });
      toast({
        title: "Configuration saved",
        description: "Notification settings have been updated.",
      });
    },
  });

  const testMutation = useMutation({
    mutationFn: (id: string) => apiRequest("POST", `/api/notification-configs/${id}/test`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/notification-configs"] });
      toast({
        title: "Test notification sent",
        description: "Check your notification channel for the test message.",
      });
      setTestingChannel(null);
    },
    onError: (error: any) => {
      toast({
        title: "Test failed",
        description: error.message || "Failed to send test notification.",
        variant: "destructive",
      });
      setTestingChannel(null);
    },
  });

  const renderNotificationCard = (channelInfo: typeof NOTIFICATION_CHANNELS[0]) => {
    const config = notificationConfigs.find((c) => c.channel === channelInfo.channel);
    const channelKey = channelInfo.channel;
    
    const cardState = cardStates[channelKey] || {
      enabled: config?.enabled || false,
      configData: (config?.config as Record<string, string | string[]>) || {},
      showSettings: false,
    };
    
    const enabled = cardState.enabled;
    const configData = cardState.configData;
    const showSettings = cardState.showSettings;
    
    const setEnabled = (value: boolean) => {
      setCardStates({
        ...cardStates,
        [channelKey]: { ...cardState, enabled: value },
      });
    };
    
    const setConfigData = (data: Record<string, string | string[]>) => {
      setCardStates({
        ...cardStates,
        [channelKey]: { ...cardState, configData: data },
      });
    };

    const setShowSettings = (show: boolean) => {
      setCardStates({
        ...cardStates,
        [channelKey]: { ...cardState, showSettings: show },
      });
    };

    const hasChanges = enabled !== (config?.enabled || false) || 
                       JSON.stringify(configData) !== JSON.stringify(config?.config || {});

    const Icon = channelInfo.icon;

    return (
      <Card key={channelInfo.channel} data-testid={`notification-card-${channelInfo.channel}`}>
        <CardHeader>
          <div className="flex items-start justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="p-2 rounded-md bg-muted">
                <Icon className="h-5 w-5" />
              </div>
              <div className="space-y-1">
                <CardTitle className="text-base">{channelInfo.name}</CardTitle>
                <CardDescription className="text-sm">{channelInfo.description}</CardDescription>
              </div>
            </div>
            {config?.testStatus === "success" && config?.lastTested && (
              <Badge variant="default" className="text-xs gap-1">
                <CheckCircle2 className="h-3 w-3" />
                Tested
              </Badge>
            )}
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-4">
          {!showSettings ? (
            <div className="flex flex-col items-center justify-center gap-4 py-6">
              <Button
                size="icon"
                variant="outline"
                onClick={() => setShowSettings(true)}
                className={`h-12 w-12 rounded-full border-2 transition-all ${
                  Object.keys(configData).length > 0 
                    ? "border-green-500 hover:bg-green-50 dark:hover:bg-green-950" 
                    : "border-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-950"
                }`}
                data-testid={`button-settings-${channelInfo.channel}`}
              >
                <Settings className={`h-6 w-6 ${
                  Object.keys(configData).length > 0 ? "text-green-500" : "text-yellow-500"
                }`} />
              </Button>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {channelInfo.fields.map((field) => {
                const isArrayField = field.type.startsWith("array-");
                const baseType = isArrayField ? field.type.split("-")[1] : field.type;
                const currentValue = configData[field.key];
                const arrayValue = isArrayField 
                  ? (Array.isArray(currentValue) ? currentValue : (currentValue ? [currentValue as string] : []))
                  : [];
                
                return (
                  <div key={field.key} className="space-y-2">
                    <Label htmlFor={`${channelInfo.channel}-${field.key}`}>{field.label}</Label>
                    {isArrayField ? (
                      <div className="space-y-2">
                        {(arrayValue as string[]).map((item, idx) => (
                          <div key={idx} className="flex gap-2">
                            <Input
                              type={baseType}
                              placeholder={field.placeholder}
                              value={item || ""}
                              onChange={(e) => {
                                const newArray = [...(arrayValue as string[])];
                                newArray[idx] = e.target.value;
                                setConfigData({ ...configData, [field.key]: newArray });
                              }}
                              data-testid={`input-${channelInfo.channel}-${field.key}-${idx}`}
                            />
                            <Button
                              size="icon"
                              variant="ghost"
                              onClick={() => {
                                const newArray = (arrayValue as string[]).filter((_, i) => i !== idx);
                                setConfigData({ ...configData, [field.key]: newArray });
                              }}
                              data-testid={`button-remove-${field.key}-${idx}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => {
                            setConfigData({ ...configData, [field.key]: [...(arrayValue as string[]), ""] });
                          }}
                          data-testid={`button-add-${field.key}`}
                        >
                          Add {field.label}
                        </Button>
                      </div>
                    ) : field.type === "textarea" ? (
                      <Textarea
                        id={`${channelInfo.channel}-${field.key}`}
                        placeholder={field.placeholder}
                        value={(configData[field.key] as string) || ""}
                        onChange={(e) => setConfigData({ ...configData, [field.key]: e.target.value })}
                        rows={3}
                        data-testid={`input-${channelInfo.channel}-${field.key}`}
                      />
                    ) : (
                      <Input
                        id={`${channelInfo.channel}-${field.key}`}
                        type={field.type}
                        placeholder={field.placeholder}
                        value={(configData[field.key] as string) || ""}
                        onChange={(e) => setConfigData({ ...configData, [field.key]: e.target.value })}
                        data-testid={`input-${channelInfo.channel}-${field.key}`}
                      />
                    )}
                  </div>
                );
              })}
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
                data-testid={`button-close-settings-${channelInfo.channel}`}
              >
                Done
              </Button>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t">
            <Label htmlFor={`${channelInfo.channel}-enabled`}>Enable Notifications</Label>
            <Switch
              id={`${channelInfo.channel}-enabled`}
              checked={enabled}
              onCheckedChange={setEnabled}
              data-testid={`switch-${channelInfo.channel}`}
            />
          </div>
        </CardContent>
        <CardFooter className="flex items-center gap-2 justify-end border-t pt-4">
          {config && (
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setTestingChannel(config.id);
                testMutation.mutate(config.id);
              }}
              disabled={!enabled || testingChannel === config.id}
              data-testid={`button-test-${channelInfo.channel}`}
            >
              {testingChannel === config.id ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                "Test Notification"
              )}
            </Button>
          )}
          {hasChanges && config && (
            <Button
              size="sm"
              onClick={() => saveMutation.mutate({ id: config.id, data: { enabled, config: configData } })}
              disabled={saveMutation.isPending}
              data-testid={`button-save-${channelInfo.channel}`}
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
        {[1, 2, 3, 4, 5].map((i) => (
          <Skeleton key={i} className="h-64 w-full" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h1 className="text-3xl font-bold tracking-tight">Notification Configuration</h1>
        <p className="text-muted-foreground">Set up notification channels for trading alerts</p>
      </div>

      <div className="space-y-4">
        {NOTIFICATION_CHANNELS.map((channel) => renderNotificationCard(channel))}
      </div>
    </div>
  );
}
