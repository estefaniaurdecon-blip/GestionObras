import { lazy, Suspense, useEffect, useRef } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { PersistQueryClientProvider } from "@tanstack/react-query-persist-client";
import { HashRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "./contexts/AuthContext";
import { UserPermissionsProvider } from "./contexts/UserPermissionsContext";
import ProtectedRoute from "@/components/ProtectedRoute";
import { CacheCleaner } from "@/components/CacheCleaner";
import { OfflineIndicator } from "@/components/OfflineIndicator";
import { NativeSplashHider } from "@/components/NativeSplashHider";
import { queryClient, persistOptions } from "@/lib/queryClient";
import { startupPerfEnd, startupPerfPoint, startupPerfStart } from "@/utils/startupPerf";

const Index = lazy(() => import("./pages/Index"));
const Projects = lazy(() => import("./pages/Projects"));
const TaskCalendar = lazy(() => import("./pages/TaskCalendar"));
const WorkManagementWorkspace = lazy(() => import("./pages/WorkManagementWorkspace"));
const Radar = lazy(() => import("./pages/Radar"));
const Auth = lazy(() => import("./pages/Auth"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const NotFound = lazy(() => import("./pages/NotFound"));

const App = () => {
  const firstRenderMeasuredRef = useRef(false);

  if (!firstRenderMeasuredRef.current) {
    firstRenderMeasuredRef.current = true;
    startupPerfStart("app:first-render-to-commit");
    startupPerfPoint("App first render");
  }

  useEffect(() => {
    // Ocultar el loader HTML solo cuando React realmente ha montado
    window.__hideAppLoading?.();
    startupPerfEnd("app:first-render-to-commit");
    startupPerfEnd("main:root-render-to-app-mounted");
    startupPerfPoint("App mounted");
  }, []);

  return (
    <PersistQueryClientProvider client={queryClient} persistOptions={persistOptions}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <OfflineIndicator />
        <NativeSplashHider />
        <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
          <AuthProvider>
            <UserPermissionsProvider>
              <CacheCleaner />
              <Suspense fallback={<div className="min-h-screen bg-slate-100" />}>
                <Routes>
                  <Route
                    path="/"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/dashboard"
                    element={
                      <ProtectedRoute>
                        <Index />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/projects"
                    element={
                      <ProtectedRoute>
                        <Projects />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/task-calendar"
                    element={
                      <ProtectedRoute>
                        <TaskCalendar />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/work-management/:workId"
                    element={
                      <ProtectedRoute>
                        <WorkManagementWorkspace />
                      </ProtectedRoute>
                    }
                  />
                  <Route
                    path="/radar"
                    element={
                      <ProtectedRoute>
                        <Radar />
                      </ProtectedRoute>
                    }
                  />
                  <Route path="/auth" element={<Auth />} />
                  <Route path="/update-password" element={<UpdatePassword />} />
                  {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
                  <Route path="*" element={<NotFound />} />
                </Routes>
              </Suspense>
            </UserPermissionsProvider>
          </AuthProvider>
        </HashRouter>
      </TooltipProvider>
    </PersistQueryClientProvider>
  );
};

export default App;
