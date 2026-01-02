import { useAtom } from "jotai";
import { mcpSocketAtom } from "../atoms/mcp-socket-atom";
import { useEffect, useState } from "react";
import { MCPEvent, MCPResourceType } from "../types/mcp-event.types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getBackendUrl } from "@/lib/config";
import api from "@/lib/api-client";

/**
 * Hook to subscribe to MCP events for a specific resource
 * @param resourceType The type of resource to subscribe to
 * @param resourceId The ID of the resource to subscribe to
 */
export const useMCPEventSubscription = (
  resourceType: MCPResourceType,
  resourceId: string
) => {
  const [socket] = useAtom(mcpSocketAtom);
  const [isSubscribed, setIsSubscribed] = useState(false);
  const queryClient = useQueryClient();

  // Function to subscribe to events
  const subscribe = async () => {
    if (!socket || !resourceType || !resourceId) return;

    socket.emit("mcp:subscribe", {
      resourceType,
      resourceId,
    });

    setIsSubscribed(true);
  };

  // Function to unsubscribe from events
  const unsubscribe = async () => {
    if (!socket || !resourceType || !resourceId) return;

    socket.emit("mcp:unsubscribe", {
      resourceType,
      resourceId,
    });

    setIsSubscribed(false);
  };

  // Subscribe when component mounts and unsubscribe when it unmounts
  useEffect(() => {
    if (socket && resourceType && resourceId) {
      subscribe();

      return () => {
        unsubscribe();
      };
    }
  }, [socket, resourceType, resourceId]);

  return {
    isSubscribed,
    subscribe,
    unsubscribe,
  };
};

/**
 * Hook to fetch an MCP API key for the current user
 */
export const useCreateMCPApiKey = () => {
  return useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post(`${getBackendUrl()}/api-keys`, { name });
      return response;
    },
  });
};

/**
 * Hook to get the list of API keys for the current user
 */
export const useListMCPApiKeys = () => {
  return useQuery({
    queryKey: ["apiKeys"],
    queryFn: async () => {
      const response = await api.get(`${getBackendUrl()}/api-keys`);
      return response.data?.keys || [];
    },
  });
};

/**
 * Hook to revoke an API key
 */
export const useRevokeMCPApiKey = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (keyId: string) => {
      const response = await api.delete(`${getBackendUrl()}/api-keys/${keyId}`);
      return response;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["apiKeys"] });
    },
  });
};
