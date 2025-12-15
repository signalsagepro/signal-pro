import { useEffect, useState } from "react";
import { useLocation } from "wouter";
import { useToast } from "./use-toast";
import { queryClient } from "@/lib/queryClient";

/**
 * Hook to handle OAuth callbacks from brokers like Zerodha
 * Detects request_token in URL and exchanges it for access_token
 */
export function useOAuthCallback() {
  const [isProcessing, setIsProcessing] = useState(false);
  const [, navigate] = useLocation();
  const { toast } = useToast();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestToken = params.get("request_token");
    const status = params.get("status");
    const action = params.get("action");

    // Check if this is a Zerodha OAuth callback
    if (requestToken && action === "login" && status === "success") {
      handleZerodhaCallback(requestToken);
    } else if (status === "cancelled" || params.get("broker_error")) {
      const error = params.get("broker_error") || "cancelled";
      toast({
        title: "Broker Connection Cancelled",
        description: error === "cancelled" ? "You cancelled the login process." : `Error: ${error}`,
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }, []);

  const handleZerodhaCallback = async (requestToken: string) => {
    setIsProcessing(true);
    
    try {
      // Call the backend to exchange the token
      const response = await fetch("/api/broker-configs/zerodha/exchange-token", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ request_token: requestToken }),
      });

      const data = await response.json();

      if (response.ok && data.success) {
        toast({
          title: "Zerodha Connected!",
          description: "Successfully connected to your Zerodha account.",
        });
        // Refresh broker configs
        queryClient.invalidateQueries({ queryKey: ["/api/broker-configs"] });
      } else {
        toast({
          title: "Connection Failed",
          description: data.error || "Failed to connect to Zerodha.",
          variant: "destructive",
        });
      }
    } catch (error) {
      console.error("OAuth callback error:", error);
      toast({
        title: "Connection Error",
        description: "Failed to process Zerodha login. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsProcessing(false);
      // Clean up URL parameters
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  };

  return { isProcessing };
}
