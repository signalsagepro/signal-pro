import { LayoutDashboard, TrendingUp, Layers, Bell, Settings, Code2, Signal, LogOut, Users as UsersIcon } from "lucide-react";
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

  return (
    <Sidebar>
      <SidebarHeader className="p-4">
        <button
          onClick={onLogoClick}
          className="flex items-center gap-2 hover-elevate active-elevate-2 rounded-md p-2 -m-2"
          data-testid="button-logo"
        >
          <div className="flex h-8 w-8 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Signal className="h-5 w-5" />
          </div>
          <div className="flex flex-col items-start">
            <span className="text-sm font-semibold">SignalPro</span>
            <span className="text-xs text-muted-foreground">v1.0.0</span>
          </div>
        </button>
      </SidebarHeader>
      
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Main</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {mainNavItems.map((item) => (
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

      <SidebarFooter className="p-4 space-y-2">
        <div className="text-xs text-muted-foreground px-2">
          <p className="font-medium">{user?.name}</p>
          <p>{user?.role === "admin" ? "Administrator" : "User"}</p>
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="w-full justify-start text-destructive hover:text-destructive"
          onClick={() => logout()}
          data-testid="button-logout"
        >
          <LogOut className="h-4 w-4 mr-2" />
          Logout
        </Button>
        {devMode && user?.role === "admin" && (
          <div className="rounded-md bg-muted p-3 border border-border">
            <div className="flex items-center gap-2 text-xs">
              <Code2 className="h-3 w-3 text-muted-foreground" />
              <span className="text-muted-foreground">Developer Mode Active</span>
            </div>
          </div>
        )}
      </SidebarFooter>
    </Sidebar>
  );
}
