import { useState } from "react";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Bell, Mail, MessageSquare, Webhook, CheckCircle2, Loader2 } from "lucide-react";
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
    fields: [
      { key: "to", label: "Email Address", type: "email", placeholder: "your@email.com" },
      { key: "from", label: "From Address", type: "email", placeholder: "signals@signalpro.com" },
    ],
  },
  {
    channel: "sms",
    name: "SMS",
    icon: MessageSquare,
    description: "Get SMS notifications for signals",
    fields: [
      { key: "phoneNumber", label: "Phone Number", type: "tel", placeholder: "+1234567890" },
      { key: "twilioAccountSid", label: "Twilio Account SID", type: "text", placeholder: "ACxxxx" },
      { key: "twilioAuthToken", label: "Twilio Auth Token", type: "password", placeholder: "Your auth token" },
    ],
  },
  {
    channel: "webhook",
    name: "Webhook",
    icon: Webhook,
    description: "Send signals to a custom webhook URL",
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
    fields: [
      { key: "webhookUrl", label: "Discord Webhook URL", type: "url", placeholder: "https://discord.com/api/webhooks/..." },
    ],
  },
];

export default function ConfigNotifications() {
  const [testingChannel, setTestingChannel] = useState<string | null>(null);
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
    const [enabled, setEnabled] = useState(config?.enabled || false);
    const [configData, setConfigData] = useState<Record<string, string>>(
      (config?.config as Record<string, string>) || {}
    );

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
        <CardContent className="space-y-4">
          {channelInfo.fields.map((field) => (
            <div key={field.key} className="space-y-2">
              <Label htmlFor={`${channelInfo.channel}-${field.key}`}>{field.label}</Label>
              {field.type === "textarea" ? (
                <Textarea
                  id={`${channelInfo.channel}-${field.key}`}
                  placeholder={field.placeholder}
                  value={configData[field.key] || ""}
                  onChange={(e) => setConfigData({ ...configData, [field.key]: e.target.value })}
                  rows={3}
                  data-testid={`input-${channelInfo.channel}-${field.key}`}
                />
              ) : (
                <Input
                  id={`${channelInfo.channel}-${field.key}`}
                  type={field.type}
                  placeholder={field.placeholder}
                  value={configData[field.key] || ""}
                  onChange={(e) => setConfigData({ ...configData, [field.key]: e.target.value })}
                  data-testid={`input-${channelInfo.channel}-${field.key}`}
                />
              )}
            </div>
          ))}
          <div className="flex items-center justify-between pt-2">
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
          <Button
            size="sm"
            onClick={() => {
              if (config) {
                saveMutation.mutate({
                  id: config.id,
                  data: { config: configData, enabled },
                });
              }
            }}
            disabled={!hasChanges || saveMutation.isPending}
            data-testid={`button-save-${channelInfo.channel}`}
          >
            {saveMutation.isPending ? "Saving..." : "Save"}
          </Button>
        </CardFooter>
      </Card>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold mb-2" data-testid="heading-notification-config">
          Notification Settings
        </h1>
        <p className="text-sm text-muted-foreground">
          Configure how you want to receive trading signal alerts
        </p>
      </div>

      {isLoading ? (
        <div className="space-y-4">
          {[...Array(4)].map((_, i) => (
            <Card key={i}>
              <CardHeader>
                <Skeleton className="h-6 w-1/3" />
                <Skeleton className="h-4 w-2/3 mt-2" />
              </CardHeader>
              <CardContent className="space-y-4">
                <Skeleton className="h-10 w-full" />
                <Skeleton className="h-10 w-full" />
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          {NOTIFICATION_CHANNELS.map((channel) => renderNotificationCard(channel))}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Notification Tips</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-muted-foreground">
          <p>• Enable multiple channels to ensure you never miss a signal</p>
          <p>• Test each channel after configuration to verify delivery</p>
          <p>• Webhook notifications include full signal data in JSON format</p>
          <p>• SMS notifications may incur charges from your provider</p>
          <p>• Discord webhooks are free and provide rich formatting</p>
        </CardContent>
      </Card>
    </div>
  );
}
