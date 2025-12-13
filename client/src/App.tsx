import { useState, useEffect } from "react";
import { Switch, Route, useLocation } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";
import { ThemeProvider } from "@/components/theme-provider";
import { ThemeToggle } from "@/components/theme-toggle";
import { AppSidebar } from "@/components/app-sidebar";
import { useAuth } from "@/hooks/use-auth";
import NotFound from "@/pages/not-found";
import Login from "@/pages/login";
import Dashboard from "@/pages/dashboard";
import Strategies from "@/pages/strategies";
import Assets from "@/pages/assets";
import Signals from "@/pages/signals";
import ConfigBrokers from "@/pages/config-brokers";
import ConfigNotifications from "@/pages/config-notifications";
import Users from "@/pages/users";
import DevLogs from "@/pages/dev-logs";
import DevStrategyBuilder from "@/pages/dev-strategy-builder";

function Router({ devMode, superDevMode, isAdmin }: { devMode: boolean; superDevMode: boolean; isAdmin: boolean }) {
  return (
    <Switch>
      <Route path="/" component={Dashboard} />
      <Route path="/strategies" component={Strategies} />
      <Route path="/assets" component={Assets} />
      <Route path="/signals" component={Signals} />
      {isAdmin && <Route path="/config/brokers" component={ConfigBrokers} />}
      {isAdmin && <Route path="/config/notifications" component={ConfigNotifications} />}
      {isAdmin && <Route path="/users" component={Users} />}
      {devMode && isAdmin && <Route path="/dev/logs" component={DevLogs} />}
      {superDevMode && isAdmin && <Route path="/dev/strategy-builder" component={DevStrategyBuilder} />}
      <Route component={NotFound} />
    </Switch>
  );
}

function AuthGuard() {
  const { user, isLoading } = useAuth();
  const [, navigate] = useLocation();

  useEffect(() => {
    if (!isLoading && !user) {
      navigate("/login");
    }
  }, [isLoading, user, navigate]);

  if (isLoading) {
    return <div className="flex items-center justify-center h-screen">Loading...</div>;
  }

  if (!user) {
    return null;
  }

  return <ProtectedLayout />;
}

function ProtectedLayout() {
  const { user } = useAuth();
  const [devMode, setDevMode] = useState(false);
  const [superDevMode, setSuperDevMode] = useState(false);
  const [logoClickCount, setLogoClickCount] = useState(0);
  const [lastClickTime, setLastClickTime] = useState(0);

  const handleLogoClick = () => {
    if (user?.role !== "admin") return;
    
    const now = Date.now();
    
    if (now - lastClickTime > 2000) {
      setLogoClickCount(1);
    } else {
      const newCount = logoClickCount + 1;
      setLogoClickCount(newCount);

      if (newCount === 7 && !devMode) {
        setDevMode(true);
        setLogoClickCount(0);
      } else if (newCount === 7 && devMode && !superDevMode) {
        setSuperDevMode(true);
        setLogoClickCount(0);
      } else if (newCount === 7 && devMode && superDevMode) {
        setDevMode(false);
        setSuperDevMode(false);
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
    <div className={devMode ? "hacker-mode" : ""}>
      <SidebarProvider style={style as React.CSSProperties}>
        <div className="flex h-screen w-full bg-gradient-to-br from-white via-slate-50 to-emerald-50/30">
          <AppSidebar devMode={devMode} superDevMode={superDevMode} onLogoClick={handleLogoClick} />
          <div className="flex flex-col flex-1">
            <header className="flex items-center justify-between p-4 border-b border-emerald-200 bg-white/80 backdrop-blur-sm gap-4">
              <SidebarTrigger data-testid="button-sidebar-toggle" />
              <ThemeToggle />
            </header>
            <main className="flex-1 overflow-auto p-6 bg-gradient-to-br from-white via-slate-50/50 to-emerald-50/20">
              <Router devMode={devMode} superDevMode={superDevMode} isAdmin={user?.role === "admin"} />
            </main>
          </div>
        </div>
      </SidebarProvider>
    </div>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider defaultTheme="light">
        <TooltipProvider>
          <Switch>
            <Route path="/login" component={Login} />
            <Route component={AuthGuard} />
          </Switch>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

export default App;
