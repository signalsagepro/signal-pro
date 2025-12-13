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
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-emerald-950 via-slate-950 to-blue-950 p-4 relative overflow-hidden">
      {/* Animated background elements */}
      <div className="absolute inset-0 overflow-hidden">
        <div className="absolute -top-40 -right-40 w-80 h-80 bg-emerald-500/10 rounded-full blur-3xl animate-pulse"></div>
        <div className="absolute -bottom-40 -left-40 w-80 h-80 bg-blue-500/10 rounded-full blur-3xl animate-pulse" style={{animationDelay: '1s'}}></div>
        <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-emerald-500/5 rounded-full blur-3xl animate-pulse" style={{animationDelay: '2s'}}></div>
      </div>
      
      <div className="w-full max-w-md relative z-10">
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <div className="relative">
              <div className="absolute inset-0 bg-gradient-to-br from-emerald-500 to-blue-500 rounded-2xl blur-xl opacity-50 animate-pulse"></div>
              <div className="relative flex h-20 w-20 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-500 via-teal-500 to-blue-500 text-white shadow-2xl">
                <svg className="h-10 w-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M13 7h8m0 0v8m0-8l-8 8-4-4-6 6" />
                </svg>
              </div>
            </div>
          </div>
          <h1 className="text-4xl font-bold mb-3 bg-gradient-to-r from-emerald-400 via-teal-400 to-blue-400 bg-clip-text text-transparent">SignalSage</h1>
          <p className="text-slate-300 text-lg font-medium">Elite Trading Intelligence Platform</p>
          <p className="text-slate-400 text-sm mt-2">Precision • Performance • Profit</p>
        </div>
        
        <Card className="shadow-2xl border-2 border-emerald-500/20 bg-slate-900/80 backdrop-blur-xl">
          <CardHeader className="space-y-2">
            <CardTitle className="text-2xl font-bold text-white">Welcome Back, Trader</CardTitle>
            <CardDescription className="text-slate-300">Access your professional trading command center</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Email Address</label>
                <Input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="trader@signalsage.com"
                  data-testid="input-email"
                  className="bg-slate-800/50 border-emerald-500/30 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20 h-12"
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-semibold text-slate-200">Password</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  data-testid="input-password"
                  className="bg-slate-800/50 border-emerald-500/30 text-white placeholder:text-slate-500 focus:border-emerald-500 focus:ring-emerald-500/20 h-12"
                />
              </div>
              {loginError && (
                <div className="p-4 rounded-lg bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-medium flex items-center gap-2">
                  <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Invalid credentials. Please verify and try again.
                </div>
              )}
              <Button 
                type="submit" 
                disabled={loginPending} 
                className="w-full h-12 text-base font-bold bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-600 hover:to-teal-600 text-white shadow-lg hover:shadow-emerald-500/50 transition-all duration-300" 
                data-testid="button-login"
              >
                {loginPending ? (
                  <span className="flex items-center gap-2">
                    <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Authenticating...
                  </span>
                ) : (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h7a3 3 0 013 3v1" />
                    </svg>
                    Access Trading Platform
                  </span>
                )}
              </Button>
            </form>
            <div className="mt-6 pt-6 border-t border-slate-700/50 text-center">
              <p className="text-slate-400 text-xs">
                🔒 Secured with enterprise-grade encryption
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
