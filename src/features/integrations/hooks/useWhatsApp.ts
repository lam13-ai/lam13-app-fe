import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { queryKeys, useApi } from '@/api';
import type { WhatsAppConnection } from '@/types/api';

/** The WhatsApp connection and the steps that change it (all through `api.whatsapp`). */
export function useWhatsApp() {
  const api = useApi();
  const queryClient = useQueryClient();
  const setConnection = (connection: WhatsAppConnection) => queryClient.setQueryData(queryKeys.whatsapp(), connection);

  return {
    status: useQuery({ queryKey: queryKeys.whatsapp(), queryFn: () => api.whatsapp.status() }),
    request: useMutation({ mutationFn: (phoneNumber: string) => api.whatsapp.requestVerification(phoneNumber) }),
    resend: useMutation({ mutationFn: () => api.whatsapp.resendCode() }),
    verify: useMutation({ mutationFn: (code: string) => api.whatsapp.verifyCode(code), onSuccess: setConnection }),
    disconnect: useMutation({ mutationFn: () => api.whatsapp.disconnect(), onSuccess: setConnection }),
  };
}
