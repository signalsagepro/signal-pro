import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading, refetch } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me", {
          cache: "no-store",
          headers: { "Cache-Control": "no-cache" }
        });
        if (response.ok) return response.json();
        return null;
      } catch {
        return null;
      }
    },
    staleTime: 0,
    gcTime: 300000,
  });

  const loginMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiRequest("POST", "/api/auth/login", data),
  });

  const signupMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name: string }) =>
      apiRequest("POST", "/api/auth/signup", data),
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
  });

  const login = async (data: { email: string; password: string }) => {
    try {
      console.log("🔐 [AUTH] Starting login with email:", data.email);
      const loginResult = await loginMutation.mutateAsync(data);
      console.log("🔐 [AUTH] Login mutation completed:", loginResult);
      
      // Wait a tiny bit to ensure session is set on server
      await new Promise(resolve => setTimeout(resolve, 100));
      console.log("🔐 [AUTH] Waited 100ms, now fetching /api/auth/me");
      
      // Manually fetch and set the user in cache
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      console.log("🔐 [AUTH] /api/auth/me response status:", response.status);
      
      if (response.ok) {
        const userData = await response.json();
        console.log("🔐 [AUTH] Got user data:", userData);
        queryClient.setQueryData(["/api/auth/me"], userData);
        console.log("🔐 [AUTH] Set query data in cache, returning true");
        return true;
      }
      console.log("🔐 [AUTH] Response not OK, returning false");
      return false;
    } catch (error) {
      console.error("🔐 [AUTH] Login error:", error);
      return false;
    }
  };

  const signup = async (data: { email: string; password: string; name: string }) => {
    try {
      await signupMutation.mutateAsync(data);
      // Wait a tiny bit to ensure session is set on server
      await new Promise(resolve => setTimeout(resolve, 100));
      // Manually fetch and set the user in cache
      const response = await fetch("/api/auth/me", {
        cache: "no-store",
        headers: { "Cache-Control": "no-cache" }
      });
      if (response.ok) {
        const userData = await response.json();
        queryClient.setQueryData(["/api/auth/me"], userData);
        return true;
      }
      return false;
    } catch (error) {
      console.error("Signup error:", error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
      // Manually clear the user from cache
      queryClient.setQueryData(["/api/auth/me"], null);
      return true;
    } catch (error) {
      console.error("Logout error:", error);
      return false;
    }
  };

  return {
    user,
    isLoading,
    login,
    loginError: loginMutation.error,
    loginPending: loginMutation.isPending,
    signup,
    signupError: signupMutation.error,
    signupPending: signupMutation.isPending,
    logout,
    logoutPending: logoutMutation.isPending,
  };
}
