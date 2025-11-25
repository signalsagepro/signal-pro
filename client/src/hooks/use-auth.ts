import { useQuery, useMutation } from "@tanstack/react-query";
import { queryClient, apiRequest } from "@/lib/queryClient";
import { type User } from "@shared/schema";

export function useAuth() {
  const { data: user, isLoading } = useQuery<User | null>({
    queryKey: ["/api/auth/me"],
    queryFn: async () => {
      try {
        const response = await fetch("/api/auth/me");
        if (response.ok) return response.json();
        return null;
      } catch {
        return null;
      }
    },
  });

  const loginMutation = useMutation({
    mutationFn: (data: { email: string; password: string }) =>
      apiRequest("POST", "/api/auth/login", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const signupMutation = useMutation({
    mutationFn: (data: { email: string; password: string; name: string }) =>
      apiRequest("POST", "/api/auth/signup", data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  const logoutMutation = useMutation({
    mutationFn: () => apiRequest("POST", "/api/auth/logout", {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["/api/auth/me"] });
    },
  });

  return {
    user,
    isLoading,
    login: loginMutation.mutate,
    loginError: loginMutation.error,
    loginPending: loginMutation.isPending,
    signup: signupMutation.mutate,
    signupError: signupMutation.error,
    signupPending: signupMutation.isPending,
    logout: logoutMutation.mutate,
    logoutPending: logoutMutation.isPending,
  };
}
