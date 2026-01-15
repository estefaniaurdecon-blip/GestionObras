import { useQuery } from "@tanstack/react-query";

import { fetchCurrentUser, type CurrentUser } from "../api/users";

// Siempre obtiene el usuario desde el backend para evitar confiar en el cliente.
export const useCurrentUser = () =>
  useQuery<CurrentUser>({
    queryKey: ["current-user"],
    queryFn: fetchCurrentUser,
  });
