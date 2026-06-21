import { Modal, Button, VerifiedBadge } from 'credentia';

export function Confirm() {
  return (
    <Modal
      open
      onClose={() => {}}
      title="Attest this credential"
      description="You are confirming this as a verified fact on behalf of your organization."
      footer={
        <>
          <Button variant="ghost" size="sm">Cancel</Button>
          <Button variant="primary" size="sm">Confirm attestation</Button>
        </>
      }
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <VerifiedBadge label="Verified credential" />
        <span style={{ color: 'var(--ink-2)' }}>Senior Software Engineer · Priya Raman</span>
      </div>
      <p style={{ marginTop: 12 }}>
        Employment dates and title will be recorded as attested. This action is written to the
        tamper-evident audit log.
      </p>
    </Modal>
  );
}
