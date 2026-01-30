import React from "react";
import ReactDOM from "react-dom/client";
import { ChakraProvider, ColorModeScript, Center, Spinner } from "@chakra-ui/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "@tanstack/react-router";
import { router } from "./router";
import { buildTheme, theme as defaultTheme } from "./theme";
import "./i18n";
import { useCurrentUser } from "./hooks/useCurrentUser";
import { fetchBranding } from "./api/branding";
import { useMemo, useEffect } from "react";
import { useQuery } from "@tanstack/react-query";

// Cliente de React Query para gestionar cache de peticiones.
const queryClient = new QueryClient();

const ensureFonts = () => {
  if (document.getElementById("font-space-grotesk")) return;
  const link = document.createElement("link");
  link.id = "font-space-grotesk";
  link.rel = "stylesheet";
  link.href =
    "https://fonts.googleapis.com/css2?family=IBM+Plex+Sans:wght@300;400;500;600;700&family=Space+Grotesk:wght@400;500;600;700&display=swap";
  document.head.appendChild(link);
};

ensureFonts();

const rootElement = document.getElementById("root") as HTMLElement;

const AppRoot: React.FC = () => {
  const { data: currentUser } = useCurrentUser();
  const tenantId = currentUser?.tenant_id ?? null;
  const isSuperAdmin = Boolean(currentUser?.is_super_admin);

  const brandingQuery = useQuery({
    queryKey: ["tenant-branding-global", tenantId],
    queryFn: () => fetchBranding(tenantId as number),
    enabled: Boolean(tenantId) && !isSuperAdmin,
  });

  const needsBranding = !isSuperAdmin && Boolean(tenantId);
  const isBrandingLoading =
    needsBranding && (brandingQuery.isLoading || (!brandingQuery.data && brandingQuery.isFetching));

  const theme = useMemo(() => {
    const palette =
      !isSuperAdmin && tenantId ? brandingQuery.data?.color_palette : undefined;
    return buildTheme(palette);
  }, [brandingQuery.data?.color_palette, isSuperAdmin, tenantId]);

  if (isBrandingLoading) {
    return (
      <ChakraProvider theme={defaultTheme}>
        <ColorModeScript initialColorMode={defaultTheme.config.initialColorMode} />
        <Center minH="100vh" bg="gray.50">
          <Spinner size="lg" />
        </Center>
      </ChakraProvider>
    );
  }

  return (
    <ChakraProvider theme={theme}>
      <ColorModeScript initialColorMode={defaultTheme.config.initialColorMode} />
      <RouterProvider router={router} />
    </ChakraProvider>
  );
};

ReactDOM.createRoot(rootElement).render(
  <React.StrictMode>
    <QueryClientProvider client={queryClient}>
      <AppRoot />
    </QueryClientProvider>
  </React.StrictMode>,
);
