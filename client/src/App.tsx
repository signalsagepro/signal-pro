import { useState, useEffect } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import NotFound from "@/pages/not-found";
import Dashboard from "@/pages/dashboard";
import Strategies from "@/pages/strategies";
import Assets from "@/pages/assets";
import Signals from "@/pages/signals";
import ConfigBrokers from "@/pages/config-brokers";
import ConfigNotifications from "@/pages/config-notifications";
import DevStrategyBuilder from "@/pages/dev-strategy-builder";

function Router({ devMode }: { devMode: boolean }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/strategies" component={Strategies} />
      <Route path="/assets" component={Assets} />
      <Route path="/signals" component={Signals} />
      <Route path="/config/brokers" component={ConfigBrokers} />
      <Route path="/config/notifications" component={ConfigNotifications} />
      {devMode && <Route path="/dev/strategy-builder" component={DevStrategyBuilder} />}
      <Route component={NotFound} />
    </Switch>
  );
}

function App() {
  const [devMode, setDevMode] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleLogoClick = () => {
    const now = Date.now();
    
    if (now - lastClickTime > 2000) {
      setLogoClickCount(1);
    } else {
      const newCount = logoClickCount + 1;
      setLogoClickCount(newCount);

      if (newCount === 7) {
        setDevMode(true);
        setLogoClickCount(0);
      }
    }
    
    setLastClickTime(now);
  };

  const style = {
    "--sidebar-width": "17rem",
    "--sidebar-width-icon": "4rem",
  };

  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <SidebarProvider style={style as React.CSSProperties}>
            <div className="flex h-screen w-full">
              <AppSidebar devMode={devMode} onLogoClick={handleLogoClick} />
              <div className="flex flex-col flex-1">
                <header className="flex items-center justify-between p-4 border-b gap-4">
                  <SidebarTrigger data-testid="button-sidebar-toggle" />
                  <ThemeToggle />
                </header>
                <main className="flex-1 overflow-auto p-6">
                  <Router devMode={devMode} />
                </main>
              </div>
            </div>
          </SidebarProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
