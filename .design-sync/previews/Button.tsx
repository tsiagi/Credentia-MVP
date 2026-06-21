import { Button } from 'credentia';
import { Plus, ArrowRight, ShieldCheck, Trash2 } from 'lucide-react';

const row: React.CSSProperties = { display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 };

export function Variants() {
  return (
    <div style={row}>
      <Button variant="primary">Request verification</Button>
      <Button variant="secondary">View profile</Button>
      <Button variant="ghost">Cancel</Button>
      <Button variant="destructive">Revoke access</Button>
    </div>
  );
}

export function Sizes() {
  return (
    <div style={row}>
      <Button size="sm" variant="primary">Approve</Button>
      <Button size="md" variant="primary">Approve credential</Button>
      <Button size="lg" variant="primary">Approve credential</Button>
    </div>
  );
}

export function WithIcons() {
  return (
    <div style={row}>
      <Button variant="primary" leadingIcon={<Plus size={15} />}>Add employee</Button>
      <Button variant="secondary" trailingIcon={<ArrowRight size={15} />}>Open dashboard</Button>
      <Button variant="secondary" leadingIcon={<ShieldCheck size={15} />}>Attest credential</Button>
    </div>
  );
}

export function States() {
  return (
    <div style={row}>
      <Button variant="primary" loading>Verifying</Button>
      <Button variant="primary" disabled>Submitted</Button>
      <Button variant="destructive" leadingIcon={<Trash2 size={15} />}>Remove</Button>
    </div>
  );
}

export function FullWidth() {
  return (
    <div style={{ width: 288 }}>
      <Button variant="primary" fullWidth leadingIcon={<ShieldCheck size={15} />}>
        Confirm verification request
      </Button>
    </div>
  );
}
