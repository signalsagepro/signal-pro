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

const STORAGE_KEY = "signalsage_dashboard_config";

export function useDashboardConfig() {
  const [config, setConfig] = useState<DashboardConfig>(DEFAULT_CONFIG);
  const [isLoaded, setIsLoaded] = useState(false);

  // Load config from localStorage
  const loadConfig = useCallback(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed = JSON.parse(stored);
        setConfig({ ...DEFAULT_CONFIG, ...parsed });
      } else {
        setConfig(DEFAULT_CONFIG);
      }
    } catch (error) {
      console.error("Failed to load dashboard config:", error);
    }
  }, []);

  // Load on mount and listen for changes
  useEffect(() => {
    loadConfig();
    setIsLoaded(true);

    // Listen for config changes from other components
    const handleConfigChange = () => {
      loadConfig();
    };

    window.addEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
    window.addEventListener("storage", handleConfigChange);

    return () => {
      window.removeEventListener(CONFIG_CHANGE_EVENT, handleConfigChange);
      window.removeEventListener("storage", handleConfigChange);
    };
  }, [loadConfig]);

  // Save config to localStorage and broadcast change
  const saveConfig = (newConfig: Partial<DashboardConfig>) => {
    const updated = { ...config, ...newConfig };
    setConfig(updated);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT));
    } catch (error) {
      console.error("Failed to save dashboard config:", error);
    }
  };

  // Reset to defaults and broadcast change
  const resetConfig = () => {
    setConfig(DEFAULT_CONFIG);
    try {
      localStorage.removeItem(STORAGE_KEY);
      // Dispatch custom event to notify other components
      window.dispatchEvent(new CustomEvent(CONFIG_CHANGE_EVENT));
    } catch (error) {
      console.error("Failed to reset dashboard config:", error);
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
    saveConfig,
    resetConfig,
    isVisible,
  };
}

export default useDashboardConfig;
