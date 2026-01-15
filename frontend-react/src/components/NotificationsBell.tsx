import React from "react";
import {
  Badge,
  Box,
  Button,
  HStack,
  Menu,
  MenuButton,
  MenuItem,
  MenuList,
  Spinner,
  Text,
  VStack,
  useColorModeValue,
} from "@chakra-ui/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  fetchNotifications,
  markAllNotificationsRead,
  markNotificationRead,
  type NotificationItem,
} from "../api/notifications";

const BellIcon: React.FC<{ size?: number }> = ({ size = 20 }) => (
  <Box
    as="span"
    display="inline-flex"
    alignItems="center"
    justifyContent="center"
  >
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <path
        d="M12 22a2 2 0 0 0 2-2H10a2 2 0 0 0 2 2Zm6-6V11a6 6 0 1 0-12 0v5L4 18v1h16v-1l-2-2Z"
        fill="currentColor"
      />
    </svg>
  </Box>
);

export const NotificationsBell: React.FC = () => {
  const queryClient = useQueryClient();
  const badgeBg = useColorModeValue("red.500", "red.300");

  const {
    data,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ["notifications", { onlyUnread: false }],
    queryFn: () => fetchNotifications(false, 10),
    refetchInterval: 30000,
  });

  const unreadCount =
    data?.items.filter((n: NotificationItem) => !n.is_read).length ?? 0;

  const markReadMutation = useMutation({
    mutationFn: (id: number) => markNotificationRead(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  const markAllReadMutation = useMutation({
    mutationFn: () => markAllNotificationsRead(),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["notifications"] });
    },
  });

  return (
    <Menu>
      <MenuButton
        as={Button}
        variant="ghost"
        size="sm"
        px={2}
        borderRadius="full"
        aria-label="Abrir notificaciones"
      >
        <Box position="relative">
          <BellIcon />
          {unreadCount > 0 && (
            <Badge
              position="absolute"
              top="-8px"
              right="-10px"
              borderRadius="full"
              px={1}
              fontSize="0.6rem"
              bg={badgeBg}
              color="white"
            >
              {unreadCount}
            </Badge>
          )}
        </Box>
      </MenuButton>
      <MenuList minW="320px">
        <HStack justify="space-between" px={3} py={2}>
          <Text fontSize="sm" fontWeight="semibold">
            Notificaciones
          </Text>
          {unreadCount > 0 && (
            <Text
              as="button"
              fontSize="xs"
              color="green.400"
              onClick={() => markAllReadMutation.mutate()}
            >
              Marcar todas como leídas
            </Text>
          )}
        </HStack>
        <Box borderTopWidth="1px" />
        {isLoading && (
          <HStack px={4} py={3}>
            <Spinner size="sm" />
            <Text fontSize="sm">Cargando notificaciones…</Text>
          </HStack>
        )}
        {isError && !isLoading && (
          <Box px={4} py={3}>
            <Text fontSize="sm" color="red.400">
              No se han podido cargar las notificaciones.
            </Text>
          </Box>
        )}
        {!isLoading && !isError && (data?.items.length ?? 0) === 0 && (
          <Box px={4} py={3}>
            <Text fontSize="sm" color="gray.500">
              No tienes notificaciones por ahora.
            </Text>
          </Box>
        )}
        {!isLoading && !isError && (data?.items.length ?? 0) > 0 && (
          <VStack align="stretch" spacing={1} maxH="360px" overflowY="auto">
            {data!.items.map((n) => (
              <MenuItem
                key={n.id}
                onClick={() => markReadMutation.mutate(n.id)}
                whiteSpace="normal"
                py={2}
              >
                <VStack align="stretch" spacing={0}>
                  <HStack justify="space-between">
                    <Text
                      fontSize="sm"
                      fontWeight={n.is_read ? "normal" : "semibold"}
                    >
                      {n.title}
                    </Text>
                    {!n.is_read && (
                      <Badge colorScheme="green" variant="subtle">
                        Nuevo
                      </Badge>
                    )}
                  </HStack>
                  {n.body && (
                    <Text fontSize="xs" color="gray.500">
                      {n.body}
                    </Text>
                  )}
                </VStack>
              </MenuItem>
            ))}
          </VStack>
        )}
      </MenuList>
    </Menu>
  );
};

