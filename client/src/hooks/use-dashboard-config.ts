import { useState, useEffect, useCallback } from "react";

// Custom event for config changes
const CONFIG_CHANGE_EVENT = "signalsage_config_change";

export interface DashboardConfig {
  // Dashboard component visibility
  showMetricCards: boolean;
  showNiftyChart: boolean;
  showSensexChart: boolean;
  showRecentSignals: boolean;
  showActiveStrategies: boolean;
  showConnectedAssets: boolean;
  
  // Role-based visibility for dashboard
  adminOnlyMetrics: boolean;
  adminOnlyCharts: boolean;
  adminOnlySignals: boolean;
  adminOnlyStrategies: boolean;
  adminOnlyAssets: boolean;
  
  // Sidebar section visibility
  showDashboardSection: boolean;
  showStrategiesSection: boolean;
  showAssetsSection: boolean;
  showSignalsSection: boolean;
  showChartsSection: boolean;
  
  // Admin-only sidebar sections
  adminOnlyStrategiesSection: boolean;
  adminOnlyAssetsSection: boolean;
  adminOnlySignalsSection: boolean;
  adminOnlyChartsSection: boolean;
}

const DEFAULT_CONFIG: DashboardConfig = {
  // Dashboard components
  showMetricCards: true,
  showNiftyChart: true,
  showSensexChart: true,
  showRecentSignals: true,
  showActiveStrategies: true,
  showConnectedAssets: true,
  
  // Admin-only dashboard
  adminOnlyMetrics: false,
  adminOnlyCharts: false,
  adminOnlySignals: false,
  adminOnlyStrategies: false,
  adminOnlyAssets: false,
  
  // Sidebar sections
  showDashboardSection: true,
  showStrategiesSection: true,
  showAssetsSection: true,
  showSignalsSection: true,
  showChartsSection: true,
  
  // Admin-only sidebar
  adminOnlyStrategiesSection: false,
  adminOnlyAssetsSection: false,
  adminOnlySignalsSection: false,
  adminOnlyChartsSection: false,
};

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  // Load config from server (global config applies to all users)
  const loadConfig = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard-config", {
        credentials: "include",
      });
      if (response.ok) {
        const data = await response.json();
        setConfig({ ...DEFAULT_CONFIG, ...data });
      } else {
        // Fallback to defaults if not authenticated or error
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error("Failed to load dashboard config:", error);
      setConfig(DEFAULT_CONFIG);
    }
    setIsLoaded(true);
  }, []);

  // Load on mount and listen for changes
  useEffect(() => {
    loadConfig();

    // Listen for config changes from other components (e.g., after admin saves)
    const handleConfigChange = () => {
      loadConfig();
    };

    window.addEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);

    return () => {
      window.removeEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
    };
  }, [loadConfig]);

  // Save config to server (admin only) - applies globally to all users
  const saveConfig = async (newConfig: Partial<DashboardConfig>): Promise<boolean> => {
    const updated = { ...config, ...newConfig };
    // Update local state immediately for responsive UI
    setConfig(updated);
    setIsSaving(true);
    
    try {
      const response = await fetch("/api/dashboard-config", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(updated),
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        // Notify other components to reload
        window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT));
        setIsSaving(false);
        return true;
      } else {
        // Revert on failure
        const error = await response.json();
        console.error("Failed to save config:", error);
        loadConfig(); // Reload from server to revert
        setIsSaving(false);
        return false;
      }
    } catch (error) {
      console.error("Failed to save dashboard config:", error);
      loadConfig(); // Reload from server to revert
      setIsSaving(false);
      return false;
    }
  };

  // Reset to defaults (admin only) - applies globally
  const resetConfig = async (): Promise<boolean> => {
    setIsSaving(true);
    try {
      const response = await fetch("/api/dashboard-config/reset", {
        method: "POST",
        credentials: "include",
      });
      
      if (response.ok) {
        const data = await response.json();
        setConfig(data);
        // Notify other components to reload
        window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT));
        setIsSaving(false);
        return true;
      } else {
        setIsSaving(false);
        return false;
      }
    } catch (error) {
      console.error("Failed to reset dashboard config:", error);
      setIsSaving(false);
      return false;
    }
  };

  // Check if a component should be visible for a given role
  const isVisible = (component: keyof DashboardConfig, isAdmin: boolean): boolean => {
    const showKey = component as keyof DashboardConfig;
    const adminOnlyKey = `adminOnly${component.replace('show', '')}` as keyof DashboardConfig;
    
    // If component is hidden, return false
    if (!config[showKey]) return false;
    
    // If admin-only and user is not admin, return false
    if (config[adminOnlyKey] && !isAdmin) return false;
    
    return true;
  };

  return {
    config,
    isLoaded,
    isSaving,
    saveConfig,
    resetConfig,
    isVisible,
    reloadConfig: loadConfig,
  };
}

export default useDashboardConfig;
