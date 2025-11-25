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
    gcTime: 0,
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
      await loginMutation.mutateAsync(data);
      await refetch();
      return true;
    } catch (error) {
      console.error("Login error:", error);
      return false;
    }
  };

  const signup = async (data: { email: string; password: string; name: string }) => {
    try {
      await signupMutation.mutateAsync(data);
      await refetch();
      return true;
    } catch (error) {
      console.error("Signup error:", error);
      return false;
    }
  };

  const logout = async () => {
    try {
      await logoutMutation.mutateAsync();
      await refetch();
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
