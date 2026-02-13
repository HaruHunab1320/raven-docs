import React, { useRef } from "react";
import { socketAtom } from "@/features/websocket/atoms/socket-atom.ts";
import { useAtom } from "jotai";
import { useQueryClient } from "@tanstack/react-query";
import { WebSocketEvent } from "@/features/websocket/types";

// Track recently sent events to avoid processing our own messages
const recentlySentEvents = new Map<string, number>();
const EVENT_DEBOUNCE_MS = 2000;

export const markEventAsSent = (eventKey: string) => {
  recentlySentEvents.set(eventKey, Date.now());
  // Clean up old entries
  setTimeout(() => {
    recentlySentEvents.delete(eventKey);
  }, EVENT_DEBOUNCE_MS + 100);
};

export const useQuerySubscription = () => {
  const queryClient = useQueryClient();
  const [socket] = useAtom(socketAtom);

  React.useEffect(() => {
    const handleMessage = (event: WebSocketEvent) => {
      const data = event;

      let entity = null;
      let queryKeyId = null;

      switch (data.operation) {
        case "invalidate":
          queryClient.invalidateQueries({
            queryKey: [...data.entity, data.id].filter(Boolean),
          });
          break;
        case "updateOne":
          entity = data.entity[0];
          if (entity === "pages") {
            // Skip updates for pages we just edited (avoid flicker from our own events)
            const eventKey = `${data.id}-${JSON.stringify(data.payload)}`;
            const sentTime = recentlySentEvents.get(eventKey);
            if (sentTime && Date.now() - sentTime < EVENT_DEBOUNCE_MS) {
              return; // Skip this update, it's our own event coming back
            }

            // we have to do this because the usePageQuery cache key is the slugId.
            queryKeyId = data.payload.slugId;
          } else {
            queryKeyId = data.id;
          }

          // only update if data was already in cache
          if (queryClient.getQueryData([...data.entity, queryKeyId])) {
            queryClient.setQueryData([...data.entity, queryKeyId], {
              ...queryClient.getQueryData([...data.entity, queryKeyId]),
              ...data.payload,
            });
          }
          break;
      }
    };

    socket?.on("message", handleMessage);
    return () => {
      socket?.off("message", handleMessage);
    };
  }, [queryClient, socket]);
};
