import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useAuth } from "@/hooks/use-auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";

export default function Login() {
  const [, navigate] = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoggingIn, setIsLoggingIn] = useState(false);
  const { user, login, loginPending, loginError } = useAuth();
  const { toast } = useToast();

  useEffect(() => {
    console.log("🔐 [LOGIN PAGE] useEffect triggered - user:", user, "isLoggingIn:", isLoggingIn);
    if (user && isLoggingIn) {
      console.log("🔐 [LOGIN PAGE] User logged in and isLoggingIn=true, navigating to /");
      toast({ title: "Login successful", description: "Welcome back!" });
      navigate("/");
      setIsLoggingIn(false);
    }
  }, [user, isLoggingIn, navigate, toast]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    console.log("🔐 [LOGIN PAGE] Form submitted, calling login function");
    setIsLoggingIn(true);
    const success = await login({ email, password });
    console.log("🔐 [LOGIN PAGE] Login function returned:", success);
    if (!success) {
      console.log("🔐 [LOGIN PAGE] Login failed, showing error toast");
      toast({ title: "Login failed", description: "Invalid email or password", variant: "destructive" });
      setIsLoggingIn(false);
    } else {
      console.log("🔐 [LOGIN PAGE] Login succeeded, waiting for useEffect to trigger");
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle>SignalPro</CardTitle>
          <CardDescription>Login to your trading signal dashboard</CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="text-sm font-medium">Email</label>
              <Input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                data-testid="input-email"
              />
            </div>
            <div>
              <label className="text-sm font-medium">Password</label>
              <Input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                data-testid="input-password"
              />
            </div>
            {loginError && <div className="text-sm text-destructive">Invalid credentials</div>}
            <Button type="submit" disabled={loginPending} className="w-full" data-testid="button-login">
              {loginPending ? "Logging in..." : "Login"}
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
