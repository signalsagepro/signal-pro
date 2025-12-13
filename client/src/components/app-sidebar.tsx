import { LayoutDashboard, TrendingUp, Layers, Bell, Settings, Code2, Signal, LogOut, Users as UsersIcon, LineChart } from "lucide-react";
import { Link, useLocation } from "wouter";
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarHeader,
  SidebarFooter,
} from "@/components/ui/sidebar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/use-auth";
import { useDashboardConfig } from "@/hooks/use-dashboard-config";

interface AppSidebarProps {
  devMode: boolean;
  superDevMode: boolean;
  onLogoClick: () => void;
}

const mainNavItems = [
  {
    title: "Dashboard",
    url: "/",
    icon: LayoutDashboard,
    testId: "link-dashboard",
  },
  {
    title: "Strategies",
    url: "/strategies",
    icon: TrendingUp,
    testId: "link-strategies",
  },
  {
    title: "Assets",
    url: "/assets",
    icon: Layers,
    testId: "link-assets",
  },
  {
    title: "Signals",
    url: "/signals",
    icon: Signal,
    testId: "link-signals",
  },
  {
    title: "Charts",
    url: "/charts",
    icon: LineChart,
    testId: "link-charts",
  },
];

const configNavItems = [
  {
    title: "Brokers",
    url: "/config/brokers",
    icon: Settings,
    testId: "link-config-brokers",
  },
  {
    title: "Notifications",
    url: "/config/notifications",
    icon: Bell,
    testId: "link-config-notifications",
  },
];

const adminNavItems = [
  {
    title: "Users",
    url: "/users",
    icon: UsersIcon,
    testId: "link-users",
  },
];

export function AppSidebar({ devMode, superDevMode, onLogoClick }: AppSidebarProps) {
  const [location] = useLocation();
  const { user, logout } = useAuth();
  const { config } = useDashboardConfig();
  const isAdmin = user?.role === "admin";

  // Filter nav items based on config and user role
  const filteredNavItems = mainNavItems.filter((item) => {
    if (item.url === "/") {
      return config.showDashboardSection;
    }
    if (item.url === "/strategies") {
      return config.showStrategiesSection && (!config.adminOnlyStrategiesSection || isAdmin);
    }
    if (item.url === "/assets") {
      return config.showAssetsSection && (!config.adminOnlyAssetsSection || isAdmin);
    }
    if (item.url === "/signals") {
      return config.showSignalsSection && (!config.adminOnlySignalsSection || isAdmin);
    }
    if (item.url === "/charts") {
      return config.showChartsSection && (!config.adminOnlyChartsSection || isAdmin);
    }
    return true;
  });

  return (
    <Sidebar className="border-r border-emerald-200 bg-white">
      <SidebarHeader className="p-4 border-b border-emerald-100">
        <button
          onClick={onLogoClick}
          className="flex items-center gap-3 hover:bg-emerald-50 rounded-lg p-3 -m-1 transition-all duration-300"
          data-testid="button-logo"
        >
          <div className="relative">
            <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-teal-500 rounded-lg blur-md opacity-30"></div>
            <div className="relative flex h-10 w-10 items-center justify-center rounded-lg bg-gradient-to-br from-emerald-500 to-teal-500 text-white shadow-lg">
              <Signal className="h-6 w-6" />
            </div>
          </div>
          <div className="flex flex-col items-start">
            <span className="text-base font-bold bg-gradient-to-r from-emerald-600 to-teal-600 bg-clip-text text-transparent">SignalSage</span>
            <span className="text-xs text-slate-500">Elite Trading Platform</span>
          </div>
        </button>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {filteredNavItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton
                    asChild
                    isActive={location === item.url}
                    data-testid={item.testId}
                  >
                    <Link href={item.url}>
                      <item.icon className="h-4 w-4" />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>

        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Configuration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {configNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={item.testId}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel>Administration</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                {adminNavItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton
                      asChild
                      isActive={location === item.url}
                      data-testid={item.testId}
                    >
                      <Link href={item.url}>
                        <item.icon className="h-4 w-4" />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}

        {devMode && user?.role === "admin" && (
          <SidebarGroup>
            <SidebarGroupLabel className="flex items-center gap-2">
              Developer
              <Badge variant="secondary" className="text-xs">DEV</Badge>
            </SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/dev/logs"}
                    data-testid="link-dev-logs"
                  >
                    <Link href="/dev/logs">
                      <Code2 className="h-4 w-4" />
                      <span>Logs</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    asChild
                    isActive={location === "/dev/dashboard-settings"}
                    data-testid="link-dev-dashboard-settings"
                  >
                    <Link href="/dev/dashboard-settings">
                      <Code2 className="h-4 w-4" />
                      <span>Dashboard Settings</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {superDevMode && (
                  <SidebarMenuItem>
                    <SidebarMenuButton
                      asChild
                      isActive={location === "/dev/strategy-builder"}
                      data-testid="link-dev-strategy-builder"
                    >
                      <Link href="/dev/strategy-builder">
                        <Code2 className="h-4 w-4" />
                        <span>Strategy Builder</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        )}
      </SidebarContent>

      <SidebarFooter className="p-4 space-y-3 border-t border-emerald-100">
        <div className="px-3 py-2 rounded-lg bg-gradient-to-r from-emerald-50 to-teal-50 border border-emerald-200">
          <p className="font-semibold text-sm text-slate-700">{user?.name}</p>
          <p className="text-xs text-emerald-600">{user?.role === "admin" ? "Administrator" : "Trader"}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50"
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
        {devMode && user?.role === "admin" && (
          <div className="rounded-lg bg-emerald-50 p-3 border border-emerald-200">
            <div className="flex items-center gap-2 text-xs">
              <Code2 className="h-3 w-3 text-emerald-600" />
              <span className="text-emerald-600 font-medium">Developer Mode Active</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
