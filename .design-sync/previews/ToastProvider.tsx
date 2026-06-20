import { useEffect } from 'react';
import { ToastProvider, useToast, Button } from 'credentia';

function Emitter() {
  const toast = useToast();
  useEffect(() => {
    toast.success('Credential attested for Priya Raman');
    toast.info('AI estimate refreshed for 12 employees');
    toast.error('Verification request expired (SLA breach)');
  }, [toast]);
  return (
    <div style={{ padding: 16 }}>
      <Button variant="secondary" size="sm" onClick={() => toast.success('Saved')}>
        Trigger toast
      </Button>
      <p style={{ marginTop: 8, fontSize: 12, color: 'var(--ink-3)' }}>
        Toasts slide in top-right and auto-dismiss after 4s.
      </p>
    </div>
  );
}

export function Toasts() {
  return (
    <ToastProvider>
      <Emitter />
    </ToastProvider>
  );
}
