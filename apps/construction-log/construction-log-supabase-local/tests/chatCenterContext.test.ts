import { describe, expect, it } from 'vitest';

import {
  clearConversationSelection,
  selectConversationDirect,
  selectConversationFromWork,
} from '@/components/chatCenterContext';

describe('chatCenterContext', () => {
  it('establece contexto visible de obra al abrir un DM desde una obra', () => {
    const selection = selectConversationFromWork('42', {
      workId: 7,
      workName: 'Obra Norte',
    });

    expect(selection).toEqual({
      selectedUserId: '42',
      activeWorkContext: {
        workId: 7,
        workName: 'Obra Norte',
      },
      selectedWorkConversation: null,
    });
  });

  it('limpia el contexto al abrir el mismo DM por acceso normal', () => {
    const withWork = selectConversationFromWork('42', {
      workId: 7,
      workName: 'Obra Norte',
    });
    expect(withWork.activeWorkContext?.workName).toBe('Obra Norte');

    const direct = selectConversationDirect('42');
    expect(direct).toEqual({
      selectedUserId: '42',
      activeWorkContext: null,
      selectedWorkConversation: null,
    });
  });

  it('actualiza el contexto visual al abrir el mismo DM desde otra obra sin cambiar la identidad de conversación', () => {
    const fromFirstWork = selectConversationFromWork('42', {
      workId: 7,
      workName: 'Obra Norte',
    });
    const fromSecondWork = selectConversationFromWork('42', {
      workId: 9,
      workName: 'Obra Centro',
    });

    expect(fromFirstWork.selectedUserId).toBe('42');
    expect(fromSecondWork.selectedUserId).toBe('42');
    expect(fromSecondWork.activeWorkContext).toEqual({
      workId: 9,
      workName: 'Obra Centro',
    });
  });

  it('borra selección y contexto al cerrar la conversación', () => {
    expect(clearConversationSelection()).toEqual({
      selectedUserId: '',
      activeWorkContext: null,
      selectedWorkConversation: null,
    });
  });
});
