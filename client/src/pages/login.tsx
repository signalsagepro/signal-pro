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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/5 via-background to-accent/5 p-4">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-gradient-to-br from-primary to-primary/80 text-primary-foreground shadow-lg">
              <svg className="h-8 w-8" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
            </div>
          </div>
          <h1 className="text-3xl font-bold mb-2">SignalPro</h1>
          <p className="text-muted-foreground">Professional Trading Signals</p>
        </div>
        
        <Card className="shadow-lg border border-primary/10">
          <CardHeader>
            <CardTitle className="text-xl">Welcome Back</CardTitle>
            <CardDescription>Sign in to access your trading dashboard</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold">Email Address</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  data-testid="input-email"
                  className="border-primary/20 focus:border-primary"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="input-password"
                  className="border-primary/20 focus:border-primary"
                />
              </div>
              {loginError && (
                <div className="p-3 rounded-lg bg-destructive/10 text-destructive text-sm font-medium">
                  Invalid credentials. Please try again.
                </div>
              )}
              <Button type="submit" disabled={loginPending} className="w-full py-6 text-base font-semibold" data-testid="button-login">
                {loginPending ? "Logging in..." : "Sign In"}
              </Button>
            </form>
            <div className="mt-6 text-center text-sm text-muted-foreground">
              Don't have an account? <a href="/signup" className="text-primary font-semibold hover:underline">Sign up</a>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
