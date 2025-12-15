import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import {
  Settings,
  LayoutDashboard,
  LineChart,
  Signal,
  TrendingUp,
  Layers,
  BarChart3,
  Shield,
  Eye,
  EyeOff,
  RotateCcw,
  Save,
  Menu,
  BarChart2,
} from "lucide-react";
import { useDashboardConfig, DashboardConfig } from "@/hooks/use-dashboard-config";
import { useToast } from "@/hooks/use-toast";

interface ConfigItemProps {
  id: keyof DashboardConfig;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  value: boolean;
  onChange: (value: boolean) => void;
  adminOnly?: {
    id: keyof DashboardConfig;
    value: boolean;
    onChange: (value: boolean) => void;
  };
}

function ConfigItem({ id, label, description, icon: Icon, value, onChange, adminOnly }: ConfigItemProps) {
  return (
    <div className="flex items-start justify-between p-4 rounded-lg border border-slate-200 hover:border-emerald-200 transition-colors">
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg ${value ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-100 text-slate-400'}`}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Label htmlFor={id} className="font-medium text-slate-800">{label}</Label>
            {!value && <Badge variant="secondary" className="text-xs">Hidden</Badge>}
          </div>
          <p className="text-sm text-slate-500">{description}</p>
          
          {adminOnly && value && (
            <div className="flex items-center gap-2 mt-2 pt-2 border-t border-slate-100">
              <Shield className="h-3 w-3 text-amber-500" />
              <Label htmlFor={adminOnly.id} className="text-xs text-slate-500">Admin only</Label>
              <Switch
                id={adminOnly.id}
                checked={adminOnly.value}
                onCheckedChange={adminOnly.onChange}
                className="scale-75"
              />
            </div>
          )}
        </div>
      </div>
      <div className="flex items-center gap-2">
        {value ? (
          <Eye className="h-4 w-4 text-emerald-500" />
        ) : (
          <EyeOff className="h-4 w-4 text-slate-400" />
        )}
        <Switch
          id={id}
          checked={value}
          onCheckedChange={onChange}
        />
      </div>
    </div>
  );
}

export default function DevDashboardSettings() {
  const { config, saveConfig, resetConfig, isSaving } = useDashboardConfig();
  const { toast } = useToast();

  // Wrapper to handle save with feedback
  const handleSave = async (newConfig: Partial<DashboardConfig>) => {
    console.log("[Dashboard Settings] Attempting to save:", newConfig);
    const success = await saveConfig(newConfig);
    console.log("[Dashboard Settings] Save result:", success);
    
    if (success) {
      toast({
        title: "Settings saved",
        description: "Dashboard configuration has been updated successfully.",
      });
    } else {
      toast({
        title: "Save failed",
        description: "Failed to save dashboard settings. Check console for details.",
        variant: "destructive",
      });
    }
  };

  const handleReset = async () => {
    const success = await resetConfig();
    if (success) {
      toast({
        title: "Settings reset",
        description: "Dashboard configuration has been reset to defaults for all users.",
      });
    } else {
      toast({
        title: "Reset failed",
        description: "You need admin privileges to reset global settings.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-xl shadow-lg">
            <Settings className="h-7 w-7 text-white" />
          </div>
          <div>
            <h1 className="text-4xl font-bold text-slate-800">Dashboard Settings</h1>
            <p className="text-slate-500 mt-1">Configure dashboard component visibility</p>
          </div>
        </div>
        
        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
          Developer Mode Only
        </Badge>
      </div>

      {/* Component Visibility */}
      <Card className="shadow-md border border-emerald-100">
        <CardHeader className="bg-gradient-to-r from-emerald-50 to-teal-50 border-b border-emerald-100">
          <div className="flex items-center gap-2">
            <LayoutDashboard className="h-5 w-5 text-emerald-600" />
            <CardTitle className="text-xl font-bold text-slate-800">Component Visibility</CardTitle>
          </div>
          <CardDescription>
            Choose which components to show on the dashboard. Toggle "Admin only" to restrict visibility.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <ConfigItem
            id="showMetricCards"
            label="Metric Cards"
            description="Signal count, active strategies, connected assets, and system status"
            icon={BarChart3}
            value={config.showMetricCards}
            onChange={(v) => handleSave({ showMetricCards: v })}
            adminOnly={{
              id: "adminOnlyMetrics",
              value: config.adminOnlyMetrics,
              onChange: (v) => handleSave({ adminOnlyMetrics: v }),
            }}
          />
          
          <ConfigItem
            id="showNiftyChart"
            label="NIFTY 50 Chart"
            description="Live candlestick chart for NSE Nifty 50 Index"
            icon={LineChart}
            value={config.showNiftyChart}
            onChange={(v) => handleSave({ showNiftyChart: v })}
            adminOnly={{
              id: "adminOnlyCharts",
              value: config.adminOnlyCharts,
              onChange: (v) => handleSave({ adminOnlyCharts: v }),
            }}
          />
          
          <ConfigItem
            id="showSensexChart"
            label="SENSEX Chart"
            description="Live candlestick chart for BSE Sensex Index"
            icon={LineChart}
            value={config.showSensexChart}
            onChange={(v) => handleSave({ showSensexChart: v })}
          />
          
          <ConfigItem
            id="showRecentSignals"
            label="Recent Signals"
            description="List of recent trading signals with details"
            icon={Signal}
            value={config.showRecentSignals}
            onChange={(v) => handleSave({ showRecentSignals: v })}
            adminOnly={{
              id: "adminOnlySignals",
              value: config.adminOnlySignals,
              onChange: (v) => handleSave({ adminOnlySignals: v }),
            }}
          />
          
          <ConfigItem
            id="showActiveStrategies"
            label="Active Strategies"
            description="Overview of currently active trading strategies"
            icon={TrendingUp}
            value={config.showActiveStrategies}
            onChange={(v) => handleSave({ showActiveStrategies: v })}
            adminOnly={{
              id: "adminOnlyStrategies",
              value: config.adminOnlyStrategies,
              onChange: (v) => handleSave({ adminOnlyStrategies: v }),
            }}
          />
          
          <ConfigItem
            id="showConnectedAssets"
            label="Connected Assets"
            description="List of assets being monitored for signals"
            icon={Layers}
            value={config.showConnectedAssets}
            onChange={(v) => handleSave({ showConnectedAssets: v })}
            adminOnly={{
              id: "adminOnlyAssets",
              value: config.adminOnlyAssets,
              onChange: (v) => handleSave({ adminOnlyAssets: v }),
            }}
          />
        </CardContent>
      </Card>

      {/* Sidebar Section Visibility */}
      <Card className="shadow-md border border-emerald-100">
        <CardHeader className="bg-gradient-to-r from-purple-50 to-indigo-50 border-b border-purple-100">
          <div className="flex items-center gap-2">
            <Menu className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-xl font-bold text-slate-800">Sidebar Navigation</CardTitle>
          </div>
          <CardDescription>
            Control which sections appear in the sidebar menu. Hidden sections won't be accessible.
          </CardDescription>
        </CardHeader>
        <CardContent className="p-6 space-y-4">
          <ConfigItem
            id="showDashboardSection"
            label="Dashboard"
            description="Main dashboard with overview and metrics"
            icon={LayoutDashboard}
            value={config.showDashboardSection}
            onChange={(v) => handleSave({ showDashboardSection: v })}
          />
          
          <ConfigItem
            id="showStrategiesSection"
            label="Strategies"
            description="Trading strategies management page"
            icon={TrendingUp}
            value={config.showStrategiesSection}
            onChange={(v) => handleSave({ showStrategiesSection: v })}
            adminOnly={{
              id: "adminOnlyStrategiesSection",
              value: config.adminOnlyStrategiesSection,
              onChange: (v) => handleSave({ adminOnlyStrategiesSection: v }),
            }}
          />
          
          <ConfigItem
            id="showAssetsSection"
            label="Assets"
            description="Asset management and monitoring"
            icon={Layers}
            value={config.showAssetsSection}
            onChange={(v) => handleSave({ showAssetsSection: v })}
            adminOnly={{
              id: "adminOnlyAssetsSection",
              value: config.adminOnlyAssetsSection,
              onChange: (v) => handleSave({ adminOnlyAssetsSection: v }),
            }}
          />
          
          <ConfigItem
            id="showSignalsSection"
            label="Signals"
            description="Trading signals listing and management"
            icon={Signal}
            value={config.showSignalsSection}
            onChange={(v) => handleSave({ showSignalsSection: v })}
            adminOnly={{
              id: "adminOnlySignalsSection",
              value: config.adminOnlySignalsSection,
              onChange: (v) => handleSave({ adminOnlySignalsSection: v }),
            }}
          />
          
          <ConfigItem
            id="showChartsSection"
            label="Charts"
            description="Live trading charts with drawing tools"
            icon={BarChart2}
            value={config.showChartsSection}
            onChange={(v) => handleSave({ showChartsSection: v })}
            adminOnly={{
              id: "adminOnlyChartsSection",
              value: config.adminOnlyChartsSection,
              onChange: (v) => handleSave({ adminOnlyChartsSection: v }),
            }}
          />
        </CardContent>
      </Card>

      {/* Preview Info */}
      <Card className="shadow-md border border-blue-100 bg-blue-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <div className="p-2 rounded-lg bg-blue-100 text-blue-600">
              <Eye className="h-5 w-5" />
            </div>
            <div>
              <h3 className="font-semibold text-blue-800">Global Settings</h3>
              <p className="text-sm text-blue-600 mt-1">
                <strong>Changes apply to ALL users immediately.</strong> When you toggle a section off, 
                it will be hidden for everyone. Components marked as "Admin only" will only be visible to admins.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center justify-between pt-4 border-t border-slate-200">
        <Button
          variant="outline"
          onClick={handleReset}
          disabled={isSaving}
          className="text-slate-600 hover:text-slate-800"
        >
          <RotateCcw className="h-4 w-4 mr-2" />
          Reset to Defaults
        </Button>
        
        <div className="flex items-center gap-3">
          {isSaving && (
            <span className="text-sm text-slate-500">Saving...</span>
          )}
          <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200">
            <Save className="h-3 w-3 mr-1" />
            Changes apply globally to all users
          </Badge>
        </div>
      </div>
    </div>
  );
}
